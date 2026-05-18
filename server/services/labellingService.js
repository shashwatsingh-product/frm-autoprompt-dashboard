// SWAP POINT: Replace Python/SQLite queries with DB queries
// Interface: getFilters(), query(params), getDetail(id), download(params), getStats(params)
const { execFile } = require('child_process');
const path = require('path');

const HELPER = path.join(__dirname, '..', 'helpers', 'query_labelling.py');

function callPython(request) {
  return new Promise((resolve, reject) => {
    const proc = execFile('python3', [HELPER], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('Python helper error:', stderr);
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error('Invalid JSON from Python helper'));
      }
    });
    proc.stdin.write(JSON.stringify(request));
    proc.stdin.end();
  });
}

module.exports = {
  getFilters() {
    return callPython({ action: 'filters' });
  },

  query(params) {
    return callPython({ action: 'query', ...params });
  },

  getDetail(recordId) {
    return callPython({ action: 'detail', record_id: recordId });
  },

  download(params) {
    return callPython({ action: 'download', ...params });
  },

  getStats(params) {
    return callPython({ action: 'stats', ...params });
  },
};
