#!/usr/bin/env python3
"""
H3 Non-Determinism — Concurrent Multi-Run
Uses ThreadPoolExecutor for parallel Gemini calls + cached DB rows.
Runs 2-10 sequentially, each with concurrent workers.
"""
import argparse
import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from threading import Lock

import cv2
import numpy as np
import requests
from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'h3_results')
CACHE_FILE = os.path.join(OUTPUT_DIR, 'h3_db_cache.json')

AUTH_URL = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
AUTH_CLIENT_ID = 'tns-genvoy'
AUTH_CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'
AUTH_TARGET = 'genvoy-authn-intrnl-prod'
GENVOY_URL = 'http://genvoy.jarvis-prod.fkcloud.in/gemini-2.5-flash/:generateContent'
SUBSCRIPTION_KEY = '11d385c1c9d74983b826a8c1d6ffb10c'
GENERATION_CONFIG = {
    "maxOutputTokens": 300, "temperature": 0.0, "topP": 0.4, "topK": 32,
    "seed": 2025, "thinkingConfig": {"thinkingBudget": 0}
}
IMAGE_COMPRESSION = {"target_width": 1000, "target_height": 1000, "quality": 85}

_token = None
_token_expiry = 0
_token_lock = Lock()

def get_token():
    global _token, _token_expiry
    with _token_lock:
        if _token and time.time() < _token_expiry - 60:
            return _token
        resp = requests.post(AUTH_URL, data={
            'client_id': AUTH_CLIENT_ID, 'client_secret': AUTH_CLIENT_SECRET,
            'grant_type': 'client_credentials', 'target_client_id': AUTH_TARGET,
        })
        resp.raise_for_status()
        data = resp.json()
        _token = data['access_token']
        _token_expiry = time.time() + data.get('expires_in', 3000)
        return _token


def compress_image_bytes(image_bytes, target_width=1000, target_height=1000, quality=85):
    with BytesIO(image_bytes) as buffer:
        pil_image = Image.open(buffer)
        pil_image = ImageOps.exif_transpose(pil_image)
        img_w, img_h = pil_image.size
        np_image = np.array(pil_image)
        if pil_image.mode == 'RGBA':
            cv_image = cv2.cvtColor(cv2.cvtColor(np_image, cv2.COLOR_RGBA2BGRA), cv2.COLOR_BGRA2BGR)
        elif pil_image.mode == 'RGB':
            cv_image = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
        elif pil_image.mode == 'L':
            cv_image = cv2.cvtColor(np_image, cv2.COLOR_GRAY2BGR)
        else:
            rgb = pil_image.convert('RGB')
            cv_image = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
            rgb.close()
        pil_image.close()
    if img_w > target_width or img_h > target_height:
        scale = min(target_width / img_w, target_height / img_h)
        cv_image = cv2.resize(cv_image, (int(img_w * scale), int(img_h * scale)), interpolation=cv2.INTER_AREA)
    _, encoded = cv2.imencode('.jpg', cv_image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return base64.b64encode(encoded.tobytes()).decode('utf-8')


def download_image(url, timeout=20):
    if not url or url.strip() == '':
        return None
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None


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
        decision = (parsed.get('decision') or parsed.get('product_match')
                    or parsed.get('classification', ''))
        return decision, text
    except json.JSONDecodeError:
        for cls in ['Misshipment', 'No Issue', "Can't Say", 'Major Damage', 'Minor Damage',
                    'Multiple Issue', 'Quality Issue', 'Expiry Issue', 'Major Missing', 'Minor Missing']:
            if cls.lower() in text.lower():
                return cls, text
        return None, text


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

    image_parts = []
    for url in image_urls:
        raw = download_image(url)
        if raw is None:
            continue
        try:
            b64 = compress_image_bytes(raw, **IMAGE_COMPRESSION)
            image_parts.append((b64, 'image/jpeg'))
        except Exception:
            pass

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
            'rerun_decision': None, 'match': None, 'status': 'timeout',
        }
    except Exception as e:
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': None, 'match': None,
            'status': 'error', 'error': str(e)[:200],
        }


def run_single(run_id, rows, workers=10):
    final_path = os.path.join(OUTPUT_DIR, f'h3_run_{run_id}.json')
    ckpt_path = os.path.join(OUTPUT_DIR, f'h3_run_{run_id}_checkpoint.json')

    if os.path.exists(final_path):
        print(f"  Run {run_id} already complete, skipping.")
        return

    results = []
    completed = 0
    lock = Lock()
    start = time.time()

    def on_done(future, idx):
        nonlocal completed
        result = future.result()
        with lock:
            results.append(result)
            completed += 1
            if completed % 50 == 0 or completed == len(rows):
                m = sum(1 for r in results if r.get('match') is True)
                mm = sum(1 for r in results if r.get('match') is False)
                elapsed = time.time() - start
                rate = completed / elapsed * 60 if elapsed > 0 else 0
                pct = m / (m + mm) * 100 if (m + mm) > 0 else 0
                eta = (len(rows) - completed) / rate if rate > 0 else 0
                sys.stdout.write(f"\r  Run {run_id}: [{completed}/{len(rows)}] "
                                 f"✓{m} ✗{mm} | {rate:.0f}/min | {pct:.1f}% | ETA {eta:.0f}min")
                sys.stdout.flush()

                state = {'results': results}
                with open(ckpt_path, 'w') as f:
                    json.dump(state, f)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {}
        for i, row in enumerate(rows):
            future = executor.submit(process_row, row)
            future.add_done_callback(lambda f, idx=i: on_done(f, idx))
            futures[future] = i

        for future in as_completed(futures):
            pass

    m = sum(1 for r in results if r.get('match') is True)
    mm = sum(1 for r in results if r.get('match') is False)
    e = sum(1 for r in results if r.get('match') is None)
    elapsed = time.time() - start
    consistency = round(m / (m + mm) * 100, 1) if (m + mm) > 0 else 0

    output = {
        'run_id': run_id,
        'config': {'generation_config': GENERATION_CONFIG, 'image_compression': IMAGE_COMPRESSION},
        'summary': {
            'total_rows': len(results), 'matches': m, 'mismatches': mm, 'errors': e,
            'consistency_pct': consistency, 'run_duration_min': round(elapsed / 60, 1),
        },
        'results': results,
    }
    with open(final_path, 'w') as f:
        json.dump(output, f, indent=2)

    if os.path.exists(ckpt_path):
        os.remove(ckpt_path)

    print(f"\n  Run {run_id} DONE: {len(results)} rows, {consistency}% consistency, {elapsed/60:.1f} min")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', type=int, default=2)
    parser.add_argument('--end', type=int, default=10)
    parser.add_argument('--workers', type=int, default=10)
    args = parser.parse_args()

    print(f"Loading cached rows from {CACHE_FILE}...")
    with open(CACHE_FILE) as f:
        rows = json.load(f)
    print(f"Loaded {len(rows)} rows. Workers per run: {args.workers}")
    print()

    for run_id in range(args.start, args.end + 1):
        print(f"[{time.strftime('%H:%M:%S')}] Starting Run {run_id}/{args.end}")
        run_single(run_id, rows, args.workers)
        print()

    print("=" * 50)
    print("ALL RUNS COMPLETE")
    print("=" * 50)


if __name__ == '__main__':
    main()
