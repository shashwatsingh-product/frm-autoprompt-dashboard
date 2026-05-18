#!/usr/bin/env python3
"""
H6 Thinking Run — Re-run Gemini 3.1 Pro with thinkingBudget=2048.
Saves to h6_gemini_3_1_pro_thinking.json for H6 cross-model comparison.
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
H3_CACHE = os.path.join(BASE_DIR, 'data', 'processed', 'h3_results', 'h3_db_cache.json')
OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'h6_results')

AUTH_URL = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
AUTH_CLIENT_ID = 'tns-genvoy'
AUTH_CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'
AUTH_TARGET = 'genvoy-authn-intrnl-prod'

MODEL_KEY = 'gemini_3_1_pro_thinking'
MODEL_LABEL = 'Gemini 3.1 Pro (Thinking)'
ENDPOINT_URL = 'http://genvoy.jarvis-prod.fkcloud.in/gemini-3.1-pro-preview/:generateContent'
SUB_KEY = '38af8c77225e477b9c3cd4755f0da58a'

# Key change vs original: thinkingBudget enabled, higher output token cap
GENERATION_CONFIG = {
    "maxOutputTokens": 1000,
    "temperature": 0.0,
    "topP": 0.4,
    "topK": 32,
    "seed": 2025,
    "thinkingConfig": {"thinkingBudget": 2048},
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
    headers = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': SUB_KEY,
        'Authorization': f'Bearer {get_token()}',
    }
    resp = requests.post(ENDPOINT_URL, headers=headers, json=payload, timeout=180)
    resp.raise_for_status()
    return resp.json()


def parse_gemini_response(gemini_resp):
    """Parse response, handling thought parts (thought=true) separately from answer part."""
    thinking_text = None
    answer_text = None
    try:
        parts = gemini_resp['candidates'][0]['content']['parts']
        for part in parts:
            if part.get('thought'):
                thinking_text = part.get('text', '')
            else:
                answer_text = part.get('text', '')
    except (KeyError, IndexError):
        return None, None, None

    text = answer_text or ''
    clean = text.strip()
    if clean.startswith('```'):
        lines = clean.split('\n')
        lines = [l for l in lines if not l.strip().startswith('```')]
        clean = '\n'.join(lines).strip()
    try:
        parsed = json.loads(clean)
        decision = (parsed.get('decision') or parsed.get('product_match')
                    or parsed.get('classification', ''))
        return decision, text, thinking_text
    except json.JSONDecodeError:
        for cls in ['Misshipment', 'No Issue', "Can't Say", 'Major Damage', 'Minor Damage',
                    'Multiple Issue', 'Quality Issue', 'Expiry Issue', 'Major Missing', 'Minor Missing']:
            if cls.lower() in text.lower():
                return cls, text, thinking_text
        return None, text, thinking_text


def prepare_images(row):
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


def process_row(row, image_parts):
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
        resp = call_gemini(prompt_text, image_parts)
        rerun_decision, rerun_raw, thinking_raw = parse_gemini_response(resp)
        is_match = (original_decision == rerun_decision) if rerun_decision else None
        tokens = resp.get('usageMetadata', {})
        return {
            'incident_id': incident_id, 'agent': agent,
            'original_decision': original_decision,
            'rerun_decision': rerun_decision,
            'rerun_raw': rerun_raw[:500] if rerun_raw else None,
            'thinking_tokens': tokens.get('thoughtsTokenCount', 0),
            'has_thinking': thinking_raw is not None,
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


def main():
    parser = argparse.ArgumentParser(description='H6 Gemini 3.1 Pro Thinking Run')
    parser.add_argument('--workers', type=int, default=8, help='Concurrent workers (default: 8)')
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoint')
    parser.add_argument('--sample', type=int, default=0, help='Only run N rows (for testing)')
    args = parser.parse_args()

    output_file = os.path.join(OUTPUT_DIR, f'h6_{MODEL_KEY}.json')
    checkpoint_file = os.path.join(OUTPUT_DIR, f'h6_{MODEL_KEY}_checkpoint.json')

    print(f"Loading rows from {H3_CACHE}...")
    with open(H3_CACHE) as f:
        rows = json.load(f)
    print(f"Loaded {len(rows)} rows")

    if args.sample > 0:
        rows = rows[:args.sample]
        print(f"Sampling {len(rows)} rows for test run")

    results = []
    done_keys = set()
    if args.resume and os.path.exists(checkpoint_file):
        with open(checkpoint_file) as f:
            ckpt = json.load(f)
        results = ckpt.get('results', [])
        done_keys = {f"{r['incident_id']}|{r['agent']}" for r in results}
        print(f"Resuming from checkpoint: {len(results)} already done")

    pending = [r for r in rows if f"{r['incident_id']}|{r['agent']}" not in done_keys]
    total = len(rows)
    completed = len(results)
    errors = sum(1 for r in results if r.get('status') in ('error', 'timeout', 'no_images'))
    start_time = time.time()
    lock = Lock()

    print(f"\nRunning {len(pending)} rows on {MODEL_LABEL}")
    print(f"Config: thinkingBudget={GENERATION_CONFIG['thinkingConfig']['thinkingBudget']}, "
          f"maxOutputTokens={GENERATION_CONFIG['maxOutputTokens']}, workers={args.workers}")
    print()

    def worker(row):
        image_parts = prepare_images(row)
        return process_row(row, image_parts)

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(worker, r): r for r in pending}
        for future in as_completed(futures):
            result = future.result()
            with lock:
                results.append(result)
                completed += 1
                if result.get('status') in ('error', 'timeout', 'no_images'):
                    errors += 1

                if completed % 25 == 0:
                    elapsed = time.time() - start_time
                    rate = completed / elapsed if elapsed > 0 else 0
                    valid = sum(1 for r in results if r.get('status') == 'success')
                    correct = sum(1 for r in results if r.get('rerun_decision') and r.get('human_label') and r['rerun_decision'] == r['human_label'])
                    acc = (correct / valid * 100) if valid > 0 else 0
                    think_pct = sum(1 for r in results if r.get('has_thinking')) / max(valid, 1) * 100
                    print(f"  {completed}/{total} | acc={acc:.1f}% | thinking={think_pct:.0f}% | "
                          f"errs={errors} | {rate:.1f} rows/s")

                if completed % 100 == 0:
                    with open(checkpoint_file, 'w') as f:
                        json.dump({'results': results}, f)
                    print(f"  [checkpoint saved at {completed}]")

    elapsed = time.time() - start_time
    valid = sum(1 for r in results if r.get('status') == 'success')
    correct = sum(1 for r in results if r.get('rerun_decision') and r.get('human_label') and r['rerun_decision'] == r['human_label'])
    has_thinking = sum(1 for r in results if r.get('has_thinking'))
    avg_think_tokens = sum(r.get('thinking_tokens', 0) for r in results) / max(valid, 1)

    output = {
        'model': MODEL_KEY,
        'model_label': MODEL_LABEL,
        'config': {
            'generation_config': GENERATION_CONFIG,
            'image_compression': IMAGE_COMPRESSION,
            'endpoint': ENDPOINT_URL,
        },
        'summary': {
            'total_rows': total,
            'success': valid,
            'errors': sum(1 for r in results if r.get('status') == 'error'),
            'timeouts': sum(1 for r in results if r.get('status') == 'timeout'),
            'no_images': sum(1 for r in results if r.get('status') == 'no_images'),
            'accuracy_vs_human': round(correct / valid * 100, 1) if valid > 0 else 0,
            'has_thinking_pct': round(has_thinking / valid * 100, 1) if valid > 0 else 0,
            'avg_thinking_tokens': round(avg_think_tokens, 0),
            'duration_min': round(elapsed / 60, 1),
        },
        'results': results,
    }

    with open(output_file, 'w') as f:
        json.dump(output, f)
    if os.path.exists(checkpoint_file):
        os.remove(checkpoint_file)

    print(f"\n{'='*60}")
    print(f"DONE in {elapsed/60:.1f} min")
    print(f"  Success: {valid}/{total}")
    print(f"  Accuracy vs human: {output['summary']['accuracy_vs_human']}%")
    print(f"  Rows with thinking: {has_thinking}/{valid} ({output['summary']['has_thinking_pct']}%)")
    print(f"  Avg thinking tokens: {output['summary']['avg_thinking_tokens']:.0f}")
    print(f"  Output: {output_file}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
