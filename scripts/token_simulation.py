#!/usr/bin/env python3
"""
Token simulation — measure real input/output token counts for binary sub-agent prompts.
Samples incidents per vertical per sub-agent, calls Gemini 2.5 Flash, records tokens.

Usage:
  python3 scripts/token_simulation.py                  # run all
  python3 scripts/token_simulation.py --agent match    # one agent type
  python3 scripts/token_simulation.py --dry-run        # print plan only
"""
import argparse, base64, glob, json, os, random, sqlite3, sys, time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from threading import Lock

import requests
from PIL import Image, ImageOps
import openpyxl

# ── Paths ─────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPT_DIR  = os.path.expanduser('~/claude-project/Documents/CY2026/prompts/prompts')
EXCEL_8V    = os.path.expanduser('~/claude-project/Documents/CY2026/Labelling_8verticals_agents_full (1).xlsx')
EXCEL_MISS  = os.path.expanduser('~/claude-project/Documents/CY2026/Missing Reason Labelling Data.xlsx')
DB_PATH     = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(BASE_DIR, 'data', 'labelling.db')
OUTPUT_FILE = os.path.join(BASE_DIR, 'data', 'processed', 'token_simulation_results.json')

# ── Genvoy Auth ───────────────────────────────────────────────────────────
AUTH_URL           = 'https://service.authn-prod.fkcloud.in/v3/oauth/token'
AUTH_CLIENT_ID     = 'tns-genvoy'
AUTH_CLIENT_SECRET = 'FZvyxWoUYw93lPkGcc8xKe/yznEejIJ83aOv/FPdrch5Q07M'
AUTH_TARGET        = 'genvoy-authn-intrnl-prod'
ENDPOINT_URL       = 'http://genvoy.jarvis-prod.fkcloud.in/gemini-2.5-flash/:generateContent'
SUB_KEY            = '11d385c1c9d74983b826a8c1d6ffb10c'

GENERATION_CONFIG = {
    "maxOutputTokens": 500,
    "temperature": 0.0,
    "topP": 0.4,
    "topK": 32,
    "seed": 2025,
    "thinkingConfig": {"thinkingBudget": 0},
}

SAMPLES_PER_BUCKET = 99999  # process all incidents
MAX_WORKERS        = 16
IMAGE_MAX_DIM      = 1000
IMAGE_QUALITY      = 85

# ── Sub-agent definitions ──────────────────────────────────────────────────
# (agent_type, sub_type, prompt_filename_pattern)
SUB_AGENTS = {
    'match':    [('match',    None,                    '{vertical}_2026_05_11_20_02.txt', 'default.txt')],
    'mismatch': [('mismatch', None,                    '{vertical}_2026_05_11_21_01.txt', 'default.txt')],
    'damage':   [
        ('damage', 'functional_damage',     '{vertical}_functional_damage_damage.txt',     'default.txt'),
        ('damage', 'non_functional_damage', '{vertical}_non_functional_damage_damage.txt',  'default.txt'),
        ('damage', 'no_damage',             '{vertical}_no_damage_damage.txt',              'default.txt'),
    ],
    'missing':  [
        ('missing', 'missing_essential_part',     '{vertical}_missing_essential_part_missing.txt',     'default.txt'),
        ('missing', 'missing_supplementary_item', '{vertical}_missing_supplementary_item_missing.txt',  'default.txt'),
        ('missing', 'product_complete',           '{vertical}_product_complete_missing.txt',            'default.txt'),
    ],
}

VERTICALS = ['cases_covers','diaper','headphone','induction_cook_top',
             'mixer_grinder_juicer','sari','smartwatch','speaker']

# ── Token / Auth ──────────────────────────────────────────────────────────
_token, _token_expiry, _token_lock = None, 0, Lock()

def get_token():
    global _token, _token_expiry
    with _token_lock:
        if _token and time.time() < _token_expiry - 60:
            return _token
        r = requests.post(AUTH_URL, data={
            'client_id': AUTH_CLIENT_ID, 'client_secret': AUTH_CLIENT_SECRET,
            'grant_type': 'client_credentials', 'target_client_id': AUTH_TARGET,
        }, timeout=30)
        r.raise_for_status()
        d = r.json()
        _token, _token_expiry = d['access_token'], time.time() + d.get('expires_in', 3000)
        return _token

# ── Prompt loader ─────────────────────────────────────────────────────────
_prompt_cache = {}

def load_prompt(agent_type, vertical, pattern, fallback):
    key = (agent_type, vertical, pattern)
    if key in _prompt_cache:
        return _prompt_cache[key]
    fname = pattern.replace('{vertical}', vertical)
    path = os.path.join(PROMPT_DIR, agent_type, fname)
    if not os.path.exists(path):
        path = os.path.join(PROMPT_DIR, agent_type, fallback)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        text = f.read()
    _prompt_cache[key] = text
    return text

# ── Image helpers ─────────────────────────────────────────────────────────
def download_image(url, timeout=20):
    if not url or not url.strip():
        return None
    try:
        r = requests.get(url.strip(), timeout=timeout,
                         headers={'User-Agent': 'Mozilla/5.0'})
        if r.status_code == 200 and r.content:
            return r.content
    except Exception:
        pass
    return None

def compress_to_b64(raw_bytes):
    try:
        img = Image.open(BytesIO(raw_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert('RGB')
        w, h = img.size
        scale = min(IMAGE_MAX_DIM / w, IMAGE_MAX_DIM / h, 1.0)
        if scale < 1.0:
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=IMAGE_QUALITY)
        return base64.b64encode(buf.getvalue()).decode('utf-8')
    except Exception:
        return None

def fetch_images(urls):
    parts = []
    for url in urls:
        if not url or not url.strip():
            continue
        raw = download_image(url)
        if raw is None:
            continue
        b64 = compress_to_b64(raw)
        if b64:
            parts.append(b64)
    return parts

# ── Gemini call ───────────────────────────────────────────────────────────
def call_gemini(prompt_text, image_b64_list):
    parts = [{"text": prompt_text}]
    for b64 in image_b64_list:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": b64}})
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": GENERATION_CONFIG,
    }
    headers = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': SUB_KEY,
        'Authorization': f'Bearer {get_token()}',
    }
    r = requests.post(ENDPOINT_URL, headers=headers, json=payload, timeout=120)
    r.raise_for_status()
    return r.json()

def parse_output(resp):
    try:
        return resp['candidates'][0]['content']['parts'][0].get('text', '')
    except (KeyError, IndexError):
        return ''

# ── Data loaders ──────────────────────────────────────────────────────────
def load_misshipment_damage_samples():
    """Load samples from 8verticals Excel — Catalog vs OBD Agent sheet (public image URLs)."""
    print("Loading 8-verticals Excel...", flush=True)
    wb = openpyxl.load_workbook(EXCEL_8V, read_only=True)
    ws = wb['Catalog vs OBD Agent']
    rows = list(ws.iter_rows(values_only=True))
    headers = rows[0]
    h = {v: i for i, v in enumerate(headers)}

    by_bucket = defaultdict(list)  # (vertical, return_reason) -> list of rows
    for row in rows[1:]:
        v   = row[h['vertical']]
        rr  = row[h['return_reason']]
        cat = row[h['catalog_image']] or ''
        o1  = row[h['obd_image_1']]  or ''
        o2  = row[h['obd_image_2']]  or ''
        o3  = row[h['obd_image_3']]  or ''
        # Only include rows with at least catalog image
        if cat.strip():
            by_bucket[(v, rr)].append({
                'incident_id':   row[h['incident_id']],
                'vertical':      v,
                'return_reason': rr,
                'human_label':   row[h['human_label']],
                'catalog_image': cat,
                'obd_image_1':   o1,
                'obd_image_2':   o2,
                'obd_image_3':   o3,
            })

    # Sample
    samples = {}
    for (v, rr), incidents in by_bucket.items():
        key = (v, rr)
        random.shuffle(incidents)
        samples[key] = incidents[:SAMPLES_PER_BUCKET]

    print(f"  Loaded {sum(len(v) for v in samples.values())} samples across {len(samples)} buckets", flush=True)
    return samples

def load_missing_samples():
    """Load missing incidents from DB (has CX + catalog images)."""
    print("Loading missing incidents from DB...", flush=True)
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    cur.execute("""
        SELECT incident_id, vertical, return_reason,
               human_label, input_data
        FROM records
        WHERE return_reason LIKE '%MISSING%'
          AND marketplace = 'FLIPKART'
          AND agent = 'image_adjudication_cx_agent'
          AND vertical IN ({})
    """.format(','.join('?' * len(VERTICALS))), VERTICALS)
    rows = cur.fetchall()
    con.close()

    by_bucket = defaultdict(list)
    for iid, vert, rr, hl, inp_json in rows:
        try:
            inp = json.loads(inp_json)
        except Exception:
            continue
        cat  = inp.get('product_image', '') or ''
        cx1  = inp.get('customer_image_1_pnp_image_link', '') or ''
        cx2  = inp.get('customer_image_2_pnp_image_link', '') or ''
        cx3  = inp.get('customer_image_3_pnp_image_link', '') or ''
        sub_rr = inp.get('return_sub_reason', '') or ''
        if cat.strip():
            by_bucket[vert].append({
                'incident_id':       iid,
                'vertical':          vert,
                'return_sub_reason': sub_rr,
                'human_label':       hl or '',
                'catalog_image':     cat,
                'cx_image_1':        cx1,
                'cx_image_2':        cx2,
                'cx_image_3':        cx3,
            })

    samples = {}
    for v, incidents in by_bucket.items():
        random.shuffle(incidents)
        samples[v] = incidents[:SAMPLES_PER_BUCKET]

    print(f"  Loaded {sum(len(v) for v in samples.values())} missing samples", flush=True)
    return samples

# ── Single run ────────────────────────────────────────────────────────────
def run_one(task):
    agent_type = task['agent_type']
    sub_type   = task['sub_type']
    vertical   = task['vertical']
    incident   = task['incident']
    pattern    = task['pattern']
    fallback   = task['fallback']

    prompt = load_prompt(agent_type, vertical, pattern, fallback)
    if not prompt:
        return {**task, 'status': 'no_prompt', 'prompt_tokens': 0, 'output_tokens': 0, 'image_count': 0}

    # Collect image URLs
    urls = []
    if agent_type in ('match', 'mismatch', 'damage'):
        urls = [incident.get('catalog_image',''),
                incident.get('obd_image_1',''),
                incident.get('obd_image_2',''),
                incident.get('obd_image_3','')]
    else:  # missing
        urls = [incident.get('catalog_image',''),
                incident.get('cx_image_1',''),
                incident.get('cx_image_2',''),
                incident.get('cx_image_3','')]

    images = fetch_images(urls)
    if not images:
        return {**task, 'status': 'no_images', 'prompt_tokens': 0, 'output_tokens': 0, 'image_count': 0}

    try:
        resp = call_gemini(prompt, images)
        tokens = resp.get('usageMetadata', {})
        output_text = parse_output(resp)
        return {
            'agent_type':      agent_type,
            'sub_type':        sub_type,
            'vertical':        vertical,
            'incident_id':     incident['incident_id'],
            'human_label':     incident.get('human_label', ''),
            'return_reason':   incident.get('return_reason', incident.get('return_sub_reason', '')),
            'prompt_tokens':   tokens.get('promptTokenCount', 0),
            'output_tokens':   tokens.get('candidatesTokenCount', 0),
            'image_count':     len(images),
            'output_snippet':  output_text[:200] if output_text else '',
            'status':          'success',
        }
    except requests.exceptions.Timeout:
        return {**task, 'status': 'timeout', 'prompt_tokens': 0, 'output_tokens': 0, 'image_count': len(images)}
    except Exception as e:
        return {**task, 'status': f'error:{str(e)[:80]}', 'prompt_tokens': 0, 'output_tokens': 0, 'image_count': 0}

# ── Main ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--agent', choices=['match','mismatch','damage','missing','all'], default='all')
    parser.add_argument('--sub-type', dest='sub_type', default=None,
                        help='Comma-separated sub-types to include, e.g. functional_damage,no_damage')
    parser.add_argument('--vertical', default=None,
                        help='Comma-separated verticals to include, e.g. sari,speaker')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--samples', type=int, default=None)
    args = parser.parse_args()

    global SAMPLES_PER_BUCKET
    if args.samples is not None:
        SAMPLES_PER_BUCKET = args.samples

    random.seed(42)

    agent_filter    = None if args.agent == 'all' else [args.agent]
    sub_type_filter = [s.strip() for s in args.sub_type.split(',')] if args.sub_type else None
    vertical_filter = [v.strip() for v in args.vertical.split(',')] if args.vertical else None

    vert_list = [v for v in VERTICALS if vertical_filter is None or v in vertical_filter]

    # match/mismatch both need misshipment+damage data
    need_8v      = not agent_filter or any(a in agent_filter for a in ['match','mismatch','damage'])
    need_missing = not agent_filter or 'missing' in (agent_filter or [])

    # ── Build task list ────────────────────────────────────────────────────
    tasks = []

    if need_8v:
        samples_8v = load_misshipment_damage_samples()

        for vertical in vert_list:
            # Match + Mismatch → use MISSHIPMENT rows
            for agent_type in ['match', 'mismatch']:
                if agent_filter and agent_type not in agent_filter:
                    continue
                for at, sub, pattern, fallback in SUB_AGENTS[agent_type]:
                    if sub_type_filter and sub not in sub_type_filter:
                        continue
                    incidents = samples_8v.get((vertical, 'MISSHIPMENT'), [])
                    for inc in incidents:
                        tasks.append({'agent_type': at, 'sub_type': sub, 'vertical': vertical,
                                      'incident': inc, 'pattern': pattern, 'fallback': fallback})

            # Damage → use DAMAGED_PRODUCT rows
            if not agent_filter or 'damage' in agent_filter:
                for at, sub, pattern, fallback in SUB_AGENTS['damage']:
                    if sub_type_filter and sub not in sub_type_filter:
                        continue
                    incidents = samples_8v.get((vertical, 'DAMAGED_PRODUCT'), [])
                    for inc in incidents:
                        tasks.append({'agent_type': at, 'sub_type': sub, 'vertical': vertical,
                                      'incident': inc, 'pattern': pattern, 'fallback': fallback})

    if need_missing:
        samples_miss = load_missing_samples()
        for vertical in vert_list:
            for at, sub, pattern, fallback in SUB_AGENTS['missing']:
                if sub_type_filter and sub not in sub_type_filter:
                    continue
                incidents = samples_miss.get(vertical, [])
                for inc in incidents:
                    tasks.append({'agent_type': at, 'sub_type': sub, 'vertical': vertical,
                                  'incident': inc, 'pattern': pattern, 'fallback': fallback})

    print(f"\nTotal tasks: {len(tasks):,}", flush=True)

    # Group for dry-run summary
    by_agent = defaultdict(int)
    for t in tasks:
        by_agent[(t['agent_type'], t.get('sub_type'), t['vertical'])] += 1
    print(f"{'Agent':<12} {'Sub-type':<28} {'Vertical':<25} {'Tasks':>6}")
    print("-" * 75)
    for (at, sub, v), cnt in sorted(by_agent.items()):
        print(f"{at:<12} {str(sub):<28} {v:<25} {cnt:>6}")

    if args.dry_run:
        print("\nDry run — exiting.")
        return

    # ── Load existing results ──────────────────────────────────────────────
    results = []
    done_keys = set()
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            results = json.load(f)
        done_keys = {(r['agent_type'], r.get('sub_type'), r['vertical'], r['incident_id'])
                     for r in results if r.get('status') == 'success'}
        print(f"\nResuming — {len(done_keys)} already done", flush=True)

    remaining = [t for t in tasks
                 if (t['agent_type'], t.get('sub_type'), t['vertical'],
                     t['incident']['incident_id']) not in done_keys]
    print(f"Remaining: {len(remaining):,}", flush=True)

    if not remaining:
        print("All done!")
    else:
        save_lock = Lock()
        completed = [0]

        def run_and_save(task):
            result = run_one(task)
            with save_lock:
                results.append(result)
                completed[0] += 1
                if completed[0] % 50 == 0 or completed[0] == len(remaining):
                    with open(OUTPUT_FILE, 'w') as f:
                        json.dump(results, f)
                    success = sum(1 for r in results if r.get('status') == 'success')
                    print(f"  [{completed[0]}/{len(remaining)}] saved — {success} success", flush=True)
            return result

        print(f"\nRunning {len(remaining)} tasks with {MAX_WORKERS} workers...\n", flush=True)
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
            futures = {ex.submit(run_and_save, t): t for t in remaining}
            for fut in as_completed(futures):
                r = fut.result()
                if r.get('status') not in ('success', 'no_images', 'no_prompt'):
                    print(f"  WARN [{r.get('vertical')}/{r.get('agent_type')}/{r.get('sub_type')}]: {r.get('status')}", flush=True)

        with open(OUTPUT_FILE, 'w') as f:
            json.dump(results, f)

    # ── Summary ────────────────────────────────────────────────────────────
    success = [r for r in results if r.get('status') == 'success']
    print(f"\n=== Summary ===")
    print(f"Total results: {len(results)}, Success: {len(success)}")

    by_agent_sub = defaultdict(list)
    for r in success:
        by_agent_sub[(r['agent_type'], r.get('sub_type'))].append(r)

    print(f"\n{'Agent':<12} {'Sub-type':<28} {'N':>5} {'PromptTok min/avg/max':>25} {'OutTok min/avg/max':>25} {'Imgs avg':>8}")
    print("-" * 110)
    for (at, sub), rs in sorted(by_agent_sub.items()):
        pt = [r['prompt_tokens'] for r in rs]
        ot = [r['output_tokens'] for r in rs]
        ic = [r['image_count']   for r in rs]
        print(f"{at:<12} {str(sub):<28} {len(rs):>5} "
              f"{min(pt):>6}/{int(sum(pt)/len(pt)):>6}/{max(pt):>6}          "
              f"{min(ot):>5}/{int(sum(ot)/len(ot)):>5}/{max(ot):>5}       "
              f"{sum(ic)/len(ic):>5.1f}")

    print(f"\nOutput saved to: {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
