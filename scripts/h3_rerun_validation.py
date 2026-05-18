#!/usr/bin/env python3
"""
H3 Non-Determinism Validation Script
=====================================
Re-runs Sari Misshipment incidents through Gemini 2.5 Flash via Genvoy
and compares with original AI output from labelling.

Usage:
    python3 h3_rerun_validation.py --ids-file /tmp/gemini25_matched_ids.txt --delay 1.0
    python3 h3_rerun_validation.py --limit 20 --delay 1.5
    python3 h3_rerun_validation.py --resume  # resumes from last checkpoint
"""
import argparse
import base64
import json
import os
import sqlite3
import sys
import time
from io import BytesIO

import cv2
import numpy as np
import requests
from PIL import Image, ImageOps

# ─── Config ───────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'h3_results')
def checkpoint_file(run_id=None):
    if run_id:
        return os.path.join(OUTPUT_DIR, f'h3_run_{run_id}_checkpoint.json')
    return os.path.join(OUTPUT_DIR, 'h3_checkpoint.json')

def final_output_file(run_id=None):
    if run_id:
        return os.path.join(OUTPUT_DIR, f'h3_run_{run_id}.json')
    return os.path.join(OUTPUT_DIR, 'h3_full_results.json')

CHECKPOINT_FILE = checkpoint_file()
FINAL_OUTPUT = final_output_file()

AUTH_URL = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
AUTH_CLIENT_ID = 'tns-genvoy'
AUTH_CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'
AUTH_TARGET = 'genvoy-authn-intrnl-prod'

GENVOY_URL = 'http://genvoy.jarvis-prod.fkcloud.in/gemini-2.5-flash/:generateContent'
SUBSCRIPTION_KEY = '11d385c1c9d74983b826a8c1d6ffb10c'

GENERATION_CONFIG = {
    "maxOutputTokens": 300,
    "temperature": 0.0,
    "topP": 0.4,
    "topK": 32,
    "seed": 2025,
    "thinkingConfig": {"thinkingBudget": 0}
}

IMAGE_COMPRESSION = {"target_width": 1000, "target_height": 1000, "quality": 85}

CHECKPOINT_INTERVAL = 10

# ─── Auth ─────────────────────────────────────────────────────────────
_token = None
_token_expiry = 0

def get_token():
    global _token, _token_expiry
    if _token and time.time() < _token_expiry - 60:
        return _token
    resp = requests.post(AUTH_URL, data={
        'client_id': AUTH_CLIENT_ID,
        'client_secret': AUTH_CLIENT_SECRET,
        'grant_type': 'client_credentials',
        'target_client_id': AUTH_TARGET,
    })
    resp.raise_for_status()
    data = resp.json()
    _token = data['access_token']
    _token_expiry = time.time() + data.get('expires_in', 3000)
    return _token


# ─── Image Compression (production-identical) ────────────────────────
def compress_image_bytes(image_bytes, target_width=1000, target_height=1000, quality=85):
    with BytesIO(image_bytes) as buffer:
        pil_image = Image.open(buffer)
        pil_image = ImageOps.exif_transpose(pil_image)
        img_w, img_h = pil_image.size
        cv_image = _pil_to_cv2(pil_image)
        pil_image.close()
    if img_w > target_width or img_h > target_height:
        scale = min(target_width / img_w, target_height / img_h)
        cv_image = cv2.resize(cv_image, (int(img_w * scale), int(img_h * scale)), interpolation=cv2.INTER_AREA)
    _, encoded = cv2.imencode('.jpg', cv_image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(encoded.tobytes()).decode('utf-8')


def _pil_to_cv2(pil_image):
    np_image = np.array(pil_image)
    if pil_image.mode == 'RGBA':
        return cv2.cvtColor(cv2.cvtColor(np_image, cv2.COLOR_RGBA2BGRA), cv2.COLOR_BGRA2BGR)
    elif pil_image.mode == 'RGB':
        return cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
    elif pil_image.mode == 'L':
        return cv2.cvtColor(np_image, cv2.COLOR_GRAY2BGR)
    else:
        rgb = pil_image.convert('RGB')
        result = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
        rgb.close()
        return result


# ─── Image Download ──────────────────────────────────────────────────
def download_image(url, timeout=20):
    if not url or url.strip() == '':
        return None
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        print(f"\n  [DL-FAIL] {type(e).__name__}: {e} | {url[:80]}", file=sys.stderr)
        return None


# ─── Extract incidents from DB ───────────────────────────────────────
def get_incidents(db_path, incident_ids=None, limit=None):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    agents = ('image_adjudication_cx_agent', 'image_adjudication_obd_agent')

    if incident_ids:
        all_rows = []
        for i in range(0, len(incident_ids), 200):
            batch = incident_ids[i:i+200]
            ph = ','.join('?' * len(batch))
            rows = conn.execute(f"""
                SELECT incident_id, agent, input_data, agent_output, prompt,
                       predicted_class, human_label, is_accepted
                FROM records
                WHERE incident_id IN ({ph})
                  AND agent IN (?, ?)
                  AND input_data IS NOT NULL AND LENGTH(input_data) > 10
                ORDER BY incident_id, agent
            """, batch + list(agents)).fetchall()
            all_rows.extend(rows)
    else:
        query = """
            SELECT incident_id, agent, input_data, agent_output, prompt,
                   predicted_class, human_label, is_accepted
            FROM records
            WHERE vertical = 'sari' AND return_reason = 'MISSHIPMENT'
              AND agent IN (?, ?)
              AND input_data IS NOT NULL AND LENGTH(input_data) > 10
            ORDER BY incident_id, agent
        """
        all_rows = conn.execute(query, list(agents)).fetchall()

    conn.close()
    rows = [dict(r) for r in all_rows]
    if limit:
        ids_seen = set()
        limited = []
        for r in rows:
            ids_seen.add(r['incident_id'])
            if len(ids_seen) <= limit:
                limited.append(r)
        rows = limited
    return rows


# ─── Gemini API ──────────────────────────────────────────────────────
def call_gemini(prompt_text, image_parts):
    parts = [{"text": prompt_text}]
    for img_b64, mime_type in image_parts:
        parts.append({"inline_data": {"mime_type": mime_type, "data": img_b64}})

    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": GENERATION_CONFIG,
    }

    token = get_token()
    resp = requests.post(GENVOY_URL, headers={
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        'Authorization': f'Bearer {token}',
    }, json=payload, timeout=120)
    resp.raise_for_status()
    return resp.json()


def parse_gemini_response(gemini_resp):
    try:
        text = gemini_resp['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError):
        return None, None

    clean = text.strip()
    if clean.startswith('```'):
        lines = clean.split('\n')
        lines = [l for l in lines if not l.strip().startswith('```')]
        clean = '\n'.join(lines).strip()

    try:
        parsed = json.loads(clean)
        decision = (parsed.get('decision')
                    or parsed.get('product_match')
                    or parsed.get('classification', ''))
        return decision, text
    except json.JSONDecodeError:
        for cls in ['Misshipment', 'No Issue', "Can't Say", 'Major Damage', 'Minor Damage',
                    'Multiple Issue', 'Quality Issue', 'Expiry Issue',
                    'Major Missing', 'Minor Missing', 'Damage']:
            if cls.lower() in text.lower():
                return cls, text
        return None, text


# ─── Process one row ─────────────────────────────────────────────────
def process_row(row):
    incident_id = row['incident_id']
    agent = row['agent']
    input_data = json.loads(row['input_data'])
    prompt_text = row['prompt']

    try:
        original_parsed = json.loads(row['agent_output'])
        original_decision = original_parsed.get('decision', '')
    except (json.JSONDecodeError, TypeError):
        original_decision = str(row['agent_output'])

    # Collect image URLs
    image_urls = []
    if 'cx_agent' in agent:
        for k in ['customer_image_1_pnp_image_link', 'customer_image_2_pnp_image_link',
                   'customer_image_3_pnp_image_link']:
            url = input_data.get(k, '')
            if url and url.strip():
                image_urls.append(url)
    elif 'obd_agent' in agent:
        for k in ['obd_image_1', 'obd_image_2', 'obd_image_3']:
            url = input_data.get(k, '')
            if url and url.strip():
                image_urls.append(url)

    product_img = input_data.get('product_image', '')
    if product_img and product_img.strip():
        image_urls.append(product_img)

    # Download + compress images
    image_parts = []
    for url in image_urls:
        raw = download_image(url)
        if raw is None:
            continue
        try:
            b64 = compress_image_bytes(raw, **IMAGE_COMPRESSION)
            image_parts.append((b64, 'image/jpeg'))
        except Exception as e:
            print(f"\n  [COMPRESS-FAIL] {type(e).__name__}: {e}", file=sys.stderr)

    if not image_parts:
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': None, 'match': None,
            'status': 'no_images',
        }

    try:
        resp = call_gemini(prompt_text, image_parts)
        rerun_decision, rerun_raw = parse_gemini_response(resp)
        is_match = (original_decision == rerun_decision) if rerun_decision else None
        tokens = resp.get('usageMetadata', {})

        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': rerun_decision,
            'rerun_raw': rerun_raw[:500] if rerun_raw else None,
            'match': is_match,
            'image_count': len(image_parts),
            'status': 'success',
            'prompt_tokens': tokens.get('promptTokenCount', 0),
            'output_tokens': tokens.get('candidatesTokenCount', 0),
            'human_label': row.get('human_label', ''),
        }
    except requests.exceptions.Timeout:
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': None, 'match': None,
            'status': 'timeout',
        }
    except Exception as e:
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': None, 'match': None,
            'status': 'error', 'error': str(e)[:200],
        }


# ─── Checkpoint management ───────────────────────────────────────────
def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {'completed_keys': [], 'results': []}


def save_checkpoint(state):
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(state, f)


# ─── Main ─────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='H3 Non-Determinism Validation — Full Run')
    parser.add_argument('--ids-file', help='File with incident IDs (one per line)')
    parser.add_argument('--limit', type=int, default=None, help='Max incidents')
    parser.add_argument('--delay', type=float, default=1.0, help='Seconds between API calls')
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoint')
    parser.add_argument('--run-id', type=int, default=None, help='Run ID (1-10) for multi-run')
    args = parser.parse_args()

    # Set file paths based on run-id
    global CHECKPOINT_FILE, FINAL_OUTPUT
    CHECKPOINT_FILE = checkpoint_file(args.run_id)
    FINAL_OUTPUT = final_output_file(args.run_id)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load incident IDs
    incident_ids = None
    if args.ids_file:
        with open(args.ids_file) as f:
            incident_ids = [l.strip() for l in f if l.strip()]
        print(f"Loaded {len(incident_ids)} incident IDs from {args.ids_file}")

    # Load data from DB (with cache to avoid re-scanning 14GB DB each run)
    cache_file = os.path.join(OUTPUT_DIR, 'h3_db_cache.json')
    if os.path.exists(cache_file) and not args.limit:
        print(f"Loading from cache: {cache_file}")
        with open(cache_file) as f:
            rows = json.load(f)
    else:
        rows = get_incidents(DB_PATH, incident_ids, args.limit)
        rows = [dict(r) for r in rows]
        if not args.limit:
            with open(cache_file, 'w') as f:
                json.dump(rows, f)
            print(f"Cached {len(rows)} rows to {cache_file}")
    print(f"Fetched {len(rows)} rows from labelling.db")
    unique_incidents = len(set(r['incident_id'] for r in rows))
    print(f"Unique incidents: {unique_incidents}")
    print(f"Delay between calls: {args.delay}s")
    est_minutes = round(len(rows) * (args.delay + 5) / 60, 1)
    print(f"Estimated time: ~{est_minutes} minutes\n")

    # Resume support
    state = load_checkpoint() if args.resume else {'completed_keys': [], 'results': []}
    completed_set = set(state['completed_keys'])
    results = state['results']

    if args.resume and completed_set:
        print(f"Resuming: {len(completed_set)} already done, {len(rows) - len(completed_set)} remaining\n")

    matches = sum(1 for r in results if r.get('match') is True)
    mismatches = sum(1 for r in results if r.get('match') is False)
    errors = sum(1 for r in results if r.get('match') is None)
    start_time = time.time()

    for i, row in enumerate(rows):
        key = f"{row['incident_id']}|{row['agent']}"
        if key in completed_set:
            continue

        elapsed = time.time() - start_time
        done = matches + mismatches + errors
        rate = done / elapsed * 60 if elapsed > 0 and done > 0 else 0
        remaining = len(rows) - len(completed_set) - 1
        eta_min = round(remaining / rate, 1) if rate > 0 else '?'

        agent_short = 'CX' if 'cx' in row['agent'] else 'OBD'
        sys.stdout.write(f"\r[{len(completed_set)+1}/{len(rows)}] {row['incident_id']} {agent_short} | "
                         f"✓{matches} ✗{mismatches} !{errors} | {rate:.0f}/min | ETA {eta_min}min")
        sys.stdout.flush()

        result = process_row(row)
        results.append(result)
        completed_set.add(key)

        if result['match'] is True:
            matches += 1
        elif result['match'] is False:
            mismatches += 1
            print(f"\n  ✗ {result['original_decision']} → {result['rerun_decision']}")
        else:
            errors += 1
            if result['status'] != 'success':
                print(f"\n  ! {result['status']}: {result.get('error', '')[:80]}")

        # Checkpoint
        if len(completed_set) % CHECKPOINT_INTERVAL == 0:
            state['completed_keys'] = list(completed_set)
            state['results'] = results
            save_checkpoint(state)

        if i < len(rows) - 1:
            time.sleep(args.delay)

    # Final save
    total_compared = matches + mismatches
    consistency = round(matches / total_compared * 100, 1) if total_compared else 0

    # Per-agent breakdown
    cx_results = [r for r in results if 'cx' in r.get('agent', '')]
    obd_results = [r for r in results if 'obd' in r.get('agent', '')]
    cx_matches = sum(1 for r in cx_results if r.get('match') is True)
    obd_matches = sum(1 for r in obd_results if r.get('match') is True)
    cx_compared = sum(1 for r in cx_results if r.get('match') is not None)
    obd_compared = sum(1 for r in obd_results if r.get('match') is not None)

    # Per-class breakdown
    class_stats = {}
    for r in results:
        if r.get('match') is None:
            continue
        cls = r['original_decision']
        if cls not in class_stats:
            class_stats[cls] = {'matches': 0, 'total': 0}
        class_stats[cls]['total'] += 1
        if r['match']:
            class_stats[cls]['matches'] += 1

    # Flip directions
    flip_dirs = {}
    for r in results:
        if r.get('match') is False:
            key = f"{r['original_decision']} → {r['rerun_decision']}"
            flip_dirs[key] = flip_dirs.get(key, 0) + 1

    summary = {
        'total_rows': len(results),
        'total_compared': total_compared,
        'matches': matches,
        'mismatches': mismatches,
        'errors': errors,
        'consistency_pct': consistency,
        'cx_consistency_pct': round(cx_matches / cx_compared * 100, 1) if cx_compared else 0,
        'obd_consistency_pct': round(obd_matches / obd_compared * 100, 1) if obd_compared else 0,
        'cx_compared': cx_compared,
        'obd_compared': obd_compared,
        'per_class': {cls: round(s['matches']/s['total']*100, 1) for cls, s in class_stats.items()},
        'flip_directions': dict(sorted(flip_dirs.items(), key=lambda x: -x[1])),
        'run_duration_min': round((time.time() - start_time) / 60, 1),
    }

    output = {
        'run_id': args.run_id or 1,
        'config': {
            'generation_config': GENERATION_CONFIG,
            'image_compression': IMAGE_COMPRESSION,
            'total_incidents': unique_incidents,
        },
        'summary': summary,
        'results': results,
    }

    with open(FINAL_OUTPUT, 'w') as f:
        json.dump(output, f, indent=2)

    # Clean up checkpoint
    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)

    print(f"\n\n{'='*60}")
    print(f"H3 NON-DETERMINISM VALIDATION — FINAL RESULTS")
    print(f"{'='*60}")
    print(f"Total rows:            {len(results)}")
    print(f"Compared:              {total_compared}")
    print(f"  Matches:             {matches}")
    print(f"  Mismatches:          {mismatches}")
    print(f"  Errors/skipped:      {errors}")
    print(f"\nOVERALL CONSISTENCY:   {consistency}%")
    print(f"  CX Agent:            {summary['cx_consistency_pct']}% ({cx_matches}/{cx_compared})")
    print(f"  OBD Agent:           {summary['obd_consistency_pct']}% ({obd_matches}/{obd_compared})")
    print(f"\nPer-class consistency:")
    for cls, pct in sorted(summary['per_class'].items(), key=lambda x: x[1]):
        ct = class_stats[cls]
        print(f"  {cls:20s} {pct}% ({ct['matches']}/{ct['total']})")
    print(f"\nFlip directions:")
    for flip, count in summary['flip_directions'].items():
        print(f"  {flip:35s} ×{count}")
    print(f"\nDuration: {summary['run_duration_min']} min")
    print(f"Saved to: {FINAL_OUTPUT}")


if __name__ == '__main__':
    main()
