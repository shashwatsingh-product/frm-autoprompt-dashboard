#!/usr/bin/env python3
"""
H3 Non-Determinism test results helper.
Supports multi-run: h3_run_1.json ... h3_run_10.json, plus legacy h3_full_results.json / h3_checkpoint.json.
"""
import json
import os
import sys
import glob as globmod

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESULTS_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'h3_results')
TOTAL_TARGET = 1574


def load_single_run(run_id):
    final = os.path.join(RESULTS_DIR, f'h3_run_{run_id}.json')
    ckpt = os.path.join(RESULTS_DIR, f'h3_run_{run_id}_checkpoint.json')
    if run_id == 1:
        legacy_final = os.path.join(RESULTS_DIR, 'h3_full_results.json')
        legacy_ckpt = os.path.join(RESULTS_DIR, 'h3_checkpoint.json')
    else:
        legacy_final = legacy_ckpt = None

    for path in [final, legacy_final, ckpt, legacy_ckpt]:
        if path and os.path.exists(path):
            with open(path) as f:
                data = json.load(f)
            is_complete = path in (final, legacy_final) and not path.endswith('checkpoint.json')
            return data.get('results', []), is_complete
    return [], False


def discover_runs():
    runs = {}
    for path in sorted(globmod.glob(os.path.join(RESULTS_DIR, 'h3_run_*.json'))):
        fname = os.path.basename(path)
        if '_checkpoint' in fname:
            continue
        try:
            rid = int(fname.replace('h3_run_', '').replace('.json', ''))
            runs[rid] = True
        except ValueError:
            pass
    for path in sorted(globmod.glob(os.path.join(RESULTS_DIR, 'h3_run_*_checkpoint.json'))):
        fname = os.path.basename(path)
        try:
            rid = int(fname.replace('h3_run_', '').replace('_checkpoint.json', ''))
            if rid not in runs:
                runs[rid] = False
        except ValueError:
            pass
    legacy_final = os.path.join(RESULTS_DIR, 'h3_full_results.json')
    legacy_ckpt = os.path.join(RESULTS_DIR, 'h3_checkpoint.json')
    if os.path.exists(legacy_final) or os.path.exists(legacy_ckpt):
        if 1 not in runs:
            runs[1] = os.path.exists(legacy_final)
    return runs


def compute_run_stats(results):
    if not results:
        return None
    compared = [r for r in results if r.get('match') is not None]
    matches = sum(1 for r in compared if r.get('match') is True)
    mismatches = sum(1 for r in compared if r.get('match') is False)
    total_compared = len(compared)

    cx = [r for r in compared if 'cx' in r.get('agent', '')]
    obd = [r for r in compared if 'obd' in r.get('agent', '')]
    cx_match = sum(1 for r in cx if r.get('match') is True)
    obd_match = sum(1 for r in obd if r.get('match') is True)

    return {
        'total_rows': len(results),
        'total_compared': total_compared,
        'matches': matches,
        'mismatches': mismatches,
        'errors': len(results) - total_compared,
        'consistency_pct': round(matches / total_compared * 100, 1) if total_compared else 0,
        'cx_consistency_pct': round(cx_match / len(cx) * 100, 1) if cx else 0,
        'obd_consistency_pct': round(obd_match / len(obd) * 100, 1) if obd else 0,
    }


def compute_precision(rows):
    all_classes = sorted(set(
        [r.get('original_decision') for r in rows] +
        [r.get('rerun_decision') for r in rows]
    ), key=lambda x: x or '')
    prec = {}
    for cls in all_classes:
        if not cls:
            continue
        orig_pred = [r for r in rows if r.get('original_decision') == cls]
        orig_correct = sum(1 for r in orig_pred if r.get('human_label') == cls)
        rerun_pred = [r for r in rows if r.get('rerun_decision') == cls]
        rerun_correct = sum(1 for r in rerun_pred if r.get('human_label') == cls)
        prec[cls] = {
            'original_predicted': len(orig_pred),
            'original_correct': orig_correct,
            'original_precision': round(orig_correct / len(orig_pred) * 100, 1) if orig_pred else 0,
            'rerun_predicted': len(rerun_pred),
            'rerun_correct': rerun_correct,
            'rerun_precision': round(rerun_correct / len(rerun_pred) * 100, 1) if rerun_pred else 0,
        }
    return prec


# ─── Actions ───────────────────────────────────────────────────────

def action_summary(params):
    run_id = params.get('run_id')
    if run_id:
        return _single_run_summary(run_id)
    runs = discover_runs()
    if not runs:
        return {'status': 'no_data', 'is_complete': False}
    if len(runs) == 1:
        return _single_run_summary(list(runs.keys())[0])
    return _single_run_summary(list(runs.keys())[0])


def _single_run_summary(run_id):
    results, is_complete = load_single_run(run_id)
    if not results:
        return {'status': 'no_data', 'is_complete': False, 'run_id': run_id}

    matches = [r for r in results if r.get('match') is True]
    mismatches = [r for r in results if r.get('match') is False]
    errors = [r for r in results if r.get('match') is None]
    total_compared = len(matches) + len(mismatches)

    cx = [r for r in results if 'cx' in r.get('agent', '')]
    obd = [r for r in results if 'obd' in r.get('agent', '')]
    cx_match = sum(1 for r in cx if r.get('match') is True)
    obd_match = sum(1 for r in obd if r.get('match') is True)
    cx_compared = sum(1 for r in cx if r.get('match') is not None)
    obd_compared = sum(1 for r in obd if r.get('match') is not None)

    class_stats = {}
    for r in results:
        if r.get('match') is None:
            continue
        cls = r.get('original_decision', 'Unknown')
        if cls not in class_stats:
            class_stats[cls] = {'matches': 0, 'mismatches': 0, 'total': 0}
        class_stats[cls]['total'] += 1
        if r['match']:
            class_stats[cls]['matches'] += 1
        else:
            class_stats[cls]['mismatches'] += 1

    per_class = {}
    for cls, s in class_stats.items():
        per_class[cls] = {
            'consistency': round(s['matches'] / s['total'] * 100, 1) if s['total'] else 0,
            'matches': s['matches'],
            'mismatches': s['mismatches'],
            'total': s['total'],
        }

    flip_dirs = {}
    for r in mismatches:
        key = f"{r.get('original_decision', '?')} \u2192 {r.get('rerun_decision', '?')}"
        flip_dirs[key] = flip_dirs.get(key, 0) + 1

    degraded = improved = lateral = 0
    for r in mismatches:
        human = r.get('human_label', '')
        orig_correct = r.get('original_decision') == human
        rerun_correct = r.get('rerun_decision') == human
        if orig_correct and not rerun_correct:
            degraded += 1
        elif not orig_correct and rerun_correct:
            improved += 1
        else:
            lateral += 1

    compared = [r for r in results if r.get('match') is not None]
    precision = {
        'overall': compute_precision(compared),
        'cx': compute_precision([r for r in compared if 'cx' in r.get('agent', '')]),
        'obd': compute_precision([r for r in compared if 'obd' in r.get('agent', '')]),
    }

    return {
        'run_id': run_id,
        'status': 'complete' if is_complete else 'in_progress',
        'is_complete': is_complete,
        'total_rows': len(results),
        'total_target': TOTAL_TARGET,
        'progress_pct': round(len(results) / TOTAL_TARGET * 100, 1),
        'total_compared': total_compared,
        'matches': len(matches),
        'mismatches': len(mismatches),
        'errors': len(errors),
        'consistency_pct': round(len(matches) / total_compared * 100, 1) if total_compared else 0,
        'cx_consistency_pct': round(cx_match / cx_compared * 100, 1) if cx_compared else 0,
        'obd_consistency_pct': round(obd_match / obd_compared * 100, 1) if obd_compared else 0,
        'cx_compared': cx_compared,
        'obd_compared': obd_compared,
        'per_class': per_class,
        'flip_directions': dict(sorted(flip_dirs.items(), key=lambda x: -x[1])),
        'impact': {'degraded': degraded, 'improved': improved, 'lateral': lateral},
        'precision': precision,
    }


def action_multi_summary(params):
    """Summary across all runs + mismatch pattern analysis."""
    runs_map = discover_runs()
    if not runs_map:
        return {'status': 'no_data'}

    run_ids = sorted(runs_map.keys())
    per_run = []
    all_run_data = {}

    for rid in run_ids:
        results, is_complete = load_single_run(rid)
        stats = compute_run_stats(results)
        if stats:
            stats['run_id'] = rid
            stats['is_complete'] = is_complete
            per_run.append(stats)
        all_run_data[rid] = results

    # Mismatch pattern: for each incident+agent key, how many runs had a mismatch?
    mismatch_freq = {}
    incident_runs = {}
    for rid in run_ids:
        for r in all_run_data.get(rid, []):
            key = f"{r.get('incident_id')}|{r.get('agent', '').replace('image_adjudication_', '').replace('_agent', '')}"
            if key not in mismatch_freq:
                mismatch_freq[key] = {'mismatch_count': 0, 'run_count': 0,
                                       'incident_id': r.get('incident_id'),
                                       'agent': r.get('agent', '').replace('image_adjudication_', '').replace('_agent', ''),
                                       'original_decision': r.get('original_decision'),
                                       'human_label': r.get('human_label', ''),
                                       'rerun_decisions': {}}
            mismatch_freq[key]['run_count'] += 1
            rd = r.get('rerun_decision', '?')
            mismatch_freq[key]['rerun_decisions'][f'run_{rid}'] = rd
            if r.get('match') is False:
                mismatch_freq[key]['mismatch_count'] += 1
            if key not in incident_runs:
                incident_runs[key] = {}
            incident_runs[key][rid] = r.get('match')

    total_runs = len(run_ids)
    buckets = {'always': 0, 'frequent': 0, 'occasional': 0, 'rare': 0, 'never': 0}
    pattern_rows = []
    for key, info in mismatch_freq.items():
        mc = info['mismatch_count']
        rc = info['run_count']
        if rc == 0:
            continue
        freq = mc / rc
        if mc == rc and rc == total_runs:
            cat = 'always'
        elif freq >= 0.7:
            cat = 'frequent'
        elif freq >= 0.3:
            cat = 'occasional'
        elif mc > 0:
            cat = 'rare'
        else:
            cat = 'never'
        buckets[cat] += 1
        if mc > 0:
            pattern_rows.append({
                'incident_id': info['incident_id'],
                'agent': info['agent'],
                'original_decision': info['original_decision'],
                'human_label': info['human_label'],
                'mismatch_count': mc,
                'run_count': rc,
                'mismatch_rate': round(mc / rc * 100, 1),
                'category': cat,
                'rerun_decisions': info['rerun_decisions'],
            })

    pattern_rows.sort(key=lambda x: -x['mismatch_count'])

    # Aggregate precision across all runs
    all_compared = []
    for rid in run_ids:
        for r in all_run_data.get(rid, []):
            if r.get('match') is not None:
                all_compared.append(r)

    avg_precision = {
        'overall': compute_precision(all_compared),
        'cx': compute_precision([r for r in all_compared if 'cx' in r.get('agent', '')]),
        'obd': compute_precision([r for r in all_compared if 'obd' in r.get('agent', '')]),
    }

    return {
        'status': 'ok',
        'total_runs': total_runs,
        'run_ids': run_ids,
        'per_run': per_run,
        'pattern_buckets': buckets,
        'pattern_rows': pattern_rows[:200],
        'pattern_total': len(pattern_rows),
        'avg_precision': avg_precision,
    }


def action_data(params):
    run_id = params.get('run_id', 1)
    results, _ = load_single_run(run_id)
    page = params.get('page', 1)
    limit = params.get('limit', 25)
    agent_filter = params.get('agent', '')
    match_filter = params.get('match_filter', '')
    search = params.get('search', '')

    filtered = results
    if agent_filter:
        filtered = [r for r in filtered if agent_filter in r.get('agent', '')]
    if match_filter == 'match':
        filtered = [r for r in filtered if r.get('match') is True]
    elif match_filter == 'mismatch':
        filtered = [r for r in filtered if r.get('match') is False]
    elif match_filter == 'error':
        filtered = [r for r in filtered if r.get('match') is None]
    if search:
        s = search.lower()
        filtered = [r for r in filtered if s in str(r.get('incident_id', '')).lower()
                    or s in str(r.get('original_decision', '')).lower()
                    or s in str(r.get('rerun_decision', '')).lower()]

    total = len(filtered)
    start = (page - 1) * limit
    page_rows = filtered[start:start + limit]

    slim = []
    for r in page_rows:
        slim.append({
            'incident_id': r.get('incident_id'),
            'agent': r.get('agent', '').replace('image_adjudication_', '').replace('_agent', ''),
            'original_decision': r.get('original_decision'),
            'rerun_decision': r.get('rerun_decision'),
            'rerun_raw': r.get('rerun_raw', ''),
            'human_label': r.get('human_label'),
            'match': r.get('match'),
            'status': r.get('status'),
            'image_count': r.get('image_count', 0),
        })

    return {
        'rows': slim,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit if total else 0,
        'run_id': run_id,
    }


def action_mismatches(params):
    run_id = params.get('run_id', 1)
    results, _ = load_single_run(run_id)
    mismatches = [r for r in results if r.get('match') is False]

    page = params.get('page', 1)
    limit = params.get('limit', 25)
    agent_filter = params.get('agent', '')

    if agent_filter:
        mismatches = [r for r in mismatches if agent_filter in r.get('agent', '')]

    total = len(mismatches)
    start = (page - 1) * limit
    page_rows = mismatches[start:start + limit]

    slim = []
    for r in page_rows:
        slim.append({
            'incident_id': r.get('incident_id'),
            'agent': r.get('agent', '').replace('image_adjudication_', '').replace('_agent', ''),
            'original_decision': r.get('original_decision'),
            'rerun_decision': r.get('rerun_decision'),
            'human_label': r.get('human_label'),
            'image_count': r.get('image_count', 0),
        })

    return {
        'rows': slim,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit if total else 0,
    }


def action_detail(params):
    import sqlite3
    incident_id = params.get('incident_id', '')
    agent_short = params.get('agent', '')
    run_id = params.get('run_id', 1)

    agent_name = f'image_adjudication_{agent_short}_agent' if agent_short else ''

    db_path = os.path.join(os.path.dirname(RESULTS_DIR), 'labelling.db')
    if not os.path.exists(db_path):
        return {'error': 'labelling.db not found'}

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT agent_output FROM records WHERE incident_id = ? AND agent = ? LIMIT 1",
        (incident_id, agent_name)
    ).fetchone()
    conn.close()

    if not row:
        return {'original_raw': None}

    raw = row['agent_output']
    try:
        parsed = json.loads(raw)
        original_raw = json.dumps(parsed, indent=2)
    except (json.JSONDecodeError, TypeError):
        original_raw = str(raw)

    results, _ = load_single_run(run_id)
    rerun_raw = ''
    for r in results:
        if r.get('incident_id') == incident_id and agent_name in r.get('agent', ''):
            rerun_raw = r.get('rerun_raw', '')
            break

    return {
        'original_raw': original_raw[:2000] if original_raw else None,
        'rerun_raw': rerun_raw,
    }


def action_inter_run(params):
    """Analyse consistency BETWEEN runs (not vs original)."""
    runs_map = discover_runs()
    if not runs_map:
        return {'status': 'no_data'}

    run_ids = sorted(runs_map.keys())

    # Build per-key index: key → {run_id → row}
    keyed = {}
    for rid in run_ids:
        results, _ = load_single_run(rid)
        for r in results:
            if r.get('rerun_decision') is None:
                continue
            key = f"{r.get('incident_id')}|{r.get('agent', '')}"
            keyed.setdefault(key, {})[rid] = r

    # Analyse each incident+agent across runs
    consistent_count = 0
    inconsistent_rows = []
    per_agent_stats = {'cx': {'consistent': 0, 'inconsistent': 0}, 'obd': {'consistent': 0, 'inconsistent': 0}}

    for key, run_rows in keyed.items():
        if len(run_rows) < 2:
            continue
        decisions = {rid: row['rerun_decision'] for rid, row in run_rows.items()}
        unique = set(decisions.values())
        sample = next(iter(run_rows.values()))
        agent_short = 'cx' if 'cx' in sample.get('agent', '') else 'obd'
        human_label = sample.get('human_label', '')
        original_decision = sample.get('original_decision', '')

        is_consistent = len(unique) == 1
        if is_consistent:
            consistent_count += 1
            per_agent_stats[agent_short]['consistent'] += 1
        else:
            per_agent_stats[agent_short]['inconsistent'] += 1
            from collections import Counter
            decision_counts = Counter(decisions.values())
            majority = decision_counts.most_common(1)[0][0]
            inconsistent_rows.append({
                'incident_id': sample.get('incident_id'),
                'agent': agent_short,
                'original_decision': original_decision,
                'human_label': human_label,
                'decisions': {f'run_{rid}': dec for rid, dec in sorted(decisions.items())},
                'unique_decisions': sorted(unique),
                'majority_decision': majority,
                'agreement_pct': round(decision_counts[majority] / len(decisions) * 100, 1),
                'run_count': len(decisions),
            })

    total = consistent_count + len(inconsistent_rows)
    inconsistent_rows.sort(key=lambda x: x['agreement_pct'])

    # Image URLs from cache
    cache_path = os.path.join(RESULTS_DIR, 'h3_db_cache.json')
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            cache = json.load(f)
        img_map = {}
        for row in cache:
            rkey = f"{row.get('incident_id')}|{row.get('agent', '')}"
            inp = json.loads(row.get('input_data', '{}'))
            imgs = []
            ag = row.get('agent', '')
            if 'cx_agent' in ag:
                for k in ['customer_image_1_pnp_image_link', 'customer_image_2_pnp_image_link',
                           'customer_image_3_pnp_image_link']:
                    u = inp.get(k, '')
                    if u and u.strip():
                        imgs.append(u)
            elif 'obd_agent' in ag:
                for k in ['obd_image_1', 'obd_image_2', 'obd_image_3']:
                    u = inp.get(k, '')
                    if u and u.strip():
                        imgs.append(u)
            prod = inp.get('product_image', '')
            if prod and prod.strip():
                imgs.append(prod)
            img_map[rkey] = imgs
        for entry in inconsistent_rows:
            full_agent = f"image_adjudication_{entry['agent']}_agent"
            ekey = f"{entry['incident_id']}|{full_agent}"
            entry['images'] = img_map.get(ekey, [])

    # Per-run precision (rerun_decision vs human_label)
    per_run_prec = {}
    for rid in run_ids:
        results, _ = load_single_run(rid)
        valid = [r for r in results if r.get('rerun_decision') and r.get('human_label')]
        correct = sum(1 for r in valid if r['rerun_decision'] == r['human_label'])
        cx_v = [r for r in valid if 'cx' in r.get('agent', '')]
        cx_c = sum(1 for r in cx_v if r['rerun_decision'] == r['human_label'])
        obd_v = [r for r in valid if 'obd' in r.get('agent', '')]
        obd_c = sum(1 for r in obd_v if r['rerun_decision'] == r['human_label'])
        per_run_prec[rid] = {
            'overall': round(correct / len(valid) * 100, 1) if valid else 0,
            'overall_n': len(valid), 'overall_correct': correct,
            'cx': round(cx_c / len(cx_v) * 100, 1) if cx_v else 0,
            'cx_n': len(cx_v), 'cx_correct': cx_c,
            'obd': round(obd_c / len(obd_v) * 100, 1) if obd_v else 0,
            'obd_n': len(obd_v), 'obd_correct': obd_c,
        }

    # Per-class inter-run consistency
    class_stats = {}
    for key, run_rows in keyed.items():
        if len(run_rows) < 2:
            continue
        decisions = [row['rerun_decision'] for row in run_rows.values()]
        unique = set(decisions)
        sample = next(iter(run_rows.values()))
        orig = sample.get('original_decision', 'Unknown')
        class_stats.setdefault(orig, {'consistent': 0, 'inconsistent': 0})
        if len(unique) == 1:
            class_stats[orig]['consistent'] += 1
        else:
            class_stats[orig]['inconsistent'] += 1
    per_class = {}
    for cls, s in class_stats.items():
        t = s['consistent'] + s['inconsistent']
        per_class[cls] = {
            'consistent': s['consistent'], 'inconsistent': s['inconsistent'],
            'total': t,
            'consistency_pct': round(s['consistent'] / t * 100, 1) if t else 0,
        }

    return {
        'status': 'ok',
        'total_runs': len(run_ids),
        'run_ids': run_ids,
        'total_pairs': total,
        'consistent_count': consistent_count,
        'inconsistent_count': len(inconsistent_rows),
        'inter_run_consistency_pct': round(consistent_count / total * 100, 1) if total else 0,
        'per_agent': {
            ag: {**s, 'total': s['consistent'] + s['inconsistent'],
                 'consistency_pct': round(s['consistent'] / (s['consistent'] + s['inconsistent']) * 100, 1)
                 if (s['consistent'] + s['inconsistent']) else 0}
            for ag, s in per_agent_stats.items()
        },
        'per_class': per_class,
        'per_run_precision': {str(k): v for k, v in per_run_prec.items()},
        'inconsistent_rows': inconsistent_rows[:300],
        'inconsistent_total': len(inconsistent_rows),
    }


def main():
    request = json.loads(sys.stdin.read())
    action = request.get('action')
    try:
        if action == 'summary':
            r = action_summary(request)
        elif action == 'multi_summary':
            r = action_multi_summary(request)
        elif action == 'inter_run':
            r = action_inter_run(request)
        elif action == 'mismatches':
            r = action_mismatches(request)
        elif action == 'data':
            r = action_data(request)
        elif action == 'detail':
            r = action_detail(request)
        else:
            r = {'error': f'Unknown action: {action}'}
        print(json.dumps(r))
    except Exception as e:
        print(json.dumps({'error': str(e)}))


if __name__ == '__main__':
    main()
