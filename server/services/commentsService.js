// SWAP POINT: Replace JSON file with DB (e.g., comments table)
// Interface: getByPage(pageId) → Comment[], add(pageId, comment) → Comment
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'comments.json');

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
  getByPage(pageId) {
    const all = load();
    return all[pageId] || [];
  },

  add(pageId, { author, text }) {
    const all = load();
    if (!all[pageId]) all[pageId] = [];
    const comment = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      author: author || 'Anonymous',
      text,
      timestamp: new Date().toISOString(),
    };
    all[pageId].push(comment);
    save(all);
    return comment;
  },

  delete(pageId, commentId) {
    const all = load();
    if (!all[pageId]) return false;
    const idx = all[pageId].findIndex(c => c.id === commentId);
    if (idx === -1) return false;
    all[pageId].splice(idx, 1);
    save(all);
    return true;
  },
};
