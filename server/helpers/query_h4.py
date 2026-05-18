#!/usr/bin/env python3
"""H4 Data Drift analysis helper — Sari Misshipment labelling patterns.
Analyses catalog images, OBD images, and CX images separately."""
import json
import os
import sqlite3
import sys
from collections import Counter, defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')

VERTICAL = 'sari'
REASON = 'MISSHIPMENT'

AGENTS = {
    'catalog': 'catalog_correctness_agent',
    'obd': 'image_adjudication_obd_agent',
    'cx': 'image_adjudication_cx_agent',
}

EXPECTED_LABELS = {
    'catalog': {'Issue', 'No Issue'},
    'obd':     {'Misshipment', 'No Issue', "Can't Say"},
    'cx':      {'Misshipment', 'No Issue', "Can't Say"},
}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def per_class_stats(rows):
    """Return per-class accuracy, precision, recall from list of (predicted, human) tuples."""
    classes = sorted(set(pred for pred, _ in rows) | set(human for _, human in rows))
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    for pred, human in rows:
        if pred == human:
            tp[pred] += 1
        else:
            fp[pred] += 1
            fn[human] += 1

    out = {}
    for cls in classes:
        support = tp[cls] + fn[cls]
        prec = round(tp[cls] / (tp[cls] + fp[cls]) * 100, 1) if (tp[cls] + fp[cls]) > 0 else None
        rec  = round(tp[cls] / support * 100, 1) if support > 0 else None
        acc  = round(tp[cls] / support * 100, 1) if support > 0 else None
        out[cls] = {'precision': prec, 'recall': rec, 'accuracy': acc,
                    'tp': tp[cls], 'fp': fp[cls], 'fn': fn[cls], 'support': support}
    return out


def is_correct(r):
    return r['predicted_class'] == r['human_label']


def analyze_catalog(conn):
    rows = conn.execute("""
        SELECT predicted_class, human_label, input_data, feedback_date
        FROM records
        WHERE vertical=? AND return_reason=? AND agent=?
    """, [VERTICAL, REASON, AGENTS['catalog']]).fetchall()

    total = len(rows)
    has_image = sum(1 for r in rows if json.loads(r['input_data']).get('product_image', '').strip())
    correct = sum(1 for r in rows if is_correct(r))

    label_dist = Counter(r['human_label'] for r in rows)
    pred_dist  = Counter(r['predicted_class'] for r in rows)
    pairs = [(r['predicted_class'], r['human_label']) for r in rows]
    cls_stats = per_class_stats(pairs)

    mismatches = Counter()
    for r in rows:
        if not is_correct(r):
            mismatches[f"{r['predicted_class']} → {r['human_label']}"] += 1

    monthly = defaultdict(lambda: {'cnt': 0, 'correct': 0})
    for r in rows:
        m = (r['feedback_date'] or '')[:7]
        monthly[m]['cnt'] += 1
        if is_correct(r):
            monthly[m]['correct'] += 1
    monthly_out = [{'month': m, 'cnt': v['cnt'],
                    'accuracy': round(v['correct'] / v['cnt'] * 100, 1) if v['cnt'] else 0}
                   for m, v in sorted(monthly.items()) if m]

    new_entities = [l for l in label_dist if l not in EXPECTED_LABELS['catalog']]
    cant_say_n = label_dist.get("Can't Say", 0)

    return {
        'total': total,
        'has_image': has_image,
        'image_coverage_pct': round(has_image / total * 100, 1) if total else 0,
        'overall_accuracy': round(correct / total * 100, 1) if total else 0,
        'cant_say_n': cant_say_n,
        'cant_say_pct': round(cant_say_n / total * 100, 1) if total else 0,
        'label_distribution': dict(sorted(label_dist.items(), key=lambda x: -x[1])),
        'predicted_distribution': dict(sorted(pred_dist.items(), key=lambda x: -x[1])),
        'per_class': cls_stats,
        'top_mismatches': [{'pattern': k, 'count': v}
                           for k, v in mismatches.most_common(10)],
        'monthly': monthly_out,
        'new_entities': new_entities,
        'expected_labels': sorted(EXPECTED_LABELS['catalog']),
    }


def analyze_obd(conn):
    rows = conn.execute("""
        SELECT predicted_class, human_label, input_data, feedback_date
        FROM records
        WHERE vertical=? AND return_reason=? AND agent=?
    """, [VERTICAL, REASON, AGENTS['obd']]).fetchall()

    total = len(rows)
    has_obd = 0
    no_obd = 0
    sub_acc = defaultdict(lambda: {'cnt': 0, 'correct': 0})
    img_vs_noimg = {'with_img': {'cnt': 0, 'correct': 0}, 'no_img': {'cnt': 0, 'correct': 0}}

    for r in rows:
        d = json.loads(r['input_data'])
        sub = d.get('return_sub_reason', '(none)')
        sub_acc[sub]['cnt'] += 1
        ok = is_correct(r)
        if ok:
            sub_acc[sub]['correct'] += 1
        if d.get('obd_image_1', '').strip():
            has_obd += 1
            img_vs_noimg['with_img']['cnt'] += 1
            if ok:
                img_vs_noimg['with_img']['correct'] += 1
        else:
            no_obd += 1
            img_vs_noimg['no_img']['cnt'] += 1
            if ok:
                img_vs_noimg['no_img']['correct'] += 1

    correct = sum(1 for r in rows if is_correct(r))
    label_dist = Counter(r['human_label'] for r in rows)
    pred_dist  = Counter(r['predicted_class'] for r in rows)
    pairs = [(r['predicted_class'], r['human_label']) for r in rows]
    cls_stats = per_class_stats(pairs)

    mismatches = Counter()
    for r in rows:
        if not is_correct(r):
            mismatches[f"{r['predicted_class']} → {r['human_label']}"] += 1

    monthly = defaultdict(lambda: {'cnt': 0, 'correct': 0})
    for r in rows:
        m = (r['feedback_date'] or '')[:7]
        monthly[m]['cnt'] += 1
        if is_correct(r):
            monthly[m]['correct'] += 1
    monthly_out = [{'month': m, 'cnt': v['cnt'],
                    'accuracy': round(v['correct'] / v['cnt'] * 100, 1) if v['cnt'] else 0}
                   for m, v in sorted(monthly.items()) if m]

    new_entities = [l for l in label_dist if l not in EXPECTED_LABELS['obd']]
    cant_say_n = label_dist.get("Can't Say", 0)

    sub_breakdown = [
        {'sub_reason': sub, 'count': s['cnt'],
         'accuracy': round(s['correct'] / s['cnt'] * 100, 1) if s['cnt'] else 0}
        for sub, s in sorted(sub_acc.items(), key=lambda x: -x[1]['cnt'])
    ]

    wi = img_vs_noimg['with_img']
    ni = img_vs_noimg['no_img']
    return {
        'total': total,
        'has_image': has_obd,
        'no_image': no_obd,
        'image_coverage_pct': round(has_obd / total * 100, 1) if total else 0,
        'overall_accuracy': round(correct / total * 100, 1) if total else 0,
        'cant_say_n': cant_say_n,
        'cant_say_pct': round(cant_say_n / total * 100, 1) if total else 0,
        'label_distribution': dict(sorted(label_dist.items(), key=lambda x: -x[1])),
        'predicted_distribution': dict(sorted(pred_dist.items(), key=lambda x: -x[1])),
        'per_class': cls_stats,
        'top_mismatches': [{'pattern': k, 'count': v}
                           for k, v in mismatches.most_common(10)],
        'monthly': monthly_out,
        'new_entities': new_entities,
        'expected_labels': sorted(EXPECTED_LABELS['obd']),
        'sub_reason_breakdown': sub_breakdown,
        'img_vs_noimg': {
            'with_img_acc': round(wi['correct'] / wi['cnt'] * 100, 1) if wi['cnt'] else 0,
            'no_img_acc':   round(ni['correct'] / ni['cnt'] * 100, 1) if ni['cnt'] else 0,
            'with_img_n': wi['cnt'],
            'no_img_n':   ni['cnt'],
        },
    }


def analyze_cx(conn):
    rows = conn.execute("""
        SELECT predicted_class, human_label, input_data, feedback_date
        FROM records
        WHERE vertical=? AND return_reason=? AND agent=?
    """, [VERTICAL, REASON, AGENTS['cx']]).fetchall()

    total = len(rows)
    has_cx = 0
    sub_acc = defaultdict(lambda: {'cnt': 0, 'correct': 0})
    img_cnt_dist = Counter()

    for r in rows:
        d = json.loads(r['input_data'])
        sub = d.get('return_sub_reason', '(none)')
        sub_acc[sub]['cnt'] += 1
        ok = is_correct(r)
        if ok:
            sub_acc[sub]['correct'] += 1
        n_imgs = sum(1 for k in ['customer_image_1_pnp_image_link',
                                  'customer_image_2_pnp_image_link',
                                  'customer_image_3_pnp_image_link']
                     if d.get(k, '').strip())
        img_cnt_dist[n_imgs] += 1
        if n_imgs > 0:
            has_cx += 1

    correct = sum(1 for r in rows if is_correct(r))
    label_dist = Counter(r['human_label'] for r in rows)
    pred_dist  = Counter(r['predicted_class'] for r in rows)
    pairs = [(r['predicted_class'], r['human_label']) for r in rows]
    cls_stats = per_class_stats(pairs)

    mismatches = Counter()
    for r in rows:
        if not is_correct(r):
            mismatches[f"{r['predicted_class']} → {r['human_label']}"] += 1

    monthly = defaultdict(lambda: {'cnt': 0, 'correct': 0})
    for r in rows:
        m = (r['feedback_date'] or '')[:7]
        monthly[m]['cnt'] += 1
        if is_correct(r):
            monthly[m]['correct'] += 1
    monthly_out = [{'month': m, 'cnt': v['cnt'],
                    'accuracy': round(v['correct'] / v['cnt'] * 100, 1) if v['cnt'] else 0}
                   for m, v in sorted(monthly.items()) if m]

    new_entities = [l for l in label_dist if l not in EXPECTED_LABELS['cx']]
    cant_say_n = label_dist.get("Can't Say", 0)

    sub_breakdown = [
        {'sub_reason': sub.replace('DIFFERENT_', '').replace('_RECEIVED', '').replace('_FROM_WEBSITE', ''),
         'raw': sub, 'count': s['cnt'],
         'accuracy': round(s['correct'] / s['cnt'] * 100, 1) if s['cnt'] else 0}
        for sub, s in sorted(sub_acc.items(), key=lambda x: -x[1]['cnt'])
    ]

    return {
        'total': total,
        'has_image': has_cx,
        'no_image': total - has_cx,
        'image_coverage_pct': round(has_cx / total * 100, 1) if total else 0,
        'image_count_dist': {str(k): v for k, v in sorted(img_cnt_dist.items())},
        'overall_accuracy': round(correct / total * 100, 1) if total else 0,
        'cant_say_n': cant_say_n,
        'cant_say_pct': round(cant_say_n / total * 100, 1) if total else 0,
        'label_distribution': dict(sorted(label_dist.items(), key=lambda x: -x[1])),
        'predicted_distribution': dict(sorted(pred_dist.items(), key=lambda x: -x[1])),
        'per_class': cls_stats,
        'top_mismatches': [{'pattern': k, 'count': v}
                           for k, v in mismatches.most_common(10)],
        'monthly': monthly_out,
        'new_entities': new_entities,
        'expected_labels': sorted(EXPECTED_LABELS['cx']),
        'sub_reason_breakdown': sub_breakdown,
    }


def main():
    request = json.loads(sys.stdin.read())
    action = request.get('action', 'all')
    conn = get_conn()
    try:
        if action == 'all':
            result = {
                'status': 'ok',
                'catalog': analyze_catalog(conn),
                'obd': analyze_obd(conn),
                'cx': analyze_cx(conn),
            }
        elif action == 'catalog':
            result = {'status': 'ok', **analyze_catalog(conn)}
        elif action == 'obd':
            result = {'status': 'ok', **analyze_obd(conn)}
        elif action == 'cx':
            result = {'status': 'ok', **analyze_cx(conn)}
        else:
            result = {'error': f'Unknown action: {action}'}
        json.dump(result, sys.stdout)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
