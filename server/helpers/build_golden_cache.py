#!/usr/bin/env python3
"""
Pre-compute golden evaluation dataset and cache to JSON.
Run once: python3 server/helpers/build_golden_cache.py
Output: data/processed/golden_set_cache.json
"""
import json
import os
import sqlite3
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
CACHE_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'golden_set_cache.json')
GOLDEN_SIZE = 50


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    print("Finding qualifying cohorts...")
    cur.execute("""
        SELECT marketplace, vertical, return_reason,
               COUNT(DISTINCT incident_id) as total_incidents,
               COUNT(DISTINCT agent) as agent_count
        FROM records
        GROUP BY marketplace, vertical, return_reason
        HAVING COUNT(DISTINCT incident_id) >= ?
        ORDER BY COUNT(DISTINCT incident_id) DESC
    """, (GOLDEN_SIZE,))
    cohorts = [dict(r) for r in cur.fetchall()]
    print(f"  Found {len(cohorts)} qualifying cohorts")

    all_cohort_data = []
    total_rows = 0

    for i, c in enumerate(cohorts):
        mp, vert, rr = c['marketplace'], c['vertical'], c['return_reason']

        # Get golden incident_ids
        cur.execute("""
            SELECT DISTINCT incident_id FROM records
            WHERE marketplace=? AND vertical=? AND return_reason=?
            ORDER BY incident_id LIMIT ?
        """, (mp, vert, rr, GOLDEN_SIZE))
        golden_ids = [r['incident_id'] for r in cur.fetchall()]

        placeholders = ','.join('?' * len(golden_ids))

        # Get all rows for golden incidents
        cur.execute(f"""
            SELECT incident_id, agent, predicted_class, human_label, is_accepted
            FROM records
            WHERE marketplace=? AND vertical=? AND return_reason=?
              AND incident_id IN ({placeholders})
            ORDER BY incident_id, agent
        """, [mp, vert, rr] + golden_ids)
        rows = [dict(r) for r in cur.fetchall()]
        total_rows += len(rows)

        # Per-agent accuracy
        agent_stats = {}
        for r in rows:
            ag = r['agent']
            if ag not in agent_stats:
                agent_stats[ag] = {'correct': 0, 'total': 0}
            if r['is_accepted'] is not None:
                agent_stats[ag]['total'] += 1
                if r['is_accepted'] == 1:
                    agent_stats[ag]['correct'] += 1

        agents = []
        for ag in sorted(agent_stats):
            s = agent_stats[ag]
            acc = round(s['correct'] / s['total'] * 100, 1) if s['total'] else 0
            agents.append({'agent': ag, 'correct': s['correct'], 'total': s['total'], 'accuracy': acc})

        overall_correct = sum(s['correct'] for s in agent_stats.values())
        overall_total = sum(s['total'] for s in agent_stats.values())
        accuracy = round(overall_correct / overall_total * 100, 1) if overall_total else 0

        # Per-incident detail
        incident_map = {}
        for r in rows:
            iid = r['incident_id']
            if iid not in incident_map:
                incident_map[iid] = {'incident_id': iid, 'agents': {}, 'human_label': r['human_label']}
            incident_map[iid]['agents'][r['agent']] = {
                'predicted': r['predicted_class'],
                'accepted': r['is_accepted'],
            }
        incidents = [incident_map[iid] for iid in golden_ids if iid in incident_map]

        all_cohort_data.append({
            'marketplace': mp,
            'vertical': vert,
            'return_reason': rr,
            'total_incidents': c['total_incidents'],
            'agent_count': c['agent_count'],
            'golden_count': GOLDEN_SIZE,
            'total_rows': len(rows),
            'accuracy': accuracy,
            'agents': agents,
            'incidents': incidents,
        })

        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(cohorts)} cohorts...")

    # Build summary
    mp_breakdown = {}
    rr_breakdown = {}
    for c in all_cohort_data:
        mp = c['marketplace']
        mp_breakdown[mp] = mp_breakdown.get(mp, 0) + 1
        rr = c['return_reason']
        rr_breakdown[rr] = rr_breakdown.get(rr, 0) + 1

    total_cohorts = len(all_cohort_data)
    avg_accuracy = round(sum(c['accuracy'] for c in all_cohort_data) / total_cohorts, 1) if total_cohorts else 0

    cache = {
        'summary': {
            'total_cohorts': total_cohorts,
            'total_incidents': total_cohorts * GOLDEN_SIZE,
            'total_rows': total_rows,
            'avg_accuracy': avg_accuracy,
            'golden_size': GOLDEN_SIZE,
            'by_marketplace': mp_breakdown,
            'by_return_reason': rr_breakdown,
        },
        'cohorts': all_cohort_data,
    }

    with open(CACHE_PATH, 'w') as f:
        json.dump(cache, f)

    size_mb = os.path.getsize(CACHE_PATH) / (1024 * 1024)
    print(f"\nDone! Cached {total_cohorts} cohorts, {total_rows} rows to {CACHE_PATH} ({size_mb:.1f} MB)")
    conn.close()


if __name__ == '__main__':
    main()
