const { execFile } = require('child_process');
const path = require('path');

const HELPER = path.join(__dirname, '..', 'helpers', 'query_h2.py');

function run(action, params = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('python3', [HELPER], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(new Error('Parse error: ' + stdout.slice(0, 200))); }
    });
    child.stdin.write(JSON.stringify({ action, params }));
    child.stdin.end();
  });
}

module.exports = {
  getSummary: () => run('summary'),
  getIncidents: (params) => run('incidents', params),
};
