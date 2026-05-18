#!/usr/bin/env python3
"""
H6 Cross-Model Comparison — Run Sari Misshipment through 3 Gemini models concurrently.
Reuses h3_db_cache.json (1574 rows). Downloads images once, calls all 3 models per row.
"""
import argparse
import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from threading import Lock, Thread

import cv2
import numpy as np
import requests
from PIL import Image, ImageOps

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H3_CACHE = os.path.join(BASE_DIR, 'data', 'processed', 'h3_results', 'h3_db_cache.json')
OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'h6_results')

AUTH_URL = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
AUTH_CLIENT_ID = 'tns-genvoy'
AUTH_CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'
AUTH_TARGET = 'genvoy-authn-intrnl-prod'

MODELS = {
    'gemini_2_5_flash': {
        'url': 'http://genvoy.jarvis-prod.fkcloud.in/gemini-2.5-flash/:generateContent',
        'sub_key': '11d385c1c9d74983b826a8c1d6ffb10c',
        'needs_bearer': True,
        'label': 'Gemini 2.5 Flash',
    },
    'gemini_3_0_flash': {
        'url': 'http://genvoy.jarvis-prod.fkcloud.in/gemini-3-flash-preview/:generateContent',
        'sub_key': '94049b51f37746be9f652eccaa3ddf2b',
        'needs_bearer': False,
        'label': 'Gemini 3.0 Flash Preview',
    },
    'gemini_3_1_pro': {
        'url': 'http://genvoy.jarvis-prod.fkcloud.in/gemini-3.1-pro-preview/:generateContent',
        'sub_key': '38af8c77225e477b9c3cd4755f0da58a',
        'needs_bearer': True,
        'label': 'Gemini 3.1 Pro Preview',
    },
}

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


def call_gemini(model_key, prompt_text, image_parts):
    cfg = MODELS[model_key]
    parts = [{"text": prompt_text}]
    for img_b64, mime_type in image_parts:
        parts.append({"inline_data": {"mime_type": mime_type, "data": img_b64}})
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": GENERATION_CONFIG,
    }
    headers = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': cfg['sub_key'],
    }
    if cfg['needs_bearer']:
        headers['Authorization'] = f'Bearer {get_token()}'
    resp = requests.post(cfg['url'], headers=headers, json=payload, timeout=120)
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


def prepare_images(row):
    """Download and compress images for a row. Returns list of (b64, mime_type) tuples."""
    input_data = json.loads(row['input_data'])
    agent = row['agent']
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
    return image_parts


def process_row_for_model(model_key, row, image_parts):
    """Call a single model for a pre-prepared row."""
    incident_id = row['incident_id']
    agent = row['agent']
    prompt_text = row['prompt']

    try:
        original_parsed = json.loads(row['agent_output'])
        original_decision = original_parsed.get('decision', '')
    except (json.JSONDecodeError, TypeError):
        original_decision = str(row['agent_output'])

    if not image_parts:
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': None, 'match': None,
            'status': 'no_images', 'human_label': row.get('human_label', ''),
        }

    try:
        resp = call_gemini(model_key, prompt_text, image_parts)
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
            'status': 'timeout', 'human_label': row.get('human_label', ''),
        }
    except Exception as e:
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': None, 'match': None,
            'status': 'error', 'error': str(e)[:200],
            'human_label': row.get('human_label', ''),
        }


def run_single_model(model_key, rows, workers, resume_from=None):
    """Run all rows through a single model with concurrent workers."""
    label = MODELS[model_key]['label']
    output_file = os.path.join(OUTPUT_DIR, f'h6_{model_key}.json')
    checkpoint_file = os.path.join(OUTPUT_DIR, f'h6_{model_key}_checkpoint.json')

    results = []
    done_keys = set()
    if resume_from and os.path.exists(checkpoint_file):
        with open(checkpoint_file) as f:
            ckpt = json.load(f)
        results = ckpt.get('results', [])
        done_keys = {f"{r['incident_id']}|{r['agent']}" for r in results}
        print(f"  [{label}] Resuming from checkpoint: {len(results)} already done")

    pending = [r for r in rows if f"{r['incident_id']}|{r['agent']}" not in done_keys]
    total = len(rows)
    completed = len(results)
    matches = sum(1 for r in results if r.get('match') is True)
    errors = sum(1 for r in results if r.get('status') in ('error', 'timeout', 'no_images'))
    start_time = time.time()
    lock = Lock()

    print(f"  [{label}] Processing {len(pending)} rows ({completed} already done)...")

    def worker(row):
        image_parts = prepare_images(row)
        return process_row_for_model(model_key, row, image_parts)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(worker, r): r for r in pending}
        for future in as_completed(futures):
            result = future.result()
            with lock:
                results.append(result)
                completed += 1
                if result.get('match') is True:
                    matches += 1
                if result.get('status') in ('error', 'timeout', 'no_images'):
                    errors += 1

                if completed % 50 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed if elapsed > 0 else 0
                    valid = completed - errors
                    pct = (matches / valid * 100) if valid > 0 else 0
                    print(f"  [{label}] {completed}/{total} | {pct:.1f}% match | "
                          f"{errors} errs | {rate:.1f} rows/s")

                if completed % 100 == 0:
                    with open(checkpoint_file, 'w') as f:
                        json.dump({'results': results}, f)

    elapsed = time.time() - start_time
    valid = sum(1 for r in results if r.get('status') == 'success')
    total_matches = sum(1 for r in results if r.get('match') is True)
    total_mismatches = sum(1 for r in results if r.get('match') is False)

    output = {
        'model': model_key,
        'model_label': label,
        'config': {
            'generation_config': GENERATION_CONFIG,
            'image_compression': IMAGE_COMPRESSION,
            'endpoint': MODELS[model_key]['url'],
        },
        'summary': {
            'total_rows': len(rows),
            'success': valid,
            'errors': sum(1 for r in results if r.get('status') == 'error'),
            'timeouts': sum(1 for r in results if r.get('status') == 'timeout'),
            'no_images': sum(1 for r in results if r.get('status') == 'no_images'),
            'matches': total_matches,
            'mismatches': total_mismatches,
            'consistency_pct': round(total_matches / (total_matches + total_mismatches) * 100, 1)
                if (total_matches + total_mismatches) > 0 else 0,
            'duration_min': round(elapsed / 60, 1),
        },
        'results': results,
    }

    with open(output_file, 'w') as f:
        json.dump(output, f)
    if os.path.exists(checkpoint_file):
        os.remove(checkpoint_file)

    print(f"\n  [{label}] DONE in {elapsed/60:.1f} min — "
          f"{valid} success, {total_matches} match ({output['summary']['consistency_pct']}%), "
          f"{total_mismatches} mismatch")
    return output['summary']


def main():
    parser = argparse.ArgumentParser(description='H6 Cross-Model Comparison')
    parser.add_argument('--workers', type=int, default=10, help='Workers per model')
    parser.add_argument('--models', nargs='+', default=list(MODELS.keys()),
                        help='Models to run (default: all)')
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoints')
    args = parser.parse_args()

    print(f"Loading cache from {H3_CACHE}...")
    with open(H3_CACHE) as f:
        rows = json.load(f)
    print(f"Loaded {len(rows)} rows")

    models_to_run = [m for m in args.models if m in MODELS]
    print(f"\nRunning {len(models_to_run)} models concurrently: {', '.join(models_to_run)}")
    print(f"Workers per model: {args.workers}")
    print()

    overall_start = time.time()
    threads = []
    summaries = {}
    summary_lock = Lock()

    def run_model_thread(model_key):
        summary = run_single_model(model_key, rows, args.workers, resume_from=args.resume)
        with summary_lock:
            summaries[model_key] = summary

    for model_key in models_to_run:
        t = Thread(target=run_model_thread, args=(model_key,), name=model_key)
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    total_elapsed = time.time() - overall_start
    print(f"\n{'='*60}")
    print(f"ALL MODELS COMPLETE in {total_elapsed/60:.1f} min")
    print(f"{'='*60}")
    for model_key, s in summaries.items():
        print(f"  {MODELS[model_key]['label']}: {s['consistency_pct']}% match "
              f"({s['matches']}/{s['matches']+s['mismatches']}), "
              f"{s['duration_min']} min")


if __name__ == '__main__':
    main()
