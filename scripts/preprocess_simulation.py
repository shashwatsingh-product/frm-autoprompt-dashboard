#!/usr/bin/env python3
"""
Extract agent predictions vs human labels from feedback_output.csv.gz.
Produces simulation_data.json with per-incident records for computing
precision/recall/F1 at cohort (vertical x return_reason x marketplace) level.
"""
import csv
import gzip
import json
import os
import sys
from collections import defaultdict

csv.field_size_limit(sys.maxsize)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(BASE_DIR, 'data', 'raw')
OUT_DIR = os.path.join(BASE_DIR, 'data', 'processed')

FEEDBACK_FILE = os.path.expanduser(
    '~/claude-project/Documents/Return-Adjudication-Automation/feedback_output.csv.gz'
)
COHORT_FILE = os.path.join(RAW_DIR, 'cohort_incident_tally.csv')

os.makedirs(OUT_DIR, exist_ok=True)

# Step 1: Build cohort marketplace lookup
cohort_map = {}
with open(COHORT_FILE) as f:
    reader = csv.DictReader(f)
    for row in reader:
        cid = row.get('Cohort ID', '').strip()
        if not cid:
            continue
        key = (row['Vertical'].strip(), row['Return Reason'].strip())
        cohort_map[key] = row['Marketplace'].strip()

print(f"Loaded {len(cohort_map)} cohort marketplace mappings")

# Step 2: First pass — collect vertical + return_reason per incident ID from context_agent rows
print("Pass 1: Extracting incident metadata from context_agent rows...")
incident_meta = {}
with gzip.open(FEEDBACK_FILE, 'rt', encoding='utf-8', errors='replace') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row['agent_name'] != 'context_agent':
            continue
        rid = row['id']
        try:
            inp = json.loads(row['agent_input'])
        except (json.JSONDecodeError, KeyError):
            continue
        agent_data = inp.get('context_agent', {})
        input_data = agent_data.get('input_data', {})
        vertical = input_data.get('vertical', '')
        return_reason = input_data.get('return_reason', '')
        if not vertical or not return_reason:
            continue
        marketplace = cohort_map.get((vertical, return_reason), 'UNKNOWN')
        incident_meta[rid] = {
            'vertical': vertical,
            'return_reason': return_reason,
            'marketplace': marketplace,
        }

print(f"  Found metadata for {len(incident_meta)} incidents")

# Step 3: Second pass — collect all agent predictions vs human labels
print("Pass 2: Extracting agent predictions and human labels...")
records = []
skipped = 0
with gzip.open(FEEDBACK_FILE, 'rt', encoding='utf-8', errors='replace') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rid = row['id']
        agent = row['agent_name']
        if rid not in incident_meta:
            skipped += 1
            continue
        try:
            fb = json.loads(row['human_feedback'])
        except (json.JSONDecodeError, KeyError):
            skipped += 1
            continue

        predicted = fb.get('agent_predicted_class', '')
        human_label = fb.get('human_labelled_class', '')
        timestamp = fb.get('feedback_given_at', '')

        if not predicted and not human_label:
            skipped += 1
            continue

        meta = incident_meta[rid]
        records.append({
            'incident_id': rid,
            'agent': agent,
            'predicted': predicted or '',
            'human_label': human_label or '',
            'timestamp': timestamp,
            'vertical': meta['vertical'],
            'return_reason': meta['return_reason'],
            'marketplace': meta['marketplace'],
        })

print(f"  Extracted {len(records)} prediction records (skipped {skipped})")

# Step 4: Compute metrics at cohort x agent level
print("Computing metrics...")

def compute_metrics(records_list):
    """Compute per-class precision/recall/F1 and overall accuracy."""
    if not records_list:
        return None

    classes = sorted(set(r['predicted'] for r in records_list if r['predicted']) |
                     set(r['human_label'] for r in records_list if r['human_label']))

    total = len(records_list)
    correct = sum(1 for r in records_list if r['predicted'] == r['human_label'])
    accuracy = correct / total if total > 0 else 0

    per_class = {}
    for cls in classes:
        if not cls:
            continue
        tp = sum(1 for r in records_list if r['predicted'] == cls and r['human_label'] == cls)
        fp = sum(1 for r in records_list if r['predicted'] == cls and r['human_label'] != cls)
        fn = sum(1 for r in records_list if r['predicted'] != cls and r['human_label'] == cls)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0

        per_class[cls] = {
            'precision': round(precision, 4),
            'recall': round(recall, 4),
            'f1': round(f1, 4),
            'tp': tp,
            'fp': fp,
            'fn': fn,
            'support': tp + fn,
        }

    # Macro averages
    if per_class:
        macro_precision = sum(c['precision'] for c in per_class.values()) / len(per_class)
        macro_recall = sum(c['recall'] for c in per_class.values()) / len(per_class)
        macro_f1 = sum(c['f1'] for c in per_class.values()) / len(per_class)
    else:
        macro_precision = macro_recall = macro_f1 = 0

    return {
        'total': total,
        'correct': correct,
        'accuracy': round(accuracy, 4),
        'macro_precision': round(macro_precision, 4),
        'macro_recall': round(macro_recall, 4),
        'macro_f1': round(macro_f1, 4),
        'per_class': per_class,
    }

# Group by (agent, marketplace, vertical, return_reason)
grouped = defaultdict(list)
agent_level = defaultdict(list)
for r in records:
    key = (r['agent'], r['marketplace'], r['vertical'], r['return_reason'])
    grouped[key].append(r)
    agent_level[r['agent']].append(r)

cohort_metrics = []
for (agent, marketplace, vertical, return_reason), recs in grouped.items():
    m = compute_metrics(recs)
    if m:
        cohort_metrics.append({
            'agent': agent,
            'marketplace': marketplace,
            'vertical': vertical,
            'return_reason': return_reason,
            **m,
        })

cohort_metrics.sort(key=lambda x: (-x['total'], x['agent']))

# Agent-level summary
agent_metrics = []
for agent, recs in sorted(agent_level.items()):
    m = compute_metrics(recs)
    if m:
        agent_metrics.append({'agent': agent, **m})

agent_metrics.sort(key=lambda x: -x['total'])

# Timestamp range
timestamps = [r['timestamp'] for r in records if r['timestamp']]
ts_min = min(timestamps) if timestamps else ''
ts_max = max(timestamps) if timestamps else ''

output = {
    'summary': {
        'total_records': len(records),
        'total_incidents': len(incident_meta),
        'agents_evaluated': len(agent_metrics),
        'cohorts_evaluated': len(cohort_metrics),
        'timestamp_range': {'from': ts_min, 'to': ts_max},
    },
    'agent_metrics': agent_metrics,
    'cohort_metrics': cohort_metrics,
}

out_path = os.path.join(OUT_DIR, 'simulation_data.json')
with open(out_path, 'w') as f:
    json.dump(output, f, indent=2)

print(f"\nOutput: {out_path}")
print(f"  {len(agent_metrics)} agent-level summaries")
print(f"  {len(cohort_metrics)} cohort-level metrics")
print(f"  Timestamp range: {ts_min} to {ts_max}")
print("Done!")
