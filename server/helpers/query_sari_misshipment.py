#!/usr/bin/env python3
"""
Sari Misshipment test data helper.
Reads from pre-processed JSON cache.
"""
import json
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'sari_misshipment.json')

_data = None

def load_data():
    global _data
    if _data is None:
        with open(DATA_PATH, 'r') as f:
            _data = json.load(f)
    return _data


def action_summary(params):
    data = load_data()
    result = {}
    for model, rows in data.items():
        agents = {}
        sub_reasons = {}
        predicted_classes = {}
        human_classes = {}
        unique_incidents = set()
        for r in rows:
            ag = r.get('agent_name', '')
            if ag not in agents:
                agents[ag] = {'total': 0, 'accepted': 0}
            agents[ag]['total'] += 1
            if r.get('is_accepted') == 1:
                agents[ag]['accepted'] += 1

            sr = r.get('return_sub_reason', '')
            sub_reasons[sr] = sub_reasons.get(sr, 0) + 1

            pc = r.get('agent_predicted_class', '')
            predicted_classes[pc] = predicted_classes.get(pc, 0) + 1

            hc = r.get('human_labelled_class', '')
            human_classes[hc] = human_classes.get(hc, 0) + 1

            unique_incidents.add(r.get('invocation_id', ''))

        agent_stats = []
        for ag in sorted(agents):
            s = agents[ag]
            acc = round(s['accepted'] / s['total'] * 100, 1) if s['total'] else 0
            agent_stats.append({'agent': ag, 'total': s['total'], 'accepted': s['accepted'], 'accuracy': acc})

        result[model] = {
            'total_rows': len(rows),
            'unique_incidents': len(unique_incidents),
            'agents': agent_stats,
            'sub_reasons': sub_reasons,
            'predicted_classes': predicted_classes,
            'human_classes': human_classes,
        }
    return result


def action_data(params):
    data = load_data()
    model = params.get('model', 'GEMINI_2_0')
    agent_filter = params.get('agent', '')
    sub_reason_filter = params.get('sub_reason', '')
    search = params.get('search', '')
    page = params.get('page', 1)
    limit = params.get('limit', 25)

    rows = data.get(model, [])

    if agent_filter:
        rows = [r for r in rows if r.get('agent_name') == agent_filter]
    if sub_reason_filter:
        rows = [r for r in rows if r.get('return_sub_reason') == sub_reason_filter]
    if search:
        s = search.lower()
        rows = [r for r in rows if s in str(r.get('order_id', '')).lower()
                or s in str(r.get('invocation_id', '')).lower()
                or s in str(r.get('agent_predicted_class', '')).lower()
                or s in str(r.get('human_labelled_class', '')).lower()
                or s in str(r.get('feedback_data', '')).lower()]

    total = len(rows)
    start = (page - 1) * limit
    page_rows = rows[start:start + limit]

    # Strip verbose fields for list view
    slim = []
    for r in page_rows:
        slim.append({
            'invocation_id': r.get('invocation_id'),
            'order_id': r.get('order_id'),
            'agent_name': r.get('agent_name'),
            'agent_predicted_class': r.get('agent_predicted_class'),
            'human_labelled_class': r.get('human_labelled_class'),
            'is_accepted': r.get('is_accepted'),
            'return_sub_reason': r.get('return_sub_reason'),
            'feedback_data': r.get('feedback_data'),
            'created_at': r.get('created_at'),
        })

    return {
        'rows': slim,
        'total': total,
        'page': page,
        'limit': limit,
        'pages': (total + limit - 1) // limit,
    }


def action_confusion(params):
    """Confusion matrix: predicted vs human label per agent per model."""
    data = load_data()
    result = {}
    for model, rows in data.items():
        agents = {}
        for r in rows:
            ag = r.get('agent_name', '')
            if ag not in agents:
                agents[ag] = {}
            predicted = r.get('agent_predicted_class', '') or 'None'
            human = r.get('human_labelled_class', '') or 'None'
            key = f"{predicted}|{human}"
            agents[ag][key] = agents[ag].get(key, 0) + 1
        result[model] = agents
    return result


def main():
    request = json.loads(sys.stdin.read())
    action = request.get('action')

    if not os.path.exists(DATA_PATH):
        print(json.dumps({'error': 'Data file not found'}))
        return

    try:
        if action == 'summary':
            r = action_summary(request)
        elif action == 'data':
            r = action_data(request)
        elif action == 'confusion':
            r = action_confusion(request)
        else:
            r = {'error': f'Unknown action: {action}'}
        print(json.dumps(r))
    except Exception as e:
        print(json.dumps({'error': str(e)}))


if __name__ == '__main__':
    main()
