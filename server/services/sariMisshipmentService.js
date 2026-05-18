const { execFile } = require('child_process');
const path = require('path');

const HELPER = path.join(__dirname, '..', 'helpers', 'query_sari_misshipment.py');

function callPython(request) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [HELPER], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Sari misshipment helper error:', stderr);
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error('Invalid JSON from sari misshipment helper'));
      }
    });
    proc.stdin.write(JSON.stringify(request));
    proc.stdin.end();
  });
}

module.exports = {
  getSummary() {
    return callPython({ action: 'summary' });
  },
  getData(params) {
    return callPython({ action: 'data', ...params });
  },
  getConfusion() {
    return callPython({ action: 'confusion' });
  },
};
