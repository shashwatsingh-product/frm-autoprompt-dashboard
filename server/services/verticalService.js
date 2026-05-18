// SWAP POINT: Replace JSON reads with DB queries
// Interface: getAll() → { frmBlue: Vertical[], frmHL: Vertical[] }
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'verticals.json');
let cache = null;

function load() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  return cache;
}

module.exports = {
  getAll() {
    return load();
  },
};
