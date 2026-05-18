// SWAP POINT: Replace JSON file with DB (e.g., notes/wiki table)
// Interface: get(pageId) → string, save(pageId, content) → void
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'notes.json');

const DEFAULTS = {
  'ground-truth': 'All data is correct.',
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  get(pageId) {
    const all = load();
    return all[pageId] ?? DEFAULTS[pageId] ?? '';
  },

  save(pageId, content) {
    const all = load();
    all[pageId] = content;
    save(all);
  },
};
