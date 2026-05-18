#!/usr/bin/env python3
"""H2 Cohort Sensitivity helper. Reads h2_pg_prod.json (Prod vs PG divergence, April 1-8)."""
import json
import os
import sys
from collections import Counter, defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'processed', 'h2_pg_prod.json')

VERTICALS = ['cases_covers', 'ethnic_set', 'jean', 'sari', 'shirt']
DECISION_CLASSES = ['Misshipment', 'No Issue', "Can't Say", 'Multiple Issue',
                    'Minor Missing', 'Major Missing', 'Minor Damage', 'Major Damage']


def load_data():
    with open(DATA_FILE) as f:
        return json.load(f)


def flip_matrix(rows, prod_col, pg_col):
    flips = Counter(
        (r[prod_col], r[pg_col])
        for r in rows
        if r.get(prod_col) and r.get(pg_col) and r[prod_col] != r[pg_col]
    )
    return [{'from': f, 'to': t, 'count': c} for (f, t), c in flips.most_common(15)]


def vertical_stats(rows, prod_col, pg_col):
    by_vert = defaultdict(list)
    for r in rows:
        v = r.get('cms_vertical', '')
        if v:
            by_vert[v].append(r)

    result = []
    for v in VERTICALS:
        vrows = by_vert.get(v, [])
        if not vrows:
            continue
        n = len(vrows)
        agree = sum(1 for r in vrows if r.get(prod_col) == r.get(pg_col))
        miss_down = sum(1 for r in vrows if r.get(prod_col) == 'Misshipment' and r.get(pg_col) != 'Misshipment')
        miss_up = sum(1 for r in vrows if r.get(prod_col) != 'Misshipment' and r.get(pg_col) == 'Misshipment')
        result.append({
            'vertical': v, 'n': n,
            'agree': agree,
            'agree_pct': round(agree / n * 100, 1),
            'miss_downgrade': miss_down,
            'miss_upgrade': miss_up,
            'net_miss': miss_up - miss_down,
        })
    return result


def action_summary(params):
    rows = load_data()
    n = len(rows)

    obd_agree = sum(1 for r in rows if r.get('obd_decision_prod') == r.get('obd_decision_pg'))
    cx_agree = sum(1 for r in rows if r.get('cx_decision_prod') == r.get('cx_decision_pg'))

    obd_miss_down = sum(1 for r in rows if r.get('obd_decision_prod') == 'Misshipment' and r.get('obd_decision_pg') != 'Misshipment')
    obd_miss_up = sum(1 for r in rows if r.get('obd_decision_prod') != 'Misshipment' and r.get('obd_decision_pg') == 'Misshipment')
    cx_miss_down = sum(1 for r in rows if r.get('cx_decision_prod') == 'Misshipment' and r.get('cx_decision_pg') != 'Misshipment')
    cx_miss_up = sum(1 for r in rows if r.get('cx_decision_prod') != 'Misshipment' and r.get('cx_decision_pg') == 'Misshipment')

    return {
        'status': 'ok',
        'meta': {'total_incidents': n, 'date_range': 'April 1–8', 'verticals': VERTICALS},
        'overall': {
            'obd_agree_pct': round(obd_agree / n * 100, 1),
            'cx_agree_pct': round(cx_agree / n * 100, 1),
            'obd_diverge': n - obd_agree,
            'cx_diverge': n - cx_agree,
            'obd_miss_downgrade': obd_miss_down,
            'obd_miss_upgrade': obd_miss_up,
            'obd_net_miss': obd_miss_up - obd_miss_down,
            'cx_miss_downgrade': cx_miss_down,
            'cx_miss_upgrade': cx_miss_up,
            'cx_net_miss': cx_miss_up - cx_miss_down,
        },
        'obd_by_vertical': vertical_stats(rows, 'obd_decision_prod', 'obd_decision_pg'),
        'cx_by_vertical': vertical_stats(rows, 'cx_decision_prod', 'cx_decision_pg'),
        'obd_flip_matrix': flip_matrix(rows, 'obd_decision_prod', 'obd_decision_pg'),
        'cx_flip_matrix': flip_matrix(rows, 'cx_decision_prod', 'cx_decision_pg'),
        'obd_prod_dist': dict(Counter(r.get('obd_decision_prod', '') for r in rows if r.get('obd_decision_prod'))),
        'cx_prod_dist': dict(Counter(r.get('cx_decision_prod', '') for r in rows if r.get('cx_decision_prod'))),
        'obd_pg_dist': dict(Counter(r.get('obd_decision_pg', '') for r in rows if r.get('obd_decision_pg'))),
        'cx_pg_dist': dict(Counter(r.get('cx_decision_pg', '') for r in rows if r.get('cx_decision_pg'))),
    }


def action_incidents(params):
    rows = load_data()
    vertical = params.get('vertical', '')
    diverge_only = params.get('diverge_only', '') == 'true'
    agent = params.get('agent', 'both')  # 'obd', 'cx', 'both'
    page = int(params.get('page', 1))
    page_size = int(params.get('page_size', 100))

    filtered = rows
    if vertical:
        filtered = [r for r in filtered if r.get('cms_vertical') == vertical]
    if diverge_only:
        if agent == 'obd':
            filtered = [r for r in filtered if r.get('obd_decision_prod') != r.get('obd_decision_pg')]
        elif agent == 'cx':
            filtered = [r for r in filtered if r.get('cx_decision_prod') != r.get('cx_decision_pg')]
        else:
            filtered = [r for r in filtered if
                        r.get('obd_decision_prod') != r.get('obd_decision_pg') or
                        r.get('cx_decision_prod') != r.get('cx_decision_pg')]

    total = len(filtered)
    start = (page - 1) * page_size
    page_rows = filtered[start:start + page_size]

    return {
        'status': 'ok',
        'total': total,
        'page': page,
        'page_size': page_size,
        'rows': page_rows,
    }


def main():
    inp = json.loads(sys.stdin.read())
    action = inp.get('action', 'summary')
    params = inp.get('params', {})
    if action == 'summary':
        result = action_summary(params)
    elif action == 'incidents':
        result = action_incidents(params)
    else:
        result = {'status': 'error', 'message': f'Unknown action: {action}'}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
