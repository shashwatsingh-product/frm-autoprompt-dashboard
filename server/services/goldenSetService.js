const { execFile } = require('child_process');
const path = require('path');

const HELPER = path.join(__dirname, '..', 'helpers', 'query_golden_set.py');

function callPython(request) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [HELPER], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Golden set helper error:', stderr);
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error('Invalid JSON from golden set helper'));
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

  getCohorts(params) {
    return callPython({ action: 'cohorts', ...params });
  },

  getCohortDetail(params) {
    return callPython({ action: 'cohort_detail', ...params });
  },
};
