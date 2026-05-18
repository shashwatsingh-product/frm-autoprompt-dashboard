#!/usr/bin/env python3
"""
Recompute simulation_data.json from labelling.db with THREE metric sets:
- 'all': all records regardless of prompt version
- 'current': only records where is_current_production = 1
  (labelling was done with the same prompt currently in production)
- 'simulated': LLM re-simulation results from simulation_results table
  (all records re-run through current production prompts via Gemini)

Reads HPC/MPC classification from hpc_mpc_data.json.
"""
import json
import os
import sqlite3
from collections import defaultdict, Counter

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
PROMPTS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'prompts_data.json')
HPC_MPC_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'hpc_mpc_data.json')
OUT_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'simulation_data.json')

# Load HPC/MPC lookup
hpc_mpc_lookup = {}
if os.path.exists(HPC_MPC_PATH):
    with open(HPC_MPC_PATH) as f:
        hpc_mpc_lookup = json.load(f).get('lookup', {})
    print(f"HPC/MPC lookup: {len(hpc_mpc_lookup)} entries")

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

print("Loading records from labelling.db...")
rows = conn.execute("""
    SELECT r.id, r.agent, r.vertical, r.return_reason, r.marketplace,
           r.predicted_class, r.human_label, r.prompt_id, r.feedback_date,
           r.is_current_production,
           s.simulated_class, s.is_correct as sim_correct
    FROM records r
    LEFT JOIN simulation_results s ON r.id = s.record_id AND s.error IS NULL
""").fetchall()

print(f"  Loaded {len(rows):,} records")

records = []
sim_count = 0
for r in rows:
    has_sim = r['simulated_class'] is not None and r['simulated_class'] != ''
    if has_sim:
        sim_count += 1
    records.append({
        'agent': r['agent'],
        'vertical': r['vertical'],
        'return_reason': r['return_reason'],
        'marketplace': r['marketplace'],
        'predicted': r['predicted_class'] or '',
        'human_label': r['human_label'] or '',
        'prompt_id': r['prompt_id'] or '',
        'is_current': r['is_current_production'] == 1,
        'timestamp': r['feedback_date'] or '',
        'simulated_class': r['simulated_class'] or '',
        'has_sim': has_sim,
    })

conn.close()

current_count = sum(1 for r in records if r['is_current'])
old_count = sum(1 for r in records if not r['is_current'])
print(f"  Current production prompt: {current_count:,} records")
print(f"  Old/unknown prompt: {old_count:,} records")
print(f"  With simulation results: {sim_count:,} records")


def compute_metrics(recs):
    if not recs:
        return None
    classes = sorted(set(r['predicted'] for r in recs if r['predicted']) |
                     set(r['human_label'] for r in recs if r['human_label']))
    total = len(recs)
    correct = sum(1 for r in recs if r['predicted'] == r['human_label'])
    accuracy = correct / total if total > 0 else 0

    per_class = {}
    for cls in classes:
        if not cls:
            continue
        tp = sum(1 for r in recs if r['predicted'] == cls and r['human_label'] == cls)
        fp = sum(1 for r in recs if r['predicted'] == cls and r['human_label'] != cls)
        fn = sum(1 for r in recs if r['predicted'] != cls and r['human_label'] == cls)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        per_class[cls] = {
            'precision': round(precision, 4),
            'recall': round(recall, 4),
            'f1': round(f1, 4),
            'tp': tp, 'fp': fp, 'fn': fn,
            'support': tp + fn,
        }

    if per_class:
        macro_p = sum(c['precision'] for c in per_class.values()) / len(per_class)
        macro_r = sum(c['recall'] for c in per_class.values()) / len(per_class)
        macro_f1 = sum(c['f1'] for c in per_class.values()) / len(per_class)
    else:
        macro_p = macro_r = macro_f1 = 0

    return {
        'total': total,
        'correct': correct,
        'accuracy': round(accuracy, 4),
        'macro_precision': round(macro_p, 4),
        'macro_recall': round(macro_r, 4),
        'macro_f1': round(macro_f1, 4),
        'per_class': per_class,
    }


def compute_sim_metrics(recs):
    """Compute metrics using simulated predictions vs human labels."""
    sim_recs = [r for r in recs if r.get('has_sim')]
    if not sim_recs:
        return None
    classes = sorted(set(r['simulated_class'] for r in sim_recs if r['simulated_class']) |
                     set(r['human_label'] for r in sim_recs if r['human_label']))
    total = len(sim_recs)
    correct = sum(1 for r in sim_recs if r['simulated_class'] == r['human_label'])
    accuracy = correct / total if total > 0 else 0

    per_class = {}
    for cls in classes:
        if not cls:
            continue
        tp = sum(1 for r in sim_recs if r['simulated_class'] == cls and r['human_label'] == cls)
        fp = sum(1 for r in sim_recs if r['simulated_class'] == cls and r['human_label'] != cls)
        fn = sum(1 for r in sim_recs if r['simulated_class'] != cls and r['human_label'] == cls)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
        per_class[cls] = {
            'precision': round(precision, 4),
            'recall': round(recall, 4),
            'f1': round(f1, 4),
            'tp': tp, 'fp': fp, 'fn': fn,
            'support': tp + fn,
        }

    if per_class:
        macro_p = sum(c['precision'] for c in per_class.values()) / len(per_class)
        macro_r = sum(c['recall'] for c in per_class.values()) / len(per_class)
        macro_f1 = sum(c['f1'] for c in per_class.values()) / len(per_class)
    else:
        macro_p = macro_r = macro_f1 = 0

    return {
        'total': total,
        'correct': correct,
        'accuracy': round(accuracy, 4),
        'macro_precision': round(macro_p, 4),
        'macro_recall': round(macro_r, 4),
        'macro_f1': round(macro_f1, 4),
        'per_class': per_class,
    }


def merge_metrics(all_m, current_m, sim_m=None):
    """Merge all, current-production, and simulated metrics into a single dict."""
    result = dict(all_m)
    if current_m:
        result['total_current'] = current_m['total']
        result['correct_current'] = current_m['correct']
        result['accuracy_current'] = current_m['accuracy']
        result['macro_precision_current'] = current_m['macro_precision']
        result['macro_recall_current'] = current_m['macro_recall']
        result['macro_f1_current'] = current_m['macro_f1']
        result['per_class_current'] = current_m['per_class']
    else:
        result['total_current'] = 0
        result['correct_current'] = 0
        result['accuracy_current'] = 0
        result['macro_precision_current'] = 0
        result['macro_recall_current'] = 0
        result['macro_f1_current'] = 0
        result['per_class_current'] = {}

    if sim_m:
        result['total_simulated'] = sim_m['total']
        result['correct_simulated'] = sim_m['correct']
        result['accuracy_simulated'] = sim_m['accuracy']
        result['macro_precision_simulated'] = sim_m['macro_precision']
        result['macro_recall_simulated'] = sim_m['macro_recall']
        result['macro_f1_simulated'] = sim_m['macro_f1']
        result['per_class_simulated'] = sim_m['per_class']
    else:
        result['total_simulated'] = 0
        result['correct_simulated'] = 0
        result['accuracy_simulated'] = 0
        result['macro_precision_simulated'] = 0
        result['macro_recall_simulated'] = 0
        result['macro_f1_simulated'] = 0
        result['per_class_simulated'] = {}
    return result


def get_hpc_mpc(vertical, return_reason):
    return hpc_mpc_lookup.get(f"{vertical}|{return_reason}", None)


# Agent-level metrics
print("Computing agent-level metrics...")
agent_groups = defaultdict(list)
for r in records:
    agent_groups[r['agent']].append(r)

agent_metrics = []
for agent in sorted(agent_groups.keys()):
    recs = agent_groups[agent]
    current_recs = [r for r in recs if r['is_current']]
    all_m = compute_metrics(recs)
    current_m = compute_metrics(current_recs)
    sim_m = compute_sim_metrics(recs)
    if all_m:
        entry = {'agent': agent, **merge_metrics(all_m, current_m, sim_m)}
        agent_metrics.append(entry)
        cur_acc = f"{current_m['accuracy']:.3f}" if current_m else "N/A"
        sim_acc = f"{sim_m['accuracy']:.3f}" if sim_m else "N/A"
        sim_n = sim_m['total'] if sim_m else 0
        print(f"  {agent}: {all_m['total']} all (acc={all_m['accuracy']:.3f}), "
              f"{len(current_recs)} current (acc={cur_acc}), "
              f"{sim_n} simulated (acc={sim_acc})")

agent_metrics.sort(key=lambda x: -x['total'])

# Cohort-level metrics
print("Computing cohort-level metrics...")
cohort_groups = defaultdict(list)
for r in records:
    key = (r['agent'], r['marketplace'], r['vertical'], r['return_reason'])
    cohort_groups[key].append(r)

cohort_metrics = []
hpc_count = mpc_count = unclassified = 0
for (agent, mkt, vert, reason), recs in cohort_groups.items():
    current_recs = [r for r in recs if r['is_current']]
    all_m = compute_metrics(recs)
    current_m = compute_metrics(current_recs)
    if all_m:
        prompt_ids = Counter(r['prompt_id'] for r in recs if r['prompt_id'])
        dominant_prompt_id = prompt_ids.most_common(1)[0][0] if prompt_ids else ''

        classification = get_hpc_mpc(vert, reason)
        if classification == 'HPC':
            hpc_count += 1
        elif classification == 'MPC':
            mpc_count += 1
        else:
            unclassified += 1

        sim_m = compute_sim_metrics(recs)
        entry = {
            'agent': agent,
            'marketplace': mkt,
            'vertical': vert,
            'return_reason': reason,
            'prompt_id': dominant_prompt_id,
            'hpc_mpc': classification or '',
            **merge_metrics(all_m, current_m, sim_m),
        }
        cohort_metrics.append(entry)

cohort_metrics.sort(key=lambda x: (-x['total'], x['agent']))
print(f"  {len(cohort_metrics)} cohort-agent combinations")
print(f"  HPC: {hpc_count}, MPC: {mpc_count}, Unclassified: {unclassified}")

cohorts_with_current = sum(1 for c in cohort_metrics if c['total_current'] > 0)
print(f"  Cohorts with current-prompt data: {cohorts_with_current}")

# Summary
total_all = len(records)
total_current = current_count
total_simulated = sim_count
timestamps = [r['timestamp'] for r in records if r['timestamp']]
ts_min = min(timestamps) if timestamps else ''
ts_max = max(timestamps) if timestamps else ''

cohorts_with_sim = sum(1 for c in cohort_metrics if c['total_simulated'] > 0)

output = {
    'summary': {
        'total_records': total_all,
        'total_current_records': total_current,
        'total_simulated_records': total_simulated,
        'total_incidents': len(set(r.get('vertical', '') + r.get('return_reason', '') for r in records)),
        'agents_evaluated': len(agent_metrics),
        'cohorts_evaluated': len(cohort_metrics),
        'cohorts_with_current': cohorts_with_current,
        'cohorts_with_simulated': cohorts_with_sim,
        'timestamp_range': {'from': ts_min, 'to': ts_max},
        'hpc_mpc_stats': {'hpc': hpc_count, 'mpc': mpc_count, 'unclassified': unclassified},
    },
    'agent_metrics': agent_metrics,
    'cohort_metrics': cohort_metrics,
}

with open(OUT_PATH, 'w') as f:
    json.dump(output, f, indent=2)

print(f"\nOutput: {OUT_PATH}")
print(f"  Total records: {total_all:,}")
print(f"  Current production prompt: {total_current:,} ({total_current*100//total_all}%)")
print(f"  Old/unknown prompt: {total_all - total_current:,} ({(total_all-total_current)*100//total_all}%)")
print(f"  Simulated: {total_simulated:,} ({total_simulated*100//max(total_all,1)}%)")
print(f"  {len(agent_metrics)} agent summaries, {len(cohort_metrics)} cohort metrics")
print("Done!")
