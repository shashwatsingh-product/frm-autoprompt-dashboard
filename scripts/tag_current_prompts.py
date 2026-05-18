#!/usr/bin/env python3
"""
Tag labelling.db records with their prompt_id based on cohort mapping rules.
This enables filtering simulation metrics by which prompts are currently live.

Mapping rules:
- Single-prompt agents: agent → prompt_id (1:1)
- decision_agent: return_reason → prompt_id (3 variants)
- image_adjudication_cx/obd agents: cohort mapping from prompts_data.json
"""
import json
import os
import sqlite3
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')
PROMPTS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'prompts_data.json')

with open(PROMPTS_PATH) as f:
    prompts_data = json.load(f)

SINGLE_PROMPT_AGENTS = {
    'catalog_correctness_agent': 'CATALOG_CORRECTNESS_PROMPT',
    'risk_signals_agent': 'RISK_SIGNALS_PROMPT',
    'intent_resonance_agent': 'INTENT_RESONANCE_PROMPT',
    'image_adjudication_cx_vs_obd_agent': 'CX_VS_OBD_PROMPT',
    'image_adjudication_cx_vs_pod_agent': 'CX_VS_POD_PROMPT',
}

DECISION_AGENT_MAP = {
    'DAMAGED_PRODUCT': 'DECISION_DAMAGED_PRODUCT',
    'MISSHIPMENT': 'DECISION_MISSHIPMENT',
}
DECISION_DEFAULT = 'DECISION_REMAINING'

# Build cohort→prompt_id mapping for image agents from XLSX data
# Fix typo: FK_FK_PROMPT_3 → FK_PROMPT_3
cohort_prompt_map = {}
for m in prompts_data.get('cohort_prompt_mapping', []):
    pid = m['prompt_id']
    if pid == 'FK_FK_PROMPT_3':
        pid = 'FK_PROMPT_3'
    key = (m['marketplace'], m['vertical'], m['return_reason'])
    cohort_prompt_map[key] = pid

IMAGE_AGENTS = {'image_adjudication_cx_agent', 'image_adjudication_obd_agent'}

# Defaults for image agents without explicit mapping
IMAGE_DEFAULTS = {
    'FLIPKART': 'FK_PROMPT_1',
    'HYPERLOCAL': 'HL_PROMPT_1',
}

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")

# Add prompt_id column if not exists
try:
    conn.execute("ALTER TABLE records ADD COLUMN prompt_id TEXT DEFAULT ''")
    print("Added prompt_id column")
except sqlite3.OperationalError:
    print("prompt_id column already exists, resetting...")
    conn.execute("UPDATE records SET prompt_id = ''")
conn.commit()

start = time.time()

# 1. Single-prompt agents (bulk update)
for agent, pid in SINGLE_PROMPT_AGENTS.items():
    result = conn.execute("UPDATE records SET prompt_id = ? WHERE agent = ?", [pid, agent])
    print(f"  {agent} → {pid}: {result.rowcount} records")
conn.commit()

# 2. Decision agent by return_reason
for reason, pid in DECISION_AGENT_MAP.items():
    result = conn.execute(
        "UPDATE records SET prompt_id = ? WHERE agent = 'decision_agent' AND return_reason = ?",
        [pid, reason]
    )
    print(f"  decision_agent ({reason}) → {pid}: {result.rowcount} records")

result = conn.execute(
    "UPDATE records SET prompt_id = ? WHERE agent = 'decision_agent' AND prompt_id = ''",
    [DECISION_DEFAULT]
)
print(f"  decision_agent (remaining) → {DECISION_DEFAULT}: {result.rowcount} records")
conn.commit()

# 3. Image agents via cohort mapping
mapped = 0
for (mkt, vert, reason), pid in cohort_prompt_map.items():
    for agent in IMAGE_AGENTS:
        result = conn.execute(
            "UPDATE records SET prompt_id = ? WHERE agent = ? AND marketplace = ? AND vertical = ? AND return_reason = ?",
            [pid, agent, mkt, vert, reason]
        )
        mapped += result.rowcount

print(f"  image agents (explicit mapping): {mapped} records")

# Apply defaults for unmapped image agent records
for mkt, default_pid in IMAGE_DEFAULTS.items():
    for agent in IMAGE_AGENTS:
        result = conn.execute(
            "UPDATE records SET prompt_id = ? WHERE agent = ? AND marketplace = ? AND prompt_id = ''",
            [default_pid, agent, mkt]
        )
        if result.rowcount > 0:
            print(f"  {agent} ({mkt} default) → {default_pid}: {result.rowcount} records")

conn.commit()

# Verify: count records per prompt_id
print("\n--- Summary ---")
rows = conn.execute("""
    SELECT prompt_id, agent, COUNT(*) as cnt
    FROM records
    GROUP BY prompt_id, agent
    ORDER BY agent, prompt_id
""").fetchall()

total_tagged = 0
for r in rows:
    pid = r[0] if r[0] else '(UNTAGGED)'
    print(f"  {r[1]:>40} | {pid:>30} | {r[2]:>6} records")
    if r[0]:
        total_tagged += r[2]

total = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
untagged = total - total_tagged
elapsed = time.time() - start

print(f"\nTagged: {total_tagged:,} / {total:,} records ({total_tagged*100//total}%)")
if untagged > 0:
    print(f"Untagged: {untagged}")
print(f"Time: {elapsed:.1f}s")

# Create index on prompt_id for fast filtering
try:
    conn.execute("CREATE INDEX idx_prompt_id ON records(prompt_id)")
    print("Created index on prompt_id")
except sqlite3.OperationalError:
    pass

conn.commit()
conn.close()
print("Done!")
