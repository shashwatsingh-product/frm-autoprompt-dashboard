// SWAP POINT: Replace JSON reads with aggregate DB queries
// Interface: get() → Overview
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'processed', 'overview.json');
let cache = null;

function load() {
  if (!cache) cache = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  return cache;
}

module.exports = {
  get() {
    return load();
  },
};
