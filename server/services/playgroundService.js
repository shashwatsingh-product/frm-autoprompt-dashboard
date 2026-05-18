const { execFile } = require('child_process');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'processed', 'labelling.db');
const PROMPTS_PATH = path.join(__dirname, '..', '..', 'data', 'processed', 'production_prompts_from_docx.json');
const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'playground_simulate.py');

function runSimulation({ agent, vertical, returnReason, marketplace, promptText, sampleSize = 50 }) {
  return new Promise((resolve, reject) => {
    const args = [
      SCRIPT_PATH,
      '--db', DB_PATH,
      '--prompts', PROMPTS_PATH,
      '--sample-size', String(sampleSize),
    ];
    if (agent) { args.push('--agent', agent); }
    if (vertical) { args.push('--vertical', vertical); }
    if (returnReason) { args.push('--return-reason', returnReason); }
    if (marketplace) { args.push('--marketplace', marketplace); }

    const child = execFile('python3', args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 600000, // 10 min max
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`Parse error: ${stdout.slice(0, 500)}`));
      }
    });

    // Send prompt text via stdin to avoid shell escaping issues
    child.stdin.write(promptText || '');
    child.stdin.end();
  });
}

function getCohortOptions() {
  return new Promise((resolve, reject) => {
    const script = `
import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
agents = [r[0] for r in conn.execute("SELECT DISTINCT agent FROM records ORDER BY agent").fetchall()]
verticals = [r[0] for r in conn.execute("SELECT DISTINCT vertical FROM records ORDER BY vertical").fetchall()]
reasons = [r[0] for r in conn.execute("SELECT DISTINCT return_reason FROM records ORDER BY return_reason").fetchall()]
marketplaces = [r[0] for r in conn.execute("SELECT DISTINCT marketplace FROM records ORDER BY marketplace").fetchall()]
conn.close()
print(json.dumps({"agents": agents, "verticals": verticals, "returnReasons": reasons, "marketplaces": marketplaces}))
`;
    execFile('python3', ['-c', script, DB_PATH], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch { resolve({ agents: [], verticals: [], returnReasons: [], marketplaces: [] }); }
    });
  });
}

function getSimulationStatus() {
  return new Promise((resolve, reject) => {
    const script = `
import sqlite3, json, sys, os
conn = sqlite3.connect(sys.argv[1])
try:
    total = conn.execute("SELECT COUNT(*) FROM simulation_results").fetchone()[0]
    ok = conn.execute("SELECT COUNT(*) FROM simulation_results WHERE error IS NULL").fetchone()[0]
    errs = conn.execute("SELECT COUNT(*) FROM simulation_results WHERE error IS NOT NULL").fetchone()[0]
    correct = conn.execute("SELECT COUNT(*) FROM simulation_results WHERE is_correct = 1 AND error IS NULL").fetchone()[0]
    by_agent = conn.execute("""
        SELECT agent, COUNT(*) as total,
               SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) as ok,
               SUM(CASE WHEN is_correct = 1 AND error IS NULL THEN 1 ELSE 0 END) as correct
        FROM simulation_results GROUP BY agent ORDER BY total DESC
    """).fetchall()
    agents = [{"agent": r[0], "total": r[1], "ok": r[2], "correct": r[3],
               "accuracy": round(r[3]/r[2], 4) if r[2] > 0 else 0} for r in by_agent]
except:
    total = ok = errs = correct = 0
    agents = []

# Check checkpoint
cp = {}
cp_path = os.path.join(os.path.dirname(sys.argv[1]), "simulation_checkpoint.json")
if os.path.exists(cp_path):
    with open(cp_path) as f:
        cp = json.load(f)

conn.close()
print(json.dumps({"total": total, "ok": ok, "errors": errs, "correct": correct,
                   "accuracy": round(correct/ok, 4) if ok > 0 else 0,
                   "checkpoint": cp, "by_agent": agents}))
`;
    execFile('python3', ['-c', script, DB_PATH], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch { resolve({ total: 0, ok: 0, errors: 0, correct: 0, accuracy: 0, by_agent: [] }); }
    });
  });
}

module.exports = { runSimulation, getCohortOptions, getSimulationStatus };
