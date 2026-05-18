// SWAP POINT: Replace JSON reads with DB queries
// Interface: getAll(), getById(id), updateStatus(id, isLive), getMappings(filters)
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'prompts_data.json');
let cache = null;

function load() {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
      cache = { prompts: [], cohort_prompt_mapping: [], summary: {} };
    }
  }
  return cache;
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2));
}

module.exports = {
  getSummary() {
    return load().summary;
  },

  getPrompts() {
    return load().prompts.map(p => ({
      ...p,
      promptText: undefined,
      promptPreview: (p.promptText || '').slice(0, 300),
    }));
  },

  getPrompt(id) {
    return load().prompts.find(p => p.id === id) || null;
  },

  updatePromptStatus(id, isLive) {
    const data = load();
    const prompt = data.prompts.find(p => p.id === id);
    if (!prompt) return null;
    prompt.isLive = isLive;
    save();
    return prompt;
  },

  getMappings(filters = {}) {
    let data = load().cohort_prompt_mapping;
    if (filters.marketplace) {
      data = data.filter(m => m.marketplace === filters.marketplace);
    }
    if (filters.return_reason) {
      data = data.filter(m => m.return_reason === filters.return_reason);
    }
    if (filters.vertical) {
      data = data.filter(m => m.vertical.toLowerCase().includes(filters.vertical.toLowerCase()));
    }
    if (filters.prompt_id) {
      data = data.filter(m => m.prompt_id === filters.prompt_id);
    }
    return data;
  },
};
