#!/usr/bin/env python3
"""
Ad-hoc prompt simulation for the Prompt Playground.
Reads a custom prompt from stdin, samples records from labelling.db matching
the cohort filters, runs them through Genvoy Gemini, and outputs JSON metrics.

Called by the Express server — not meant to be run directly.
"""

import argparse
import ast
import asyncio
import base64
import json
import os
import re
import sqlite3
import sys
import time

import aiohttp

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


class TokenManager:
    def __init__(self):
        self.token = None
        self.expires_at = 0

    async def get_token(self, session):
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


def extract_input_from_decision_prompt(prompt_text):
    start = prompt_text.find("Input Data:\n")
    if start == -1:
        return None
    dict_start = start + len("Input Data:\n")
    task_marker = prompt_text.find("\nYour task is to output", dict_start)
    if task_marker == -1:
        task_marker = prompt_text.find("\n\nYour task", dict_start)
    if task_marker == -1:
        return None
    try:
        return ast.literal_eval(prompt_text[dict_start:task_marker].strip())
    except Exception:
        return None


def extract_risk_features(prompt_text):
    start = prompt_text.find("**Input:**\n")
    if start == -1:
        start = prompt_text.find("**Input:** \n")
    if start == -1:
        return None
    dict_start = start + prompt_text[start:].find('\n') + 1
    end = len(prompt_text)
    for marker in ["\n\nYour task", "\n\n# CLASSIFICATION", "\n\n---"]:
        pos = prompt_text.find(marker, dict_start)
        if pos != -1 and pos < end:
            end = pos
    try:
        return ast.literal_eval(prompt_text[dict_start:end].strip())
    except Exception:
        return None


def assemble_custom_prompt(record, custom_prompt):
    """Inject record's input data into the user's custom prompt."""
    prompt_id = record['prompt_id']
    agent_type = PROMPT_AGENT_TYPE.get(prompt_id, 'unknown')

    if agent_type == 'intent_resonance':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        return custom_prompt + "\n" + str(input_data) + "\n---\n", []

    elif agent_type in ('decision', 'decision_remaining'):
        full_input = extract_input_from_decision_prompt(record['prompt'])
        if full_input is None:
            full_input = json.loads(record['input_data']) if record['input_data'] else {}
        if '## INPUT' in custom_prompt or '# INPUT' in custom_prompt:
            assembled = custom_prompt + "\n" + str(full_input)
        else:
            assembled = custom_prompt + "\n\nInput Data:\n" + str(full_input)
        return assembled, []

    elif agent_type == 'risk_signals':
        risk_features = extract_risk_features(record['prompt'])
        if risk_features is None:
            risk_features = json.loads(record['input_data']) if record['input_data'] else {}
        if '# INPUT' in custom_prompt:
            assembled = custom_prompt.replace("# INPUT", "# INPUT\n" + str(risk_features))
        else:
            assembled = custom_prompt + "\n\n# INPUT\n" + str(risk_features)
        return assembled, []

    elif agent_type == 'catalog':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        metadata = json.dumps(input_data.get('product_attributes', {}), indent=2) if 'product_attributes' in input_data else ''
        assembled = custom_prompt.replace('{metadata_details}', metadata)
        if '{metadata_details}' not in custom_prompt:
            assembled = f"Product: {input_data.get('product_title', 'N/A')}\nVertical: {input_data.get('vertical', '')}\nSpecifications: {metadata}\n\n{assembled}"
        image_urls = [input_data['product_image']] if input_data.get('product_image') else []
        return assembled, image_urls

    elif agent_type == 'image':
        input_data = json.loads(record['input_data']) if record['input_data'] else {}
        metadata_lines = [f"{k}: {input_data[k]}" for k in ['return_reason', 'return_sub_reason', 'vertical'] if input_data.get(k)]
        assembled = custom_prompt + ("\n\n## Input Metadata\n" + "\n".join(metadata_lines) if metadata_lines else "")
        image_urls = []
        for key in ['product_image', 'customer_image_1_pnp_image_link',
                     'customer_image_2_pnp_image_link', 'customer_image_3_pnp_image_link',
                     'obd_image_1', 'obd_image_2', 'obd_image_3']:
            url = input_data.get(key, '')
            if url and url.startswith('http'):
                image_urls.append(url)
        cx_imgs = input_data.get('cx_images', [])
        if isinstance(cx_imgs, list):
            image_urls.extend(u for u in cx_imgs if isinstance(u, str) and u.startswith('http'))
        return assembled, image_urls

    else:
        return custom_prompt, []


async def fetch_image_b64(session, url):
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                data = await resp.read()
                mime = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()
                if mime in ('application/octet-stream', 'binary/octet-stream', ''):
                    mime = 'image/jpeg' if data[:3] == b'\xff\xd8\xff' else 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg'
                return base64.b64encode(data).decode(), mime
    except Exception:
        pass
    return None, None


async def call_llm(session, token_mgr, text, image_urls=None):
    parts = []
    if image_urls:
        imgs = await asyncio.gather(*[fetch_image_b64(session, u) for u in image_urls[:5]])
        for b64, mime in imgs:
            if b64:
                parts.append({"inline_data": {"mime_type": mime, "data": b64}})
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
                else:
                    await asyncio.sleep(1)
        except Exception:
            await asyncio.sleep(1)
    return None


def parse_prediction(text, prompt_id):
    if not text:
        return ''
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
        except json.JSONDecodeError:
            pass
    return text.strip()[:100]


def compute_metrics(predictions, human_labels):
    total = len(predictions)
    if total == 0:
        return {'total': 0, 'accuracy': 0, 'per_class': {}}

    correct = sum(1 for p, h in zip(predictions, human_labels) if p == h)
    classes = sorted(set(predictions) | set(human_labels))

    per_class = {}
    for cls in classes:
        if not cls: continue
        tp = sum(1 for p, h in zip(predictions, human_labels) if p == cls and h == cls)
        fp = sum(1 for p, h in zip(predictions, human_labels) if p == cls and h != cls)
        fn = sum(1 for p, h in zip(predictions, human_labels) if p != cls and h == cls)
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
        per_class[cls] = {'precision': round(prec, 4), 'recall': round(rec, 4), 'f1': round(f1, 4), 'support': tp + fn}

    macro_p = sum(c['precision'] for c in per_class.values()) / len(per_class) if per_class else 0
    macro_r = sum(c['recall'] for c in per_class.values()) / len(per_class) if per_class else 0
    macro_f1 = sum(c['f1'] for c in per_class.values()) / len(per_class) if per_class else 0

    return {
        'total': total, 'correct': correct,
        'accuracy': round(correct / total, 4),
        'macro_precision': round(macro_p, 4),
        'macro_recall': round(macro_r, 4),
        'macro_f1': round(macro_f1, 4),
        'per_class': per_class,
    }


def load_sample_records(db_path, agent=None, vertical=None, return_reason=None,
                        marketplace=None, sample_size=50):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    query = "SELECT id, agent, vertical, return_reason, marketplace, predicted_class, human_label, prompt_id, prompt, input_data FROM records"
    conditions = []
    params = []
    if agent:
        conditions.append("agent = ?")
        params.append(agent)
    if vertical:
        conditions.append("vertical = ?")
        params.append(vertical)
    if return_reason:
        conditions.append("return_reason = ?")
        params.append(return_reason)
    if marketplace:
        conditions.append("marketplace = ?")
        params.append(marketplace)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += f" ORDER BY RANDOM() LIMIT {sample_size}"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    return [{
        'id': r['id'], 'agent': r['agent'], 'vertical': r['vertical'],
        'return_reason': r['return_reason'], 'marketplace': r['marketplace'],
        'predicted_class': r['predicted_class'] or '', 'human_label': r['human_label'] or '',
        'prompt_id': r['prompt_id'] or '', 'prompt': r['prompt'] or '',
        'input_data': r['input_data'] or '',
    } for r in rows]


def load_existing_sim_metrics(db_path, record_ids):
    """Load existing simulation results for comparison."""
    if not record_ids:
        return {}
    conn = sqlite3.connect(db_path)
    placeholders = ','.join(['?'] * len(record_ids))
    rows = conn.execute(
        f"SELECT record_id, simulated_class FROM simulation_results WHERE record_id IN ({placeholders}) AND error IS NULL",
        record_ids
    ).fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}


async def run_playground(args, custom_prompt):
    records = load_sample_records(
        args.db, agent=args.agent, vertical=args.vertical,
        return_reason=args.return_reason, marketplace=args.marketplace,
        sample_size=args.sample_size,
    )

    if not records:
        print(json.dumps({"error": "No records match the selected filters"}))
        return

    record_ids = [r['id'] for r in records]
    sim_lookup = load_existing_sim_metrics(args.db, record_ids)

    token_mgr = TokenManager()
    semaphore = asyncio.Semaphore(10)

    new_predictions = []
    details = []

    async def process_one(record):
        async with semaphore:
            text, imgs = assemble_custom_prompt(record, custom_prompt)
            resp = await call_llm(session, token_mgr, text, imgs)
            pred = parse_prediction(resp, record['prompt_id']) if resp else ''
            new_predictions.append(pred)
            details.append({
                'id': record['id'],
                'human_label': record['human_label'],
                'original_predicted': record['predicted_class'],
                'simulated_predicted': sim_lookup.get(record['id'], ''),
                'new_predicted': pred,
                'new_correct': pred == record['human_label'],
            })

    connector = aiohttp.TCPConnector(limit=15)
    async with aiohttp.ClientSession(connector=connector) as session:
        await token_mgr.get_token(session)
        await asyncio.gather(*[process_one(r) for r in records])

    human_labels = [r['human_label'] for r in records]
    original_preds = [r['predicted_class'] for r in records]
    sim_preds = [sim_lookup.get(r['id'], '') for r in records]
    sim_preds_filtered = [p for p in sim_preds if p]

    result = {
        'sample_size': len(records),
        'labelling_metrics': compute_metrics(original_preds, human_labels),
        'new_prompt_metrics': compute_metrics(new_predictions, human_labels),
        'details': details,
    }

    if sim_preds_filtered:
        sim_human = [h for h, p in zip(human_labels, sim_preds) if p]
        result['current_production_metrics'] = compute_metrics(sim_preds_filtered, sim_human)
    else:
        result['current_production_metrics'] = None

    print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True)
    parser.add_argument('--prompts', required=True)
    parser.add_argument('--sample-size', type=int, default=50)
    parser.add_argument('--agent', default=None)
    parser.add_argument('--vertical', default=None)
    parser.add_argument('--return-reason', default=None)
    parser.add_argument('--marketplace', default=None)
    args = parser.parse_args()

    custom_prompt = sys.stdin.read()
    asyncio.run(run_playground(args, custom_prompt))


if __name__ == '__main__':
    main()
