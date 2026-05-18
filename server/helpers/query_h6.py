#!/usr/bin/env python3
"""H6 Cross-Model Comparison helper. Reads h6_{model}.json results."""
import json
import os
import sys
import glob as globmod
from collections import Counter, defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESULTS_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'h6_results')
H3_CACHE = os.path.join(BASE_DIR, 'data', 'processed', 'h3_results', 'h3_db_cache.json')

MODEL_LABELS = {
    'gemini_2_5_flash': 'Gemini 2.5 Flash',
    'gemini_3_0_flash': 'Gemini 3.0 Flash',
    'gemini_3_1_pro': 'Gemini 3.1 Pro',
    'gemini_3_1_pro_thinking': 'Gemini 3.1 Pro (Thinking)',
}

MODEL_ORDER = ['gemini_2_5_flash', 'gemini_3_0_flash', 'gemini_3_1_pro', 'gemini_3_1_pro_thinking']


def discover_models():
    models = {}
    for path in sorted(globmod.glob(os.path.join(RESULTS_DIR, 'h6_*.json'))):
        fname = os.path.basename(path)
        if '_checkpoint' in fname:
            continue
        key = fname.replace('h6_', '').replace('.json', '')
        if key in MODEL_LABELS:
            models[key] = path
    return models


def load_model(key):
    path = os.path.join(RESULTS_DIR, f'h6_{key}.json')
    ckpt = os.path.join(RESULTS_DIR, f'h6_{key}_checkpoint.json')
    for p in [path, ckpt]:
        if os.path.exists(p):
            with open(p) as f:
                data = json.load(f)
            is_complete = p == path
            return data, is_complete
    return None, False


def compute_pra(rows):
    """Compute accuracy, macro-precision, macro-recall, and per-class metrics for a list of result rows."""
    valid = [r for r in rows if r.get('rerun_decision') and r.get('human_label')]
    if not valid:
        return 0, 0, 0, {}

    classes = sorted(set(
        [r['human_label'] for r in valid] + [r['rerun_decision'] for r in valid]
    ))

    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    for r in valid:
        pred, true = r['rerun_decision'], r['human_label']
        if pred == true:
            tp[pred] += 1
        else:
            fp[pred] += 1
            fn[true] += 1

    per_class = {}
    for cls in classes:
        support = tp[cls] + fn[cls]
        prec = round(tp[cls] / (tp[cls] + fp[cls]) * 100, 1) if (tp[cls] + fp[cls]) > 0 else None
        rec = round(tp[cls] / (tp[cls] + fn[cls]) * 100, 1) if support > 0 else None
        per_class[cls] = {'precision': prec, 'recall': rec, 'tp': tp[cls],
                          'fp': fp[cls], 'fn': fn[cls], 'support': support}

    scored = [c for c in classes if per_class[c]['precision'] is not None or per_class[c]['recall'] is not None]
    macro_p = round(sum(per_class[c]['precision'] or 0 for c in scored) / len(scored), 1) if scored else 0
    macro_r = round(sum(per_class[c]['recall'] or 0 for c in scored) / len(scored), 1) if scored else 0
    accuracy = round(sum(1 for r in valid if r['rerun_decision'] == r['human_label']) / len(valid) * 100, 1)
    return accuracy, macro_p, macro_r, per_class


def action_summary(params):
    models = discover_models()
    if not models:
        return {'status': 'no_data', 'models': []}

    model_summaries = []
    for key in MODEL_ORDER:
        data, is_complete = load_model(key)
        if not data:
            model_summaries.append({
                'key': key, 'label': MODEL_LABELS.get(key, key),
                'status': 'not_started',
            })
            continue

        results = data.get('results', [])
        summary = data.get('summary', {})

        success = [r for r in results if r.get('status') == 'success']
        correct_vs_human = sum(1 for r in success if r.get('rerun_decision') == r.get('human_label'))
        cx_success = [r for r in success if 'cx' in r.get('agent', '')]
        obd_success = [r for r in success if 'obd' in r.get('agent', '')]
        cx_correct = sum(1 for r in cx_success if r.get('rerun_decision') == r.get('human_label'))
        obd_correct = sum(1 for r in obd_success if r.get('rerun_decision') == r.get('human_label'))

        class_dist = Counter(r.get('rerun_decision', 'None') for r in success)

        accuracy, macro_precision, macro_recall, per_class_metrics = compute_pra(success)
        cx_acc, cx_macro_p, cx_macro_r, cx_per_class = compute_pra(cx_success)
        obd_acc, obd_macro_p, obd_macro_r, obd_per_class = compute_pra(obd_success)

        model_summaries.append({
            'key': key,
            'label': MODEL_LABELS.get(key, key),
            'status': 'complete' if is_complete else 'in_progress',
            'total_rows': len(results),
            'success': len(success),
            'errors': summary.get('errors', 0),
            'timeouts': summary.get('timeouts', 0),
            'no_images': summary.get('no_images', 0),
            'matches_vs_original': summary.get('matches', 0),
            'mismatches_vs_original': summary.get('mismatches', 0),
            'consistency_vs_original': summary.get('consistency_pct', 0),
            # accuracy (correct/total)
            'accuracy': accuracy,
            'accuracy_correct': correct_vs_human,
            'accuracy_n': len(success),
            # macro precision and recall vs human labels
            'macro_precision': macro_precision,
            'macro_recall': macro_recall,
            'per_class_metrics': per_class_metrics,
            # kept for backward compat
            'precision_vs_human': accuracy,
            'precision_vs_human_n': len(success),
            'precision_vs_human_correct': correct_vs_human,
            # CX agent
            'cx_accuracy': cx_acc,
            'cx_macro_precision': cx_macro_p,
            'cx_macro_recall': cx_macro_r,
            'cx_per_class': cx_per_class,
            'cx_precision': cx_acc,
            'cx_n': len(cx_success), 'cx_correct': cx_correct,
            # OBD agent
            'obd_accuracy': obd_acc,
            'obd_macro_precision': obd_macro_p,
            'obd_macro_recall': obd_macro_r,
            'obd_per_class': obd_per_class,
            'obd_precision': obd_acc,
            'obd_n': len(obd_success), 'obd_correct': obd_correct,
            'class_distribution': dict(class_dist),
            'duration_min': summary.get('duration_min', 0),
            # thinking-specific fields (non-zero only for thinking variant)
            'thinking_enabled': 'thinking' in key,
            'avg_thinking_tokens': summary.get('avg_thinking_tokens', 0),
            'has_thinking_pct': summary.get('has_thinking_pct', 0),
        })

    completed_models = [m for m in model_summaries if m.get('status') == 'complete']
    return {
        'status': 'ok',
        'total_models': len(MODEL_ORDER),
        'completed_models': len(completed_models),
        'models': model_summaries,
    }


def action_comparison(params):
    models = discover_models()
    model_keys = sorted(models.keys())
    if len(model_keys) < 2:
        return {'status': 'insufficient_data', 'message': 'Need at least 2 models'}

    all_results = {}
    for key in model_keys:
        data, _ = load_model(key)
        if data:
            keyed = {}
            for r in data.get('results', []):
                if r.get('rerun_decision'):
                    k = f"{r['incident_id']}|{r['agent']}"
                    keyed[k] = r
            all_results[key] = keyed

    common_keys = set.intersection(*[set(v.keys()) for v in all_results.values()])

    three_way_agree = 0
    three_way_total = len(common_keys)
    pairwise = {}
    disagreement_rows = []

    pairs = []
    for i in range(len(model_keys)):
        for j in range(i + 1, len(model_keys)):
            pairs.append((model_keys[i], model_keys[j]))
            pairwise[f"{model_keys[i]}|{model_keys[j]}"] = {
                'agree': 0, 'disagree': 0,
                'matrix': {},
                'per_agent': {'cx': {'agree': 0, 'disagree': 0}, 'obd': {'agree': 0, 'disagree': 0}},
            }

    per_class_three_way = {}

    for key in sorted(common_keys):
        decisions = {mk: all_results[mk][key]['rerun_decision'] for mk in model_keys}
        unique = set(decisions.values())
        sample = all_results[model_keys[0]][key]
        agent_short = 'cx' if 'cx' in sample.get('agent', '') else 'obd'
        human_label = sample.get('human_label', '')
        original = sample.get('original_decision', '')

        per_class_three_way.setdefault(original, {'agree': 0, 'disagree': 0})
        if len(unique) == 1:
            three_way_agree += 1
            per_class_three_way[original]['agree'] += 1
        else:
            per_class_three_way[original]['disagree'] += 1

            # Classify divergence type and find outlier
            vals = list(decisions.values())
            if len(unique) == len(vals):
                divergence_type = 'all_differ'
                outlier_model = None
                majority_decision = None
            else:
                divergence_type = 'two_one_split'
                outlier_model = next(
                    (mk for mk, dec in decisions.items() if vals.count(dec) == 1), None)
                majority_decision = next(
                    (dec for dec in vals if vals.count(dec) > 1), None)

            models_matching_human = [mk for mk, dec in decisions.items() if dec == human_label]

            divergence_rows_append = {
                'incident_id': sample['incident_id'],
                'agent': agent_short,
                'human_label': human_label,
                'original_decision': original,
                'decisions': {mk: decisions[mk] for mk in model_keys},
                'unique_count': len(unique),
                'divergence_type': divergence_type,
                'outlier_model': outlier_model,
                'majority_decision': majority_decision,
                'models_matching_human': models_matching_human,
            }
            disagreement_rows.append(divergence_rows_append)

        for m1, m2 in pairs:
            pair_key = f"{m1}|{m2}"
            d1, d2 = decisions[m1], decisions[m2]
            pw = pairwise[pair_key]
            if d1 == d2:
                pw['agree'] += 1
                pw['per_agent'][agent_short]['agree'] += 1
            else:
                pw['disagree'] += 1
                pw['per_agent'][agent_short]['disagree'] += 1
            matrix_key = f"{d1}|{d2}"
            pw['matrix'][matrix_key] = pw['matrix'].get(matrix_key, 0) + 1

    pairwise_out = []
    for m1, m2 in pairs:
        pk = f"{m1}|{m2}"
        pw = pairwise[pk]
        total = pw['agree'] + pw['disagree']
        per_agent_out = {}
        for ag in ['cx', 'obd']:
            a = pw['per_agent'][ag]
            t = a['agree'] + a['disagree']
            per_agent_out[ag] = {
                **a, 'total': t,
                'agreement_pct': round(a['agree'] / t * 100, 1) if t else 0,
            }

        classes = set()
        for mk in pw['matrix']:
            c1, c2 = mk.split('|')
            classes.add(c1)
            classes.add(c2)
        classes = sorted(classes)
        matrix_grid = []
        for c1 in classes:
            row = {'class': c1}
            for c2 in classes:
                row[c2] = pw['matrix'].get(f"{c1}|{c2}", 0)
            matrix_grid.append(row)

        pairwise_out.append({
            'model_a': m1, 'model_a_label': MODEL_LABELS.get(m1, m1),
            'model_b': m2, 'model_b_label': MODEL_LABELS.get(m2, m2),
            'agree': pw['agree'], 'disagree': pw['disagree'], 'total': total,
            'agreement_pct': round(pw['agree'] / total * 100, 1) if total else 0,
            'per_agent': per_agent_out,
            'matrix_classes': classes,
            'matrix': matrix_grid,
        })

    per_class_out = {}
    for cls, s in per_class_three_way.items():
        t = s['agree'] + s['disagree']
        per_class_out[cls] = {**s, 'total': t,
                               'agreement_pct': round(s['agree'] / t * 100, 1) if t else 0}

    disagreement_rows.sort(key=lambda x: x['unique_count'], reverse=True)

    # Divergence summary stats
    all_differ_rows  = [r for r in disagreement_rows if r['divergence_type'] == 'all_differ']
    two_one_rows     = [r for r in disagreement_rows if r['divergence_type'] == 'two_one_split']
    outlier_counts   = Counter(r['outlier_model'] for r in two_one_rows if r['outlier_model'])
    human_match_counts = Counter(
        mk for r in disagreement_rows for mk in r['models_matching_human'])
    # majority agrees with human on 2-1 rows?
    majority_correct = sum(
        1 for r in two_one_rows
        if r['majority_decision'] and r['majority_decision'] == r['human_label']
    )

    divergence_summary = {
        'all_agree': three_way_agree,
        'two_one_split': len(two_one_rows),
        'all_differ': len(all_differ_rows),
        'all_agree_pct': round(three_way_agree / three_way_total * 100, 1) if three_way_total else 0,
        'two_one_pct': round(len(two_one_rows) / three_way_total * 100, 1) if three_way_total else 0,
        'all_differ_pct': round(len(all_differ_rows) / three_way_total * 100, 1) if three_way_total else 0,
        'outlier_counts': {MODEL_LABELS.get(k, k): v for k, v in outlier_counts.most_common()},
        'outlier_counts_raw': dict(outlier_counts),
        'human_match_counts': {MODEL_LABELS.get(k, k): v for k, v in human_match_counts.most_common()},
        'human_match_counts_raw': dict(human_match_counts),
        'majority_correct_on_2_1': majority_correct,
        'majority_correct_pct': round(majority_correct / len(two_one_rows) * 100, 1) if two_one_rows else 0,
    }

    return {
        'status': 'ok',
        'common_rows': three_way_total,
        'three_way_agree': three_way_agree,
        'three_way_disagree': three_way_total - three_way_agree,
        'three_way_agreement_pct': round(three_way_agree / three_way_total * 100, 1) if three_way_total else 0,
        'per_class_three_way': per_class_out,
        'pairwise': pairwise_out,
        'disagreement_rows': disagreement_rows,   # all rows, no cap
        'disagreement_total': len(disagreement_rows),
        'divergence_summary': divergence_summary,
        'model_keys': model_keys,
    }


def action_data(params):
    models = discover_models()
    model_keys = sorted(models.keys())
    agent_filter = params.get('agent', '')
    agreement_filter = params.get('agreement', '')
    search = params.get('search', '').lower()
    page = params.get('page', 1)
    limit = params.get('limit', 25)

    all_results = {}
    for key in model_keys:
        data, _ = load_model(key)
        if data:
            keyed = {}
            for r in data.get('results', []):
                k = f"{r['incident_id']}|{r['agent']}"
                keyed[k] = r
            all_results[key] = keyed

    if not all_results:
        return {'rows': [], 'total': 0}

    common_keys = set.intersection(*[set(v.keys()) for v in all_results.values()])
    rows = []
    for key in sorted(common_keys):
        sample = all_results[model_keys[0]][key]
        agent_short = 'cx' if 'cx' in sample.get('agent', '') else 'obd'

        if agent_filter and agent_short != agent_filter:
            continue
        if search and search not in sample.get('incident_id', '').lower():
            continue

        decisions = {mk: all_results[mk][key].get('rerun_decision', '') for mk in model_keys}
        unique = set(d for d in decisions.values() if d)
        all_agree = len(unique) <= 1

        if agreement_filter == 'agree' and not all_agree:
            continue
        if agreement_filter == 'disagree' and all_agree:
            continue

        rows.append({
            'incident_id': sample['incident_id'],
            'agent': agent_short,
            'human_label': sample.get('human_label', ''),
            'original_decision': sample.get('original_decision', ''),
            'decisions': decisions,
            'all_agree': all_agree,
            'unique_count': len(unique),
        })

    total = len(rows)
    start = (page - 1) * limit
    return {
        'rows': rows[start:start + limit],
        'total': total,
        'page': page,
        'limit': limit,
        'model_keys': model_keys,
    }


def action_detail(params):
    incident_id = params.get('incident_id')
    agent_short = params.get('agent', '')
    agent_name = f'image_adjudication_{agent_short}_agent' if agent_short else ''

    models = discover_models()
    model_keys = sorted(models.keys())

    model_outputs = {}
    for key in model_keys:
        data, _ = load_model(key)
        if not data:
            continue
        for r in data.get('results', []):
            if r['incident_id'] == incident_id and agent_name in r.get('agent', ''):
                model_outputs[key] = {
                    'decision': r.get('rerun_decision'),
                    'raw': r.get('rerun_raw', ''),
                    'status': r.get('status'),
                    'prompt_tokens': r.get('prompt_tokens', 0),
                    'output_tokens': r.get('output_tokens', 0),
                }
                break

    images = []
    if os.path.exists(H3_CACHE):
        with open(H3_CACHE) as f:
            cache = json.load(f)
        for row in cache:
            if row['incident_id'] == incident_id and agent_name in row.get('agent', ''):
                inp = json.loads(row.get('input_data', '{}'))
                if 'cx_agent' in agent_name:
                    for k in ['customer_image_1_pnp_image_link', 'customer_image_2_pnp_image_link',
                               'customer_image_3_pnp_image_link']:
                        u = inp.get(k, '')
                        if u and u.strip():
                            images.append({'url': u, 'label': k.replace('_pnp_image_link', '')})
                elif 'obd_agent' in agent_name:
                    for k in ['obd_image_1', 'obd_image_2', 'obd_image_3']:
                        u = inp.get(k, '')
                        if u and u.strip():
                            images.append({'url': u, 'label': k})
                prod = inp.get('product_image', '')
                if prod and prod.strip():
                    images.append({'url': prod, 'label': 'product_image'})
                break

    return {
        'incident_id': incident_id,
        'agent': agent_short,
        'model_outputs': model_outputs,
        'images': images,
        'model_keys': model_keys,
    }


def main():
    request = json.loads(sys.stdin.read())
    action = request.get('action')
    try:
        if action == 'summary':
            r = action_summary(request)
        elif action == 'comparison':
            r = action_comparison(request)
        elif action == 'data':
            r = action_data(request)
        elif action == 'detail':
            r = action_detail(request)
        else:
            r = {'error': f'Unknown action: {action}'}
    except Exception as e:
        r = {'error': str(e)}
    json.dump(r, sys.stdout)


if __name__ == '__main__':
    main()
