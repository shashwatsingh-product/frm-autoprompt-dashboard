const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '../helpers/query_token_analysis.py');
const SIM_FILE = path.join(__dirname, '../../data/processed/token_simulation_results.json');

function run(action, args = []) {
  return new Promise((resolve, reject) => {
    execFile('python3', [SCRIPT, action, ...args], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error('Parse error: ' + stdout.slice(0, 200))); }
    });
  });
}

function getSimulationResults() {
  if (!fs.existsSync(SIM_FILE)) return Promise.resolve({ results: [], status: 'pending' });
  try {
    const raw = JSON.parse(fs.readFileSync(SIM_FILE, 'utf8'));
    return Promise.resolve({ results: raw, status: 'ready' });
  } catch (e) {
    return Promise.resolve({ results: [], status: 'error', message: e.message });
  }
}

function getSimulationStats() {
  if (!fs.existsSync(SIM_FILE)) return Promise.resolve({ stats: [], status: 'pending' });
  try {
    const raw = JSON.parse(fs.readFileSync(SIM_FILE, 'utf8'));

    // Deduplicate: keep latest success per (incident_id, agent_type, sub_type)
    const seen = new Map();
    for (const r of raw) {
      const k = `${r.incident_id}|${r.agent_type}|${r.sub_type}`;
      const prev = seen.get(k);
      if (!prev || (r.status === 'success' && prev.status !== 'success')) seen.set(k, r);
    }

    // Aggregate per (agent_type, sub_type) for successful calls
    const buckets = {};
    for (const r of seen.values()) {
      if (r.status !== 'success') continue;
      const k = `${r.agent_type}||${r.sub_type || ''}`;
      if (!buckets[k]) buckets[k] = {
        agent_type: r.agent_type, sub_type: r.sub_type || null,
        prompt_tokens: [], output_tokens: [], image_counts: [],
      };
      buckets[k].prompt_tokens.push(r.prompt_tokens);
      buckets[k].output_tokens.push(r.output_tokens);
      buckets[k].image_counts.push(r.image_count || 0);
    }

    const stats = Object.values(buckets).map(b => {
      const pt = b.prompt_tokens, ot = b.output_tokens, ic = b.image_counts;
      const avg = arr => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
      const avgImgTok = Math.round(avg(ic) * 265);
      return {
        agent_type:     b.agent_type,
        sub_type:       b.sub_type,
        n:              pt.length,
        avg_img_tokens: avgImgTok,
        avg_prompt_tokens: avg(pt),
        avg_input_tokens:  avg(pt) + avgImgTok,
        min_input_tokens:  Math.min(...pt) + Math.round(Math.min(...ic) * 265),
        max_input_tokens:  Math.max(...pt) + Math.round(Math.max(...ic) * 265),
        avg_output_tokens: avg(ot),
        min_output_tokens: Math.min(...ot),
        max_output_tokens: Math.max(...ot),
        avg_images:        Math.round(avg(ic) * 10) / 10,
      };
    });

    const total = seen.size;
    const success = [...seen.values()].filter(r => r.status === 'success').length;
    return Promise.resolve({ stats, total, success, status: 'ready' });
  } catch (e) {
    return Promise.resolve({ stats: [], status: 'error', message: e.message });
  }
}

function getSimulationChartData() {
  if (!fs.existsSync(SIM_FILE)) return Promise.resolve({ points: [], status: 'pending' });
  try {
    const raw = JSON.parse(fs.readFileSync(SIM_FILE, 'utf8'));

    // Deduplicate
    const seen = new Map();
    for (const r of raw) {
      const k = `${r.incident_id}|${r.agent_type}|${r.sub_type}`;
      const prev = seen.get(k);
      if (!prev || (r.status === 'success' && prev.status !== 'success')) seen.set(k, r);
    }

    // Return compact points for successful calls only
    const points = [];
    for (const r of seen.values()) {
      if (r.status !== 'success') continue;
      points.push({
        a: r.agent_type,
        s: r.sub_type || null,
        v: r.vertical,
        i: r.prompt_tokens,
        o: r.output_tokens,
        n: r.image_count || 0,
      });
    }
    return Promise.resolve({ points, status: 'ready' });
  } catch (e) {
    return Promise.resolve({ points: [], status: 'error', message: e.message });
  }
}

module.exports = {
  getSummary: () => run('summary'),
  getPrompts: () => run('prompts'),
  getSimulationResults,
  getSimulationStats,
  getSimulationChartData,
};
