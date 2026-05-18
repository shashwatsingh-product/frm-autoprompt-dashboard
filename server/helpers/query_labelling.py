#!/usr/bin/env python3
"""
Query helper for labelling SQLite database.
Called from Node.js with JSON args on stdin, returns JSON on stdout.

Actions:
  - filters: Return available filter options
  - query: Return paginated, filtered records
  - download: Return all matching records (no pagination) for CSV export
  - stats: Return summary stats for current filters
"""
import json
import os
import sqlite3
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')


def get_conn():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def build_where(params):
    clauses = []
    values = []

    if params.get('agents'):
        placeholders = ','.join('?' * len(params['agents']))
        clauses.append(f"agent IN ({placeholders})")
        values.extend(params['agents'])

    if params.get('verticals'):
        placeholders = ','.join('?' * len(params['verticals']))
        clauses.append(f"vertical IN ({placeholders})")
        values.extend(params['verticals'])

    if params.get('reasons'):
        placeholders = ','.join('?' * len(params['reasons']))
        clauses.append(f"return_reason IN ({placeholders})")
        values.extend(params['reasons'])

    if params.get('marketplaces'):
        placeholders = ','.join('?' * len(params['marketplaces']))
        clauses.append(f"marketplace IN ({placeholders})")
        values.extend(params['marketplaces'])

    if params.get('date_from'):
        clauses.append("feedback_date >= ?")
        values.append(params['date_from'])

    if params.get('date_to'):
        clauses.append("feedback_date <= ?")
        values.append(params['date_to'])

    if params.get('search'):
        clauses.append("incident_id LIKE ?")
        values.append(f"%{params['search']}%")

    where = " AND ".join(clauses) if clauses else "1=1"
    return where, values


def get_filters(conn):
    rows = conn.execute("SELECT filter_type, filter_value FROM filter_options ORDER BY filter_type, filter_value").fetchall()
    result = {}
    for row in rows:
        ft = row['filter_type']
        if ft not in result:
            result[ft] = []
        result[ft].append(row['filter_value'])

    # Also get date range
    date_row = conn.execute("SELECT MIN(feedback_date) as min_date, MAX(feedback_date) as max_date FROM records WHERE feedback_date != ''").fetchone()
    result['date_range'] = {
        'min': date_row['min_date'] or '',
        'max': date_row['max_date'] or '',
    }

    total = conn.execute("SELECT COUNT(*) as cnt FROM records").fetchone()['cnt']
    result['total_records'] = total

    return result


def query_records(conn, params):
    where, values = build_where(params)
    page = max(1, params.get('page', 1))
    page_size = min(100, max(10, params.get('page_size', 25)))
    offset = (page - 1) * page_size

    count_row = conn.execute(f"SELECT COUNT(*) as cnt FROM records WHERE {where}", values).fetchone()
    total = count_row['cnt']

    rows = conn.execute(
        f"""SELECT id, incident_id, agent, vertical, return_reason, marketplace,
               feedback_date, predicted_class, human_label, is_accepted, feedback_by
        FROM records WHERE {where}
        ORDER BY feedback_date DESC, incident_id
        LIMIT ? OFFSET ?""",
        values + [page_size, offset]
    ).fetchall()

    records = []
    for r in rows:
        records.append({
            'id': r['id'],
            'incident_id': r['incident_id'],
            'agent': r['agent'],
            'vertical': r['vertical'],
            'return_reason': r['return_reason'],
            'marketplace': r['marketplace'],
            'feedback_date': r['feedback_date'],
            'predicted_class': r['predicted_class'],
            'human_label': r['human_label'],
            'is_accepted': r['is_accepted'],
            'feedback_by': r['feedback_by'],
        })

    return {
        'records': records,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size if total > 0 else 0,
    }


def get_record_detail(conn, record_id):
    row = conn.execute(
        "SELECT * FROM records WHERE id = ?", [record_id]
    ).fetchone()
    if not row:
        return None
    return {
        'id': row['id'],
        'incident_id': row['incident_id'],
        'agent': row['agent'],
        'vertical': row['vertical'],
        'return_reason': row['return_reason'],
        'marketplace': row['marketplace'],
        'feedback_date': row['feedback_date'],
        'predicted_class': row['predicted_class'],
        'human_label': row['human_label'],
        'is_accepted': row['is_accepted'],
        'feedback_by': row['feedback_by'],
        'input_data': row['input_data'],
        'agent_output': row['agent_output'],
        'prompt': row['prompt'],
    }


def download_records(conn, params):
    where, values = build_where(params)
    limit = min(10000, params.get('limit', 5000))

    rows = conn.execute(
        f"""SELECT incident_id, agent, vertical, return_reason, marketplace,
               feedback_date, predicted_class, human_label, is_accepted, feedback_by,
               input_data, agent_output, prompt
        FROM records WHERE {where}
        ORDER BY feedback_date DESC, incident_id
        LIMIT ?""",
        values + [limit]
    ).fetchall()

    records = []
    for r in rows:
        records.append({
            'incident_id': r['incident_id'],
            'agent': r['agent'],
            'vertical': r['vertical'],
            'return_reason': r['return_reason'],
            'marketplace': r['marketplace'],
            'feedback_date': r['feedback_date'],
            'predicted_class': r['predicted_class'],
            'human_label': r['human_label'],
            'is_accepted': r['is_accepted'],
            'feedback_by': r['feedback_by'],
            'input_data': r['input_data'],
            'agent_output': r['agent_output'],
            'prompt': r['prompt'],
        })

    return {'records': records, 'total_exported': len(records)}


def get_stats(conn, params):
    where, values = build_where(params)

    total = conn.execute(f"SELECT COUNT(*) as cnt FROM records WHERE {where}", values).fetchone()['cnt']

    agents = conn.execute(
        f"SELECT agent, COUNT(*) as cnt FROM records WHERE {where} GROUP BY agent ORDER BY cnt DESC",
        values
    ).fetchall()

    match_count = conn.execute(
        f"SELECT COUNT(*) as cnt FROM records WHERE {where} AND predicted_class = human_label",
        values
    ).fetchone()['cnt']

    return {
        'total': total,
        'accuracy': round(match_count / total, 4) if total > 0 else 0,
        'agents': [{'agent': r['agent'], 'count': r['cnt']} for r in agents],
    }


def main():
    request = json.loads(sys.stdin.read())
    action = request.get('action', 'filters')

    conn = get_conn()
    if conn is None:
        print(json.dumps({'error': 'Database not found. Run preprocess_labelling.py first.'}))
        return

    try:
        if action == 'filters':
            result = get_filters(conn)
        elif action == 'query':
            result = query_records(conn, request)
        elif action == 'detail':
            result = get_record_detail(conn, request.get('record_id'))
        elif action == 'download':
            result = download_records(conn, request)
        elif action == 'stats':
            result = get_stats(conn, request)
        else:
            result = {'error': f'Unknown action: {action}'}

        print(json.dumps(result))
    finally:
        conn.close()


if __name__ == '__main__':
    main()
