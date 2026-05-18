// SWAP POINT: Replace JSON reads with DB queries (e.g., MySQL/Postgres/Elasticsearch)
// Interface: getAll() → Agent[], getById(id) → Agent | null
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'agents.json');
let cache = null;

function load() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  return cache;
}

module.exports = {
  getAll() {
    return load();
  },
  getById(id) {
    return load().find(a => a.id === id || a.name === id) || null;
  },
};
