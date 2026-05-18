#!/usr/bin/env python3
"""
Golden evaluation dataset helper — reads from pre-computed cache.
Run build_golden_cache.py first to generate the cache file.

Actions:
  - summary: Overview stats for qualifying MPC cohorts
  - cohorts: Paginated list of qualifying cohorts with accuracy
  - cohort_detail: Per-agent breakdown + incident list for one cohort
"""
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'golden_set_cache.json')

_cache = None

def load_cache():
    global _cache
    if _cache is None:
        with open(CACHE_PATH, 'r') as f:
            _cache = json.load(f)
    return _cache


def action_summary(params):
    cache = load_cache()
    return cache['summary']


def action_cohorts(params):
    cache = load_cache()
    search = params.get('search', '')
    marketplace_filter = params.get('marketplace', '')
    reason_filter = params.get('return_reason', '')
    sort_col = params.get('sort', 'total_incidents')
    sort_dir = params.get('sort_dir', 'desc')
    page = params.get('page', 1)
    limit = params.get('limit', 20)

    # Strip incident-level detail for the list view
    cohorts = []
    for c in cache['cohorts']:
        cohorts.append({
            'marketplace': c['marketplace'],
            'vertical': c['vertical'],
            'return_reason': c['return_reason'],
            'total_incidents': c['total_incidents'],
            'agent_count': c['agent_count'],
            'golden_count': c['golden_count'],
            'total_rows': c['total_rows'],
            'accuracy': c['accuracy'],
        })

    # Apply filters
    if search:
        s = search.lower()
        cohorts = [c for c in cohorts if s in c['vertical'].lower() or s in c['return_reason'].lower()]
    if marketplace_filter:
        cohorts = [c for c in cohorts if c['marketplace'] == marketplace_filter]
    if reason_filter:
        cohorts = [c for c in cohorts if c['return_reason'] == reason_filter]

    # Sort
    valid_sorts = {'total_incidents', 'accuracy', 'vertical', 'marketplace', 'return_reason', 'agent_count'}
    if sort_col not in valid_sorts:
        sort_col = 'total_incidents'
    reverse = sort_dir.lower() != 'asc'
    cohorts.sort(key=lambda c: c.get(sort_col, ''), reverse=reverse)

    total = len(cohorts)
    start = (page - 1) * limit
    page_cohorts = cohorts[start:start + limit]

    # Filter options
    all_mp = sorted(set(c['marketplace'] for c in cache['cohorts']))
    all_rr = sorted(set(c['return_reason'] for c in cache['cohorts']))

    return {
        'cohorts': page_cohorts,
        'total': total,
        'page': page,
        'limit': limit,
        'pages': (total + limit - 1) // limit,
        'filters': {
            'marketplaces': all_mp,
            'return_reasons': all_rr,
        }
    }


def action_cohort_detail(params):
    cache = load_cache()
    mp = params['marketplace']
    vert = params['vertical']
    rr = params['return_reason']

    for c in cache['cohorts']:
        if c['marketplace'] == mp and c['vertical'] == vert and c['return_reason'] == rr:
            return {
                'marketplace': mp,
                'vertical': vert,
                'return_reason': rr,
                'agents': c['agents'],
                'incidents': c['incidents'],
                'total_incidents': len(c['incidents']),
                'overall_accuracy': c['accuracy'],
            }

    return {'agents': [], 'incidents': [], 'total_incidents': 0}


def main():
    request = json.loads(sys.stdin.read())
    action = request.get('action')

    if not os.path.exists(CACHE_PATH):
        print(json.dumps({'error': 'Cache not found. Run build_golden_cache.py first.'}))
        return

    try:
        if action == 'summary':
            result = action_summary(request)
        elif action == 'cohorts':
            result = action_cohorts(request)
        elif action == 'cohort_detail':
            result = action_cohort_detail(request)
        else:
            result = {'error': f'Unknown action: {action}'}
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))


if __name__ == '__main__':
    main()
