const { execFile } = require('child_process');
const path = require('path');

const HELPER = path.join(__dirname, '..', 'helpers', 'query_h4.py');

function callPython(request) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [HELPER], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(stderr || err.message)); return; }
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('Invalid JSON from H4 helper')); }
    });
    proc.stdin.write(JSON.stringify(request));
    proc.stdin.end();
  });
}

module.exports = {
  getAll: () => callPython({ action: 'all' }),
  getCatalog: () => callPython({ action: 'catalog' }),
  getObd: () => callPython({ action: 'obd' }),
  getCx: () => callPython({ action: 'cx' }),
};
