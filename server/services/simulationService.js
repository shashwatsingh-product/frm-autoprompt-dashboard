// SWAP POINT: Replace JSON reads with analytical DB queries
// Interface: getSummary(), getAgentMetrics(), getCohortMetrics(filters)
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'simulation_data.json');
const PROMPTS_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'prompts_data.json');
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'processed', 'labelling.db');
let cache = null;
let promptsCache = null;

function load() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
      cache = { summary: {}, agent_metrics: [], cohort_metrics: [] };
    }
  }
  return cache;
}

function loadPrompts() {
  if (!promptsCache) {
    try {
      promptsCache = JSON.parse(fs.readFileSync(PROMPTS_FILE, 'utf-8'));
    } catch {
      promptsCache = { prompts: [] };
    }
  }
  return promptsCache;
}

function queryLabellingPrompt(promptId) {
  return new Promise((resolve, reject) => {
    const script = `
import sqlite3, json, sys
conn = sqlite3.connect(sys.argv[1])
row = conn.execute(
    "SELECT prompt FROM records WHERE prompt_id = ? AND prompt != '' LIMIT 1",
    [sys.argv[2]]
).fetchone()
conn.close()
print(json.dumps({"prompt": row[0] if row else ""}))
`;
    execFile('python3', ['-c', script, DB_PATH, promptId], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ prompt: '' });
      }
    });
  });
}

module.exports = {
  getSummary() {
    return load().summary;
  },

  getAgentMetrics() {
    return load().agent_metrics;
  },

  getCohortMetrics(filters = {}) {
    let data = load().cohort_metrics;
    if (filters.agent) {
      data = data.filter(c => c.agent === filters.agent);
    }
    if (filters.marketplace) {
      data = data.filter(c => c.marketplace === filters.marketplace);
    }
    if (filters.vertical) {
      data = data.filter(c => c.vertical.toLowerCase().includes(filters.vertical.toLowerCase()));
    }
    if (filters.returnReason) {
      data = data.filter(c => c.return_reason === filters.returnReason);
    }
    return data;
  },

  async getPromptComparison(promptId) {
    const prompts = loadPrompts();
    const currentPrompt = prompts.prompts.find(p => p.id === promptId);
    const labelling = await queryLabellingPrompt(promptId);

    let currentText = currentPrompt ? currentPrompt.promptText : '';
    const metaEnd = currentText.indexOf('# **System Prompt**');
    if (metaEnd > 0) currentText = currentText.slice(metaEnd).trim();
    const metaEnd2 = currentText.indexOf('# System Prompt');
    if (metaEnd2 > 0 && metaEnd2 < 100) currentText = currentText.slice(metaEnd2).trim();

    let labelText = labelling.prompt || '';
    const lMetaEnd = labelText.indexOf('# **System Prompt**');
    if (lMetaEnd > 0) labelText = labelText.slice(lMetaEnd).trim();
    const lMetaEnd2 = labelText.indexOf('# System Prompt');
    if (lMetaEnd2 > 0 && lMetaEnd2 < 100) labelText = labelText.slice(lMetaEnd2).trim();

    return {
      prompt_id: promptId,
      current_prompt: currentText,
      current_prompt_name: currentPrompt ? currentPrompt.name : promptId,
      current_prompt_agent: currentPrompt ? currentPrompt.agent : '',
      labelling_prompt: labelText,
    };
  },
};
