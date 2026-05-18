#!/usr/bin/env python3
"""
Re-simulate records through current production prompts via Genvoy Gemini API.

Streams records from DB in batches to avoid memory issues.
Supports filtering by agent, prompt_id, and HPC/MPC cohort.

Usage:
    python3 scripts/simulate_production.py --hpc --concurrency 15 --resume
    python3 scripts/simulate_production.py --agent decision_agent --limit 100
    python3 scripts/simulate_production.py --dry-run
"""

import argparse
import ast
import asyncio
import base64
import json
import logging
import os
import re
import sqlite3
import time
from collections import defaultdict
from datetime import datetime

import aiohttp

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
PROMPTS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'production_prompts_from_docx.json')
HPC_MPC_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'hpc_mpc_data.json')
CHECKPOINT_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'simulation_checkpoint.json')
LOG_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'simulation.log')

AUTH_URL = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
CLIENT_ID = 'tns-genvoy'
CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'

LLM_URL = 'http://genvoy.jarvis-prod.fkcloud.in/gemini-2.5-flash/:generateContent'
SUBSCRIPTION_KEY = '11d385c1c9d74983b826a8c1d6ffb10c'

GENERATION_CONFIG = {
    "maxOutputTokens": 500,
    "temperature": 0.0,
    "topP": 0.4,
    "topK": 32,
    "seed": 2025,
    "thinkingConfig": {"thinkingBudget": 0},
}

MISSING_TEMPLATES = {'CX_VS_POD_PROMPT', 'HL_PROMPT_1'}

PROMPT_AGENT_TYPE = {
    'INTENT_RESONANCE_PROMPT': 'intent_resonance',
    'DECISION_DAMAGED_PRODUCT': 'decision',
    'DECISION_MISSHIPMENT': 'decision',
    'DECISION_REMAINING': 'decision_remaining',
    'RISK_SIGNALS_PROMPT': 'risk_signals',
    'CATALOG_CORRECTNESS_PROMPT': 'catalog',
    'CX_VS_OBD_PROMPT': 'image',
    'CX_VS_POD_PROMPT': 'image',
    'FK_PROMPT_1': 'image',
    'FK_PROMPT_2': 'image',
    'FK_PROMPT_3': 'image',
    'FK_PROMPT_4': 'image',
    'HL_PROMPT_1': 'image',
}

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


def load_hpc_mpc_pairs(classification='HPC'):
    if not os.path.exists(HPC_MPC_PATH):
        return set()
    with open(HPC_MPC_PATH) as f:
        lookup = json.load(f).get('lookup', {})
    return {tuple(k.split('|')) for k, v in lookup.items() if v == classification}


class TokenManager:
    def __init__(self):
        self.token = None
        self.expires_at = 0
        self._lock = asyncio.Lock()

    async def get_token(self, session):
        async with self._lock:
            if time.time() < self.expires_at - 120:
                return self.token
            log.info("Refreshing OAuth token...")
            data = aiohttp.FormData()
            data.add_field('client_id', CLIENT_ID)
            data.add_field('client_secret', CLIENT_SECRET)
            data.add_field('grant_type', 'client_credentials')
            data.add_field('target_client_id', 'genvoy-authn-intrnl-prod')
            async with session.post(AUTH_URL, data=data) as resp:
                body = await resp.json()
                self.token = body['access_token']
                self.expires_at = time.time() + body.get('expires_in', 3000)
                log.info(f"Token refreshed, expires in {body.get('expires_in', '?')}s")
                return self.token


def load_production_prompts():
    with open(PROMPTS_PATH) as f:
        return json.load(f)


def extract_input_dict_from_decision_prompt(prompt_text):
    start = prompt_text.find("Input Data:\n")
    if start == -1:
        return None
    dict_start = start + len("Input Data:\n")
    task_marker = prompt_text.find("\nYour task is to output", dict_start)
    if task_marker == -1:
        task_marker = prompt_text.find("\n\nYour task", dict_start)
    if task_marker == -1:
        return None
    dict_text = prompt_text[dict_start:task_marker].strip()
    try:
        return ast.literal_eval(dict_text)
    except Exception:
        return None


def extract_risk_features_from_prompt(prompt_text):
    start = prompt_text.find("**Input:**\n")
    if start == -1:
        start = prompt_text.find("**Input:** \n")
    if start == -1:
        return None
    dict_start = start + prompt_text[start:].find('\n') + 1
    end_markers = ["\n\nYour task", "\n\n# CLASSIFICATION", "\n\n---"]
    end = len(prompt_text)
    for marker in end_markers:
        pos = prompt_text.find(marker, dict_start)
        if pos != -1 and pos < end:
            end = pos
    dict_text = prompt_text[dict_start:end].strip()
    try:
        return ast.literal_eval(dict_text)
    except Exception:
        return None


def assemble_prompt(record, production_prompts):
    prompt_id = record['prompt_id']
    agent_type = PROMPT_AGENT_TYPE.get(prompt_id, 'unknown')

    if prompt_id in MISSING_TEMPLATES or prompt_id not in production_prompts:
        return record['prompt'], []

    template = production_prompts[prompt_id]

    if agent_type == 'intent_resonance':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        return template + "\n" + str(input_data) + "\n---\n", []

    elif agent_type == 'decision':
        full_input = extract_input_dict_from_decision_prompt(record['prompt'])
        if full_input is None:
            full_input = json.loads(record['input_data']) if record['input_data'] else {}
        if template.rstrip().endswith('## INPUT'):
            assembled = template + "\n" + str(full_input)
        else:
            assembled = template + "\n\n## INPUT\n" + str(full_input)
        return assembled, []

    elif agent_type == 'decision_remaining':
        full_input = extract_input_dict_from_decision_prompt(record['prompt'])
        if full_input is None:
            full_input = json.loads(record['input_data']) if record['input_data'] else {}
        assembled = (
            "You are an E-commerce Decision Engine for Return Adjudication.\n\n"
            "Input Data:\n" + str(full_input) + "\n\n" + template
        )
        return assembled, []

    elif agent_type == 'risk_signals':
        risk_features = extract_risk_features_from_prompt(record['prompt'])
        if risk_features is None:
            input_data = json.loads(record['input_data']) if record['input_data'] else {}
            risk_features = input_data
        assembled = template.replace("# INPUT", "# INPUT\n" + str(risk_features))
        return assembled, []

    elif agent_type == 'catalog':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        metadata = ""
        if 'product_attributes' in input_data:
            metadata = json.dumps(input_data['product_attributes'], indent=2)
        assembled = template.replace('{metadata_details}', metadata)
        if 'vertical' in input_data:
            assembled = f"Product: {input_data.get('product_title', 'N/A')}\nVertical: {input_data['vertical']}\nSpecifications: {metadata}\n\n{assembled}"
        image_urls = []
        if input_data.get('product_image'):
            image_urls.append(input_data['product_image'])
        return assembled, image_urls

    elif agent_type == 'image':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        metadata_lines = []
        for key in ['return_reason', 'return_sub_reason', 'vertical']:
            if input_data.get(key):
                metadata_lines.append(f"{key}: {input_data[key]}")
        if metadata_lines:
            assembled = template + "\n\n## Input Metadata\n" + "\n".join(metadata_lines)
        else:
            assembled = template
        image_urls = []
        for key in ['product_image', 'customer_image_1_pnp_image_link',
                     'customer_image_2_pnp_image_link', 'customer_image_3_pnp_image_link',
                     'obd_image_1', 'obd_image_2', 'obd_image_3']:
            url = input_data.get(key, '')
            if url and url.startswith('http'):
                image_urls.append(url)
        cx_images = input_data.get('cx_images', [])
        if isinstance(cx_images, list):
            for url in cx_images:
                if isinstance(url, str) and url.startswith('http'):
                    image_urls.append(url)
        return assembled, image_urls

    else:
        return record['prompt'], []


async def fetch_image_as_base64(session, url, timeout=15):
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
            if resp.status == 200:
                data = await resp.read()
                content_type = resp.headers.get('Content-Type', 'image/jpeg')
                mime = content_type.split(';')[0].strip()
                if mime in ('application/octet-stream', 'binary/octet-stream', ''):
                    if data[:3] == b'\xff\xd8\xff':
                        mime = 'image/jpeg'
                    elif data[:8] == b'\x89PNG\r\n\x1a\n':
                        mime = 'image/png'
                    elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
                        mime = 'image/webp'
                    else:
                        mime = 'image/jpeg'
                return base64.b64encode(data).decode('utf-8'), mime
    except Exception:
        pass
    return None, None


def build_gemini_payload(text_prompt, image_data_list=None):
    parts = []
    if image_data_list:
        for b64_data, mime_type in image_data_list:
            if b64_data:
                parts.append({
                    "inline_data": {
                        "mime_type": mime_type or "image/jpeg",
                        "data": b64_data,
                    }
                })
    parts.append({"text": text_prompt})
    return {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": GENERATION_CONFIG,
    }


def parse_prediction(response_text, prompt_id):
    if not response_text:
        return '', response_text or ''

    json_match = re.search(r'\{[^{}]*\}', response_text, re.DOTALL)
    if json_match:
        try:
            result = json.loads(json_match.group())
            agent_type = PROMPT_AGENT_TYPE.get(prompt_id, '')
            if agent_type == 'intent_resonance':
                return result.get('resonance_label', ''), response_text
            elif agent_type in ('decision', 'decision_remaining'):
                return result.get('return_recommendation', ''), response_text
            elif agent_type == 'risk_signals':
                return result.get('risk_flag', ''), response_text
            elif agent_type == 'catalog':
                return result.get('catalog_checker_label', ''), response_text
            elif agent_type == 'image':
                return result.get('product_match', result.get('decision', '')), response_text
            for key in ['decision', 'label', 'prediction', 'product_match',
                        'return_recommendation', 'resonance_label', 'risk_flag',
                        'catalog_checker_label']:
                if key in result:
                    return str(result[key]), response_text
        except json.JSONDecodeError:
            pass

    return response_text.strip()[:100], response_text


async def call_llm(session, token_mgr, text_prompt, image_urls=None, max_retries=3):
    image_data_list = []
    if image_urls:
        tasks = [fetch_image_as_base64(session, url) for url in image_urls[:5]]
        results = await asyncio.gather(*tasks)
        image_data_list = [(b64, mime) for b64, mime in results if b64]

    payload = build_gemini_payload(text_prompt, image_data_list if image_data_list else None)

    for attempt in range(max_retries):
        token = await token_mgr.get_token(session)
        headers = {
            'Authorization': f'Bearer {token}',
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
            'Content-Type': 'application/json',
        }
        try:
            async with session.post(
                LLM_URL, json=payload, headers=headers,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as resp:
                if resp.status == 200:
                    body = await resp.json()
                    candidates = body.get('candidates', [])
                    if candidates:
                        parts = candidates[0].get('content', {}).get('parts', [])
                        text_parts = [p.get('text', '') for p in parts if 'text' in p]
                        return ''.join(text_parts)
                    return ''
                elif resp.status == 429:
                    wait = 2 ** (attempt + 1)
                    log.warning(f"Rate limited, waiting {wait}s...")
                    await asyncio.sleep(wait)
                elif resp.status == 401:
                    token_mgr.token = None
                    await asyncio.sleep(1)
                else:
                    error_text = await resp.text()
                    log.warning(f"API error {resp.status}: {error_text[:200]}")
                    await asyncio.sleep(2 ** attempt)
        except asyncio.TimeoutError:
            log.warning(f"Timeout on attempt {attempt + 1}")
            await asyncio.sleep(2 ** attempt)
        except Exception as e:
            log.warning(f"Request error: {e}")
            await asyncio.sleep(2 ** attempt)

    return None


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS simulation_results (
            record_id INTEGER PRIMARY KEY,
            prompt_id TEXT,
            agent TEXT,
            simulated_class TEXT,
            simulated_output TEXT,
            human_label TEXT,
            original_predicted TEXT,
            is_correct INTEGER,
            simulated_at TEXT,
            error TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sim_agent ON simulation_results(agent)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sim_prompt ON simulation_results(prompt_id)")
    conn.commit()
    conn.close()
    log.info("simulation_results table ready")


def get_completed_ids():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT record_id FROM simulation_results WHERE error IS NULL").fetchall()
    conn.close()
    return {r[0] for r in rows}


def build_cohort_filter_sql(hpc_pairs):
    """Build SQL WHERE clause for HPC/MPC filtering."""
    if not hpc_pairs:
        return "", []
    conditions = []
    params = []
    for vert, reason in hpc_pairs:
        conditions.append("(vertical = ? AND return_reason = ?)")
        params.extend([vert, reason])
    return "(" + " OR ".join(conditions) + ")", params


def get_filtered_ids(agent_filter=None, prompt_filter=None, cohort_pairs=None,
                     limit=None, completed_ids=None,
                     agent_like=None, agent_not_like=None):
    """Pre-compute the list of record IDs to process using lightweight queries."""
    conn = sqlite3.connect(DB_PATH)

    # Use a temp table for cohort filtering if needed
    if cohort_pairs:
        conn.execute("CREATE TEMP TABLE IF NOT EXISTS hpc_filter (vertical TEXT, return_reason TEXT)")
        conn.execute("DELETE FROM hpc_filter")
        conn.executemany("INSERT INTO hpc_filter VALUES (?, ?)", list(cohort_pairs))
        conn.execute("CREATE INDEX IF NOT EXISTS temp.idx_hpc ON hpc_filter(vertical, return_reason)")

    query = "SELECT id FROM records"
    conditions = []
    params = []

    if agent_filter:
        conditions.append("agent = ?")
        params.append(agent_filter)
    if agent_like:
        conditions.append("agent LIKE ?")
        params.append(agent_like)
    if agent_not_like:
        conditions.append("agent NOT LIKE ?")
        params.append(agent_not_like)
    if prompt_filter:
        conditions.append("prompt_id = ?")
        params.append(prompt_filter)
    if cohort_pairs:
        conditions.append(
            "EXISTS (SELECT 1 FROM hpc_filter h WHERE h.vertical = records.vertical "
            "AND h.return_reason = records.return_reason)"
        )

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE WHEN agent LIKE 'image_%' THEN 0 ELSE 1 END, id"
    if limit:
        query += f" LIMIT {limit}"

    log.info(f"Querying record IDs...")
    ids = [r[0] for r in conn.execute(query, params).fetchall()]
    conn.close()

    if completed_ids:
        before = len(ids)
        ids = [i for i in ids if i not in completed_ids]
        log.info(f"Filtered: {before:,} total -> {len(ids):,} remaining (skipped {before-len(ids):,} completed)")

    return ids


def iter_record_batches_by_ids(record_ids, batch_size=200):
    """Fetch records by pre-computed IDs in batches."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    for i in range(0, len(record_ids), batch_size):
        id_batch = record_ids[i:i + batch_size]
        placeholders = ','.join(['?'] * len(id_batch))
        rows = conn.execute(f"""
            SELECT id, agent, vertical, return_reason, marketplace,
                   predicted_class, human_label, prompt_id, prompt, input_data
            FROM records WHERE id IN ({placeholders}) ORDER BY id
        """, id_batch).fetchall()

        batch = []
        for r in rows:
            batch.append({
                'id': r['id'],
                'agent': r['agent'],
                'vertical': r['vertical'],
                'return_reason': r['return_reason'],
                'marketplace': r['marketplace'],
                'predicted_class': r['predicted_class'] or '',
                'human_label': r['human_label'] or '',
                'prompt_id': r['prompt_id'] or '',
                'prompt': r['prompt'] or '',
                'input_data': r['input_data'] or '',
            })
        if batch:
            yield batch

    conn.close()


def save_results_batch(results):
    if not results:
        return
    conn = sqlite3.connect(DB_PATH)
    conn.executemany("""
        INSERT OR REPLACE INTO simulation_results
        (record_id, prompt_id, agent, simulated_class, simulated_output,
         human_label, original_predicted, is_correct, simulated_at, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, results)
    conn.commit()
    conn.close()


def save_checkpoint(state):
    with open(CHECKPOINT_PATH, 'w') as f:
        json.dump(state, f)


async def process_batch(records, session, token_mgr, production_prompts, semaphore, stats):
    results = []

    async def process_one(record):
        async with semaphore:
            try:
                text_prompt, image_urls = assemble_prompt(record, production_prompts)
                if not text_prompt:
                    results.append((
                        record['id'], record['prompt_id'], record['agent'],
                        '', '', record['human_label'], record['predicted_class'],
                        0, datetime.utcnow().isoformat(), 'empty_prompt'
                    ))
                    stats['errors'] += 1
                    return

                response_text = await call_llm(session, token_mgr, text_prompt, image_urls)

                if response_text is None:
                    results.append((
                        record['id'], record['prompt_id'], record['agent'],
                        '', '', record['human_label'], record['predicted_class'],
                        0, datetime.utcnow().isoformat(), 'api_failure'
                    ))
                    stats['errors'] += 1
                    return

                predicted, full_output = parse_prediction(response_text, record['prompt_id'])
                is_correct = 1 if predicted == record['human_label'] else 0

                results.append((
                    record['id'], record['prompt_id'], record['agent'],
                    predicted, full_output[:2000],
                    record['human_label'], record['predicted_class'],
                    is_correct, datetime.utcnow().isoformat(), None
                ))

                stats['processed'] += 1
                if is_correct:
                    stats['correct'] += 1

            except Exception as e:
                results.append((
                    record['id'], record['prompt_id'], record['agent'],
                    '', '', record['human_label'], record['predicted_class'],
                    0, datetime.utcnow().isoformat(), str(e)[:200]
                ))
                stats['errors'] += 1

    tasks = [process_one(r) for r in records]
    await asyncio.gather(*tasks)
    return results


async def run_simulation(args):
    production_prompts = load_production_prompts()
    log.info(f"Loaded {len(production_prompts)} production prompt templates")

    init_db()

    cohort_pairs = None
    if args.hpc:
        cohort_pairs = load_hpc_mpc_pairs('HPC')
        log.info(f"HPC filter: {len(cohort_pairs)} vertical|reason pairs")
    elif args.mpc:
        cohort_pairs = load_hpc_mpc_pairs('MPC')
        log.info(f"MPC filter: {len(cohort_pairs)} vertical|reason pairs")

    completed_ids = None
    if args.resume:
        completed_ids = get_completed_ids()
        log.info(f"Resume mode: {len(completed_ids):,} already completed")

    # Get filtered record IDs (lightweight query on ID column)
    record_ids = get_filtered_ids(
        agent_filter=args.agent, prompt_filter=args.prompt_id,
        cohort_pairs=cohort_pairs, limit=args.limit,
        completed_ids=completed_ids,
        agent_like=args.agent_like, agent_not_like=args.agent_not_like,
    )
    log.info(f"Records to process: {len(record_ids):,}")

    if not record_ids:
        log.info("No records to process!")
        return

    if args.dry_run:
        log.info("DRY RUN — testing prompt assembly on first batch...")
        seen_agents = set()
        for batch in iter_record_batches_by_ids(record_ids[:200], batch_size=200):
            for r in batch:
                if r['agent'] not in seen_agents:
                    seen_agents.add(r['agent'])
                    text, imgs = assemble_prompt(r, production_prompts)
                    log.info(f"  {r['agent']} ({r['prompt_id']}): prompt={len(text)} chars, images={len(imgs)}")
        log.info(f"Would process {len(record_ids):,} records across {len(seen_agents)}+ agents")
        return

    token_mgr = TokenManager()
    semaphore = asyncio.Semaphore(args.concurrency)
    stats = {'processed': 0, 'correct': 0, 'errors': 0, 'total': len(record_ids)}

    batch_size = 1000
    start_time = time.time()
    batch_num = 0

    connector = aiohttp.TCPConnector(limit=args.concurrency * 2)
    async with aiohttp.ClientSession(connector=connector) as session:
        await token_mgr.get_token(session)

        for batch in iter_record_batches_by_ids(record_ids, batch_size=batch_size):
            results = await process_batch(batch, session, token_mgr, production_prompts, semaphore, stats)
            save_results_batch(results)
            batch_num += 1

            done = stats['processed'] + stats['errors']
            elapsed = time.time() - start_time
            rate = done / elapsed if elapsed > 0 else 0
            eta_seconds = (stats['total'] - done) / rate if rate > 0 else 0
            accuracy = stats['correct'] / stats['processed'] if stats['processed'] > 0 else 0

            if batch_num % 5 == 0 or done >= stats['total']:
                pct = done * 100 // max(stats['total'], 1)
                log.info(
                    f"Progress: {done:,}/{stats['total']:,} ({pct}%) | "
                    f"Rate: {rate:.1f}/s | ETA: {eta_seconds/3600:.1f}h | "
                    f"Acc: {accuracy:.3f} | Errors: {stats['errors']:,}"
                )

            save_checkpoint({
                'batch_num': batch_num,
                'processed': stats['processed'],
                'errors': stats['errors'],
                'correct': stats['correct'],
                'total': stats['total'],
                'elapsed_seconds': elapsed,
            })

    elapsed = time.time() - start_time
    log.info("=" * 60)
    log.info("SIMULATION COMPLETE")
    log.info(f"  Total processed: {stats['processed']:,}")
    log.info(f"  Errors: {stats['errors']:,}")
    log.info(f"  Correct: {stats['correct']:,}")
    log.info(f"  Accuracy: {stats['correct']/max(stats['processed'],1):.4f}")
    log.info(f"  Time: {elapsed/3600:.1f}h ({elapsed:.0f}s)")
    log.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(description='Re-simulate records through production prompts')
    parser.add_argument('--concurrency', type=int, default=15, help='Concurrent API calls')
    parser.add_argument('--agent', type=str, help='Filter by agent name')
    parser.add_argument('--agent-like', type=str, help='Filter agent LIKE pattern (e.g. image_%)')
    parser.add_argument('--agent-not-like', type=str, help='Exclude agent LIKE pattern')
    parser.add_argument('--prompt-id', type=str, help='Filter by prompt_id')
    parser.add_argument('--limit', type=int, help='Max records to process')
    parser.add_argument('--hpc', action='store_true', help='Only HPC cohorts')
    parser.add_argument('--mpc', action='store_true', help='Only MPC cohorts')
    parser.add_argument('--resume', action='store_true', help='Skip already-completed records')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    args = parser.parse_args()

    asyncio.run(run_simulation(args))


if __name__ == '__main__':
    main()
