#!/usr/bin/env python3
"""
Parallel HPC simulation: one coroutine per (agent, vertical) cohort.
All cohorts run concurrently with a shared global semaphore for API rate control.
This maximises throughput by eliminating batch-tail-wait.
"""
import asyncio
import ast
import base64
import json
import logging
import os
import re
import sqlite3
import sys
import time

import aiohttp

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
PROMPTS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'production_prompts_from_docx.json')
HPC_MPC_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'hpc_mpc_data.json')

AUTH_URL = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
CLIENT_ID = 'tns-genvoy'
CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'
LLM_URL = 'http://genvoy.jarvis-prod.fkcloud.in/gemini-2.5-flash/:generateContent'
SUBSCRIPTION_KEY = '11d385c1c9d74983b826a8c1d6ffb10c'

GENERATION_CONFIG = {
    "maxOutputTokens": 500, "temperature": 0.0, "topP": 0.4,
    "topK": 32, "seed": 2025, "thinkingConfig": {"thinkingBudget": 0},
}

PROMPT_AGENT_TYPE = {
    'INTENT_RESONANCE_PROMPT': 'intent_resonance',
    'DECISION_DAMAGED_PRODUCT': 'decision', 'DECISION_MISSHIPMENT': 'decision',
    'DECISION_REMAINING': 'decision_remaining',
    'RISK_SIGNALS_PROMPT': 'risk_signals',
    'CATALOG_CORRECTNESS_PROMPT': 'catalog',
    'CX_VS_OBD_PROMPT': 'image', 'CX_VS_POD_PROMPT': 'image',
    'FK_PROMPT_1': 'image', 'FK_PROMPT_2': 'image',
    'FK_PROMPT_3': 'image', 'FK_PROMPT_4': 'image',
    'HL_PROMPT_1': 'image',
}

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)


class TokenManager:
    def __init__(self):
        self.token = None
        self.expires_at = 0
        self._lock = asyncio.Lock()

    async def get_token(self, session):
        if time.time() < self.expires_at - 60:
            return self.token
        async with self._lock:
            if time.time() < self.expires_at - 60:
                return self.token
            data = aiohttp.FormData()
            data.add_field('client_id', CLIENT_ID)
            data.add_field('client_secret', CLIENT_SECRET)
            data.add_field('grant_type', 'client_credentials')
            data.add_field('target_client_id', 'genvoy-authn-intrnl-prod')
            async with session.post(AUTH_URL, data=data) as resp:
                body = await resp.json()
                self.token = body['access_token']
                self.expires_at = time.time() + body.get('expires_in', 3000)
                return self.token


def extract_input_dict(prompt_text):
    start = prompt_text.find("Input Data:\n")
    if start == -1: return None
    dict_start = start + len("Input Data:\n")
    for marker in ["\nYour task is to output", "\n\nYour task"]:
        pos = prompt_text.find(marker, dict_start)
        if pos != -1:
            try: return ast.literal_eval(prompt_text[dict_start:pos].strip())
            except: pass
    return None


def extract_risk_features(prompt_text):
    for tag in ["**Input:**\n", "**Input:** \n"]:
        start = prompt_text.find(tag)
        if start != -1: break
    if start == -1: return None
    dict_start = start + prompt_text[start:].find('\n') + 1
    end = len(prompt_text)
    for marker in ["\n\nYour task", "\n\n# CLASSIFICATION", "\n\n---"]:
        pos = prompt_text.find(marker, dict_start)
        if pos != -1 and pos < end: end = pos
    try: return ast.literal_eval(prompt_text[dict_start:end].strip())
    except: return None


def assemble_prompt(record, production_prompts):
    prompt_id = record['prompt_id']
    agent_type = PROMPT_AGENT_TYPE.get(prompt_id, 'unknown')
    template = production_prompts.get(prompt_id, '')
    if not template:
        return '', []

    if agent_type == 'intent_resonance':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        return template + "\n" + str(input_data) + "\n---\n", []

    elif agent_type == 'decision':
        full_input = extract_input_dict(record['prompt'])
        if full_input is None:
            full_input = json.loads(record['input_data']) if record['input_data'] else {}
        return template + "\n" + str(full_input), []

    elif agent_type == 'decision_remaining':
        full_input = extract_input_dict(record['prompt'])
        if full_input is None:
            full_input = json.loads(record['input_data']) if record['input_data'] else {}
        return "You are an E-commerce Decision Engine.\n\nInput Data:\n" + str(full_input) + "\n\n" + template, []

    elif agent_type == 'risk_signals':
        risk_features = extract_risk_features(record['prompt'])
        if risk_features is None:
            risk_features = json.loads(record['input_data']) if record['input_data'] else {}
        if '# INPUT' in template:
            return template.replace("# INPUT", "# INPUT\n" + str(risk_features)), []
        return template + "\n\n# INPUT\n" + str(risk_features), []

    elif agent_type == 'catalog':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        metadata = json.dumps(input_data.get('product_attributes', {}), indent=2) if 'product_attributes' in input_data else ''
        assembled = template.replace('{metadata_details}', metadata)
        if '{metadata_details}' not in template:
            assembled = f"Product: {input_data.get('product_title', 'N/A')}\nVertical: {input_data.get('vertical', '')}\nSpecifications: {metadata}\n\n{assembled}"
        image_urls = [input_data['product_image']] if input_data.get('product_image') else []
        return assembled, image_urls

    elif agent_type == 'image':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        metadata_lines = [f"{k}: {input_data[k]}" for k in ['return_reason', 'return_sub_reason', 'vertical'] if input_data.get(k)]
        assembled = template + ("\n\n## Input Metadata\n" + "\n".join(metadata_lines) if metadata_lines else "")
        image_urls = []
        for key in ['product_image', 'customer_image_1_pnp_image_link',
                     'customer_image_2_pnp_image_link', 'customer_image_3_pnp_image_link',
                     'obd_image_1', 'obd_image_2', 'obd_image_3']:
            url = input_data.get(key, '')
            if url and url.startswith('http'): image_urls.append(url)
        cx_imgs = input_data.get('cx_images', [])
        if isinstance(cx_imgs, list):
            image_urls.extend(u for u in cx_imgs if isinstance(u, str) and u.startswith('http'))
        return assembled, image_urls

    return '', []


def parse_prediction(text, prompt_id):
    if not text: return ''
    m = re.search(r'\{[^{}]*\}', text, re.DOTALL)
    if m:
        try:
            r = json.loads(m.group())
            at = PROMPT_AGENT_TYPE.get(prompt_id, '')
            if at == 'intent_resonance': return r.get('resonance_label', '')
            if at in ('decision', 'decision_remaining'): return r.get('return_recommendation', '')
            if at == 'risk_signals': return r.get('risk_flag', '')
            if at == 'catalog': return r.get('catalog_checker_label', '')
            if at == 'image': return r.get('product_match', r.get('decision', ''))
            for k in ['decision', 'product_match', 'return_recommendation', 'resonance_label', 'risk_flag', 'catalog_checker_label']:
                if k in r: return str(r[k])
        except json.JSONDecodeError: pass
    return text.strip()[:100]


async def fetch_image_b64(session, url):
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                data = await resp.read()
                mime = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
                if mime in ('application/octet-stream', 'binary/octet-stream', ''):
                    mime = 'image/jpeg' if data[:3] == b'\xff\xd8\xff' else 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg'
                return base64.b64encode(data).decode(), mime
    except: pass
    return None, None


async def call_llm(session, token_mgr, text, image_urls, semaphore):
    async with semaphore:
        parts = []
        if image_urls:
            imgs = await asyncio.gather(*[fetch_image_b64(session, u) for u in image_urls[:5]])
            for b64, mime in imgs:
                if b64: parts.append({"inline_data": {"mime_type": mime, "data": b64}})
        parts.append({"text": text})
        payload = {"contents": [{"role": "user", "parts": parts}], "generationConfig": GENERATION_CONFIG}

        for attempt in range(3):
            token = await token_mgr.get_token(session)
            headers = {'Authorization': f'Bearer {token}', 'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY, 'Content-Type': 'application/json'}
            try:
                async with session.post(LLM_URL, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status == 200:
                        body = await resp.json()
                        cands = body.get('candidates', [])
                        if cands:
                            return ''.join(p.get('text', '') for p in cands[0].get('content', {}).get('parts', []) if 'text' in p)
                        return ''
                    elif resp.status == 429:
                        await asyncio.sleep(2 ** (attempt + 1))
                    elif resp.status == 401:
                        token_mgr.token = None
                        await asyncio.sleep(1)
                    else:
                        await asyncio.sleep(2 ** attempt)
            except asyncio.TimeoutError:
                await asyncio.sleep(2 ** attempt)
            except:
                await asyncio.sleep(2 ** attempt)
        return None


def save_results(results):
    if not results: return
    conn = sqlite3.connect(DB_PATH)
    conn.executemany("""
        INSERT OR REPLACE INTO simulation_results
        (record_id, prompt_id, agent, simulated_class, simulated_output,
         human_label, original_predicted, is_correct, simulated_at, error)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, results)
    conn.commit()
    conn.close()


async def process_cohort(cohort_name, records, session, token_mgr, production_prompts, semaphore, stats):
    results = []
    for record in records:
        text_prompt, image_urls = assemble_prompt(record, production_prompts)
        if not text_prompt:
            results.append((record['id'], record['prompt_id'], record['agent'], '', '', record['human_label'], record['predicted_class'], 0, '', 'empty_prompt'))
            stats['errors'] += 1
            continue

        resp = await call_llm(session, token_mgr, text_prompt, image_urls, semaphore)
        if resp is None:
            results.append((record['id'], record['prompt_id'], record['agent'], '', '', record['human_label'], record['predicted_class'], 0, '', 'api_failure'))
            stats['errors'] += 1
        else:
            pred = parse_prediction(resp, record['prompt_id'])
            is_correct = 1 if pred == record['human_label'] else 0
            results.append((record['id'], record['prompt_id'], record['agent'], pred, resp[:2000], record['human_label'], record['predicted_class'], is_correct, '', None))
            stats['processed'] += 1
            if is_correct: stats['correct'] += 1

        if len(results) >= 50:
            save_results(results)
            results = []

    save_results(results)
    log.info(f"  Cohort {cohort_name} done ({len(records)} records)")


async def main():
    concurrency = int(sys.argv[1]) if len(sys.argv) > 1 else 80

    with open(PROMPTS_PATH) as f:
        production_prompts = json.load(f)
    log.info(f"Loaded {len(production_prompts)} prompt templates")

    hpc_data = json.load(open(HPC_MPC_PATH))
    hpc_pairs = set()
    for key, val in hpc_data.get('lookup', {}).items():
        if val == 'HPC':
            v, r = key.split('|')
            hpc_pairs.add((v, r))
    log.info(f"HPC pairs: {len(hpc_pairs)}")

    conn = sqlite3.connect(DB_PATH)
    completed = set(r[0] for r in conn.execute("SELECT record_id FROM simulation_results").fetchall())
    log.info(f"Already completed: {len(completed):,}")

    conn.execute("CREATE TEMP TABLE hpc_f (vertical TEXT, return_reason TEXT)")
    conn.executemany("INSERT INTO hpc_f VALUES (?,?)", list(hpc_pairs))
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT id, agent, vertical, return_reason, marketplace,
               predicted_class, human_label, prompt_id, prompt, input_data
        FROM records
        WHERE EXISTS (SELECT 1 FROM hpc_f h WHERE h.vertical = records.vertical
                      AND h.return_reason = records.return_reason)
        ORDER BY agent, vertical
    """).fetchall()
    conn.close()

    cohorts = {}
    skipped = 0
    for r in rows:
        if r['id'] in completed:
            skipped += 1
            continue
        key = f"{r['agent']}|{r['vertical']}"
        if key not in cohorts:
            cohorts[key] = []
        cohorts[key].append({
            'id': r['id'], 'agent': r['agent'], 'vertical': r['vertical'],
            'return_reason': r['return_reason'], 'marketplace': r['marketplace'],
            'predicted_class': r['predicted_class'] or '', 'human_label': r['human_label'] or '',
            'prompt_id': r['prompt_id'] or '', 'prompt': r['prompt'] or '',
            'input_data': r['input_data'] or '',
        })

    total_remaining = sum(len(v) for v in cohorts.values())
    log.info(f"Skipped {skipped:,} completed, {total_remaining:,} remaining across {len(cohorts)} cohorts")
    log.info(f"Global concurrency: {concurrency}")

    token_mgr = TokenManager()
    semaphore = asyncio.Semaphore(concurrency)
    stats = {'processed': 0, 'correct': 0, 'errors': 0}

    connector = aiohttp.TCPConnector(limit=concurrency * 2)
    async with aiohttp.ClientSession(connector=connector) as session:
        await token_mgr.get_token(session)

        tasks = []
        for cohort_name, records in cohorts.items():
            tasks.append(process_cohort(cohort_name, records, session, token_mgr, production_prompts, semaphore, stats))

        log.info(f"Launching {len(tasks)} cohort coroutines...")
        start = time.time()

        done_count = 0
        for coro in asyncio.as_completed(tasks):
            await coro
            done_count += 1
            elapsed = time.time() - start
            total_done = stats['processed'] + stats['errors']
            rate = total_done / elapsed if elapsed > 0 else 0
            eta = (total_remaining - total_done) / rate if rate > 0 else 0
            acc = stats['correct'] / stats['processed'] if stats['processed'] > 0 else 0
            if done_count % 10 == 0 or done_count == len(tasks):
                log.info(
                    f"Progress: {total_done:,}/{total_remaining:,} ({total_done*100//max(total_remaining,1)}%) | "
                    f"Rate: {rate:.1f}/s | ETA: {eta/60:.0f}min | "
                    f"Acc: {acc:.3f} | Cohorts: {done_count}/{len(tasks)}"
                )

    elapsed = time.time() - start
    log.info(f"DONE: {stats['processed']:,} processed, {stats['errors']:,} errors, "
             f"{stats['correct']:,} correct, {elapsed/60:.1f}min")


if __name__ == '__main__':
    asyncio.run(main())
