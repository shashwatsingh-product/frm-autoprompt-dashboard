const { execFile } = require('child_process');
const path = require('path');

const HELPER = path.join(__dirname, '..', 'helpers', 'query_h6.py');

function callPython(request) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [HELPER], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('H6 helper error:', stderr);
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error('Invalid JSON from H6 helper'));
      }
    });
    proc.stdin.write(JSON.stringify(request));
    proc.stdin.end();
  });
}

module.exports = {
  getSummary(params) { return callPython({ action: 'summary', ...params }); },
  getComparison(params) { return callPython({ action: 'comparison', ...params }); },
  getData(params) { return callPython({ action: 'data', ...params }); },
  getDetail(params) { return callPython({ action: 'detail', ...params }); },
};
