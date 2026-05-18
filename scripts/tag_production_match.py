#!/usr/bin/env python3
"""
Tag labelling.db records with is_current_production based on whether the
prompt text used during labelling matches the current production prompt from DOCX.

Classification (from text analysis of DB prompts vs DOCX production prompts):

CURRENT (labelling prompt == production prompt):
  - CATALOG_CORRECTNESS_PROMPT  (83,720 records)
  - CX_VS_OBD_PROMPT            (83,307 records)
  - FK_PROMPT_1                  (55,226 records)
  - INTENT_RESONANCE_PROMPT      (84,133 records)

OLD (labelling prompt != production prompt — would need LLM re-simulation):
  - DECISION_DAMAGED_PRODUCT     (31,389 records) — old simple vs new decision tree
  - DECISION_MISSHIPMENT         (28,477 records) — old simple vs new decision tree
  - DECISION_REMAINING           (23,273 records) — 65-char template vs 4,698-char
  - FK_PROMPT_3                  (13,795 records) — "Visual QA Analyst" vs "Universal Verifier"
  - FK_PROMPT_4                  ( 2,916 records) — "Visual QA Analyst" vs "Universal Verifier"
  - RISK_SIGNALS_PROMPT          (83,253 records) — 75-char template vs 2,534-char

UNKNOWN (production prompt not in DOCX):
  - CX_VS_POD_PROMPT             (29,606 records)
  - HL_PROMPT_1                  (94,938 records)

Values: 1 = current production, 0 = old version, -1 = unknown
"""
import sqlite3
import os
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'labelling.db')

CURRENT_PROMPT_IDS = [
    'CATALOG_CORRECTNESS_PROMPT',
    'CX_VS_OBD_PROMPT',
    'FK_PROMPT_1',
    'INTENT_RESONANCE_PROMPT',
]

OLD_PROMPT_IDS = [
    'DECISION_DAMAGED_PRODUCT',
    'DECISION_MISSHIPMENT',
    'DECISION_REMAINING',
    'FK_PROMPT_3',
    'FK_PROMPT_4',
    'RISK_SIGNALS_PROMPT',
]

UNKNOWN_PROMPT_IDS = [
    'CX_VS_POD_PROMPT',
    'HL_PROMPT_1',
]

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")

try:
    conn.execute("ALTER TABLE records ADD COLUMN is_current_production INTEGER DEFAULT -1")
    print("Added is_current_production column")
except sqlite3.OperationalError:
    print("is_current_production column exists, resetting...")
    conn.execute("UPDATE records SET is_current_production = -1")
conn.commit()

start = time.time()

# Tag current production prompt records
for pid in CURRENT_PROMPT_IDS:
    result = conn.execute(
        "UPDATE records SET is_current_production = 1 WHERE prompt_id = ?", [pid]
    )
    print(f"  CURRENT  {pid}: {result.rowcount:>8} records")
conn.commit()

# Tag old version records
for pid in OLD_PROMPT_IDS:
    result = conn.execute(
        "UPDATE records SET is_current_production = 0 WHERE prompt_id = ?", [pid]
    )
    print(f"  OLD      {pid}: {result.rowcount:>8} records")
conn.commit()

# Tag unknown records
for pid in UNKNOWN_PROMPT_IDS:
    result = conn.execute(
        "UPDATE records SET is_current_production = -1 WHERE prompt_id = ?", [pid]
    )
    print(f"  UNKNOWN  {pid}: {result.rowcount:>8} records")
conn.commit()

# Create index
try:
    conn.execute("CREATE INDEX idx_is_current_production ON records(is_current_production)")
    print("\nCreated index on is_current_production")
except sqlite3.OperationalError:
    pass

# Summary
rows = conn.execute("""
    SELECT is_current_production, COUNT(*) FROM records GROUP BY is_current_production
""").fetchall()

print("\n--- Summary ---")
labels = {1: 'Current Production', 0: 'Old Version', -1: 'Unknown'}
for r in rows:
    print(f"  {labels.get(r[0], r[0]):>20}: {r[1]:>8} records")

total = conn.execute("SELECT COUNT(*) FROM records").fetchone()[0]
elapsed = time.time() - start
print(f"\nTotal: {total:,} records | Time: {elapsed:.1f}s")

conn.commit()
conn.close()
print("Done!")
