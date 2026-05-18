// SWAP POINT: Replace JSON reads with DB queries
// Interface: getAll(filters?) → Cohort[]
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'cohorts.json');
let cache = null;

function load() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  return cache;
}

module.exports = {
  getAll(filters = {}) {
    let data = load();
    if (filters.marketplace) {
      data = data.filter(c => c.marketplace === filters.marketplace);
    }
    if (filters.vertical) {
      data = data.filter(c => c.vertical.toLowerCase().includes(filters.vertical.toLowerCase()));
    }
    if (filters.returnReason) {
      data = data.filter(c => c.returnReason === filters.returnReason);
    }
    return data;
  },
};
