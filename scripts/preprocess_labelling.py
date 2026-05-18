#!/usr/bin/env python3
"""
Extract all labelling records from feedback_output.csv.gz into a SQLite database
for efficient server-side querying with filters and pagination.
"""
import csv
import gzip
import json
import os
import sqlite3
import sys
import time

csv.field_size_limit(sys.maxsize)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE_DIR, 'data', 'processed')
DB_PATH = os.path.join(OUT_DIR, 'labelling.db')
RAW_DIR = os.path.join(BASE_DIR, 'data', 'raw')

FEEDBACK_FILE = os.path.expanduser(
    '~/claude-project/Documents/Return-Adjudication-Automation/feedback_output.csv.gz'
)
COHORT_FILE = os.path.join(RAW_DIR, 'cohort_incident_tally.csv')

os.makedirs(OUT_DIR, exist_ok=True)

# Remove existing DB
if os.path.exists(DB_PATH):
    os.remove(DB_PATH)
    print(f"Removed existing {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=OFF")
conn.execute("PRAGMA cache_size=-200000")  # 200MB cache

conn.execute("""
CREATE TABLE records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT NOT NULL,
    agent TEXT NOT NULL,
    vertical TEXT,
    return_reason TEXT,
    marketplace TEXT,
    feedback_date TEXT,
    predicted_class TEXT,
    human_label TEXT,
    is_accepted INTEGER,
    feedback_by TEXT,
    input_data TEXT,
    agent_output TEXT,
    prompt TEXT
)
""")

conn.execute("""
CREATE TABLE filter_options (
    filter_type TEXT NOT NULL,
    filter_value TEXT NOT NULL,
    UNIQUE(filter_type, filter_value)
)
""")

print("Database created")

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

# Step 2: First pass — collect metadata from context_agent rows
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

# Step 3: Second pass — insert all records
print("Pass 2: Inserting all records into SQLite...")
start_time = time.time()
batch = []
batch_size = 5000
total_inserted = 0
skipped = 0
agents_set = set()
verticals_set = set()
reasons_set = set()
marketplaces_set = set()
dates_set = set()

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
        is_accepted = fb.get('is_accepted', None)
        feedback_by = fb.get('feedback_given_by', '')
        feedback_date = fb.get('feedback_given_at', '')

        if not predicted and not human_label:
            skipped += 1
            continue

        meta = incident_meta[rid]

        # Parse input_data for this agent
        try:
            inp = json.loads(row['agent_input'])
            agent_key = list(inp.keys())[0]
            sub = inp[agent_key]
            if isinstance(sub, dict) and 'input_data' in sub:
                input_data_json = json.dumps(sub['input_data'])
            elif isinstance(sub, dict):
                input_data_json = json.dumps(sub)
            else:
                input_data_json = row['agent_input']
        except:
            input_data_json = row['agent_input']

        # Parse agent_output
        agent_output_json = row.get('agent_output', '{}')

        prompt_text = row.get('prompt', '')

        # Date (just the date part)
        date_only = feedback_date.split(' ')[0] if feedback_date else ''

        batch.append((
            rid, agent, meta['vertical'], meta['return_reason'],
            meta['marketplace'], date_only, predicted, human_label,
            is_accepted, feedback_by, input_data_json,
            agent_output_json, prompt_text
        ))

        agents_set.add(agent)
        verticals_set.add(meta['vertical'])
        reasons_set.add(meta['return_reason'])
        marketplaces_set.add(meta['marketplace'])
        if date_only:
            dates_set.add(date_only)

        if len(batch) >= batch_size:
            conn.executemany("""
                INSERT INTO records (incident_id, agent, vertical, return_reason,
                    marketplace, feedback_date, predicted_class, human_label,
                    is_accepted, feedback_by, input_data, agent_output, prompt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, batch)
            total_inserted += len(batch)
            elapsed = time.time() - start_time
            rate = total_inserted / elapsed if elapsed > 0 else 0
            print(f"  Inserted {total_inserted:,} records ({rate:.0f}/s, skipped {skipped:,})", end='\r')
            batch = []

# Insert remaining
if batch:
    conn.executemany("""
        INSERT INTO records (incident_id, agent, vertical, return_reason,
            marketplace, feedback_date, predicted_class, human_label,
            is_accepted, feedback_by, input_data, agent_output, prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, batch)
    total_inserted += len(batch)

conn.commit()
elapsed = time.time() - start_time
print(f"\n  Inserted {total_inserted:,} records in {elapsed:.1f}s (skipped {skipped:,})")

# Insert filter options
print("Storing filter options...")
filter_data = []
for v in sorted(agents_set):
    filter_data.append(('agent', v))
for v in sorted(verticals_set):
    filter_data.append(('vertical', v))
for v in sorted(reasons_set):
    filter_data.append(('return_reason', v))
for v in sorted(marketplaces_set):
    filter_data.append(('marketplace', v))

conn.executemany("INSERT OR IGNORE INTO filter_options VALUES (?, ?)", filter_data)
conn.commit()

# Create indexes
print("Creating indexes...")
conn.execute("CREATE INDEX idx_agent ON records(agent)")
conn.execute("CREATE INDEX idx_vertical ON records(vertical)")
conn.execute("CREATE INDEX idx_reason ON records(return_reason)")
conn.execute("CREATE INDEX idx_marketplace ON records(marketplace)")
conn.execute("CREATE INDEX idx_date ON records(feedback_date)")
conn.execute("CREATE INDEX idx_incident ON records(incident_id)")
conn.commit()

# Summary
date_min = min(dates_set) if dates_set else 'N/A'
date_max = max(dates_set) if dates_set else 'N/A'
db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)

print(f"\nDone!")
print(f"  Database: {DB_PATH} ({db_size_mb:.1f} MB)")
print(f"  Records: {total_inserted:,}")
print(f"  Agents: {len(agents_set)} ({', '.join(sorted(agents_set))})")
print(f"  Verticals: {len(verticals_set)}")
print(f"  Return reasons: {len(reasons_set)}")
print(f"  Marketplaces: {len(marketplaces_set)}")
print(f"  Date range: {date_min} to {date_max}")

conn.close()
