const BASE = '/api';

// On GitHub Pages there is no backend — serve pre-snapshotted static JSON instead
const IS_STATIC = !window.location.hostname.includes('localhost') &&
                  !window.location.hostname.includes('127.0.0.1');

const STATIC_BASE = import.meta.env.BASE_URL + 'data';

async function staticFetch(file) {
  const res = await fetch(`${STATIC_BASE}/${file}`);
  if (!res.ok) throw new Error(`Static ${res.status}: ${file}`);
  return res.json();
}

async function fetchJSON(path, params = {}) {
  const url = new URL(BASE + path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function putJSON(path, body) {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function deleteJSON(path) {
  const res = await fetch(BASE + path, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export const api = {
  getOverview: () => IS_STATIC ? staticFetch('overview.json') : fetchJSON('/overview'),
  getAgents: () => IS_STATIC ? staticFetch('agents.json') : fetchJSON('/agents'),
  getAgent: (id) => IS_STATIC ? staticFetch(`agent-${id}.json`) : fetchJSON(`/agents/${id}`),
  getVerticals: () => IS_STATIC ? staticFetch('verticals.json') : fetchJSON('/verticals'),
  getCohorts: () => IS_STATIC ? staticFetch('cohorts.json') : fetchJSON('/cohorts'),

  getComments: () => IS_STATIC ? Promise.resolve([]) : fetchJSON(`/comments`),
  addComment: (pageId, body) => IS_STATIC ? Promise.resolve({}) : postJSON(`/comments/${pageId}`, body),
  deleteComment: (pageId, id) => IS_STATIC ? Promise.resolve({}) : deleteJSON(`/comments/${pageId}/${id}`),

  getNote: () => IS_STATIC ? Promise.resolve({ content: '' }) : fetchJSON(`/notes`),
  saveNote: (pageId, content) => IS_STATIC ? Promise.resolve({}) : putJSON(`/notes/${pageId}`, { content }),

  getPrompts: () => IS_STATIC ? staticFetch('prompts.json') : fetchJSON('/prompts'),
  getPrompt: (id) => IS_STATIC ? staticFetch('prompts.json').then(p => p.find(x => x.id === id)) : fetchJSON(`/prompts/${id}`),
  getPromptsSummary: () => IS_STATIC ? staticFetch('prompts-summary.json') : fetchJSON('/prompts/summary'),
  updatePromptStatus: (id, isLive) => IS_STATIC ? Promise.resolve({}) : fetch('/api/prompts/' + id + '/status', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isLive }),
  }).then(r => r.json()),
  getPromptMappings: () => IS_STATIC ? staticFetch('cohorts.json').then(() => []) : fetchJSON('/prompts/mappings/list'),

  getSimulationSummary: () => IS_STATIC ? staticFetch('simulation-summary.json') : fetchJSON('/simulation/summary'),
  getSimulationAgents: () => IS_STATIC ? staticFetch('simulation-agents.json') : fetchJSON('/simulation/agents'),
  getSimulationCohorts: () => IS_STATIC ? staticFetch('simulation-cohorts.json') : fetchJSON('/simulation/cohorts'),
  getPromptComparison: (promptId) => IS_STATIC ? Promise.resolve(null) : fetchJSON(`/simulation/prompt-compare/${encodeURIComponent(promptId)}`),

  getPlaygroundOptions: () => IS_STATIC ? staticFetch('playground-options.json') : fetchJSON('/playground/options'),
  getSimulationStatus: () => IS_STATIC ? Promise.resolve({ status: 'idle' }) : fetchJSON('/playground/simulation-status'),
  runPlaygroundSimulation: (params) => IS_STATIC ? Promise.resolve({ error: 'Read-only in hosted mode' }) : postJSON('/playground/simulate', params),

  getLabellingFilters: () => IS_STATIC ? staticFetch('labelling-filters.json') : fetchJSON('/labelling/filters'),
  queryLabelling: () => IS_STATIC ? Promise.resolve({ rows: [], total: 0 }) : postJSON('/labelling/query', {}),
  getLabellingDetail: (id) => IS_STATIC ? Promise.resolve(null) : fetchJSON(`/labelling/detail/${id}`),
  downloadLabelling: () => IS_STATIC ? Promise.resolve([]) : postJSON('/labelling/download', {}),
  getLabellingStats: () => IS_STATIC ? staticFetch('labelling-stats.json') : postJSON('/labelling/stats', {}),

  getGoldenSummary: () => IS_STATIC ? staticFetch('golden-set-summary.json') : fetchJSON('/golden-set/summary'),
  getGoldenCohorts: (params) => IS_STATIC ? Promise.resolve([]) : postJSON('/golden-set/cohorts', params),
  getGoldenCohortDetail: (params) => IS_STATIC ? Promise.resolve(null) : postJSON('/golden-set/cohort-detail', params),

  getSariSummary: () => IS_STATIC ? staticFetch('sari-misshipment-summary.json') : fetchJSON('/sari-misshipment/summary'),
  getSariData: () => IS_STATIC ? staticFetch('sari-data.json') : postJSON('/sari-misshipment/data', {}),
  getSariConfusion: () => IS_STATIC ? Promise.resolve(null) : fetchJSON('/sari-misshipment/confusion'),

  getH3Summary: (params) => IS_STATIC ? staticFetch('h3-test-summary.json') : (params ? postJSON('/h3-test/summary', params) : fetchJSON('/h3-test/summary')),
  getH3MultiSummary: () => IS_STATIC ? staticFetch('h3-test-multi-summary.json') : fetchJSON('/h3-test/multi-summary'),
  getH3Mismatches: () => IS_STATIC ? staticFetch('h3-mismatches.json') : postJSON('/h3-test/mismatches', {}),
  getH3Data: () => IS_STATIC ? staticFetch('h3-data.json') : postJSON('/h3-test/data', {}),
  getH3Detail: (params) => IS_STATIC ? Promise.resolve(null) : postJSON('/h3-test/detail', params),
  getH3InterRun: () => IS_STATIC ? staticFetch('h3-test-inter-run.json') : fetchJSON('/h3-test/inter-run'),

  getH2Summary: () => IS_STATIC ? staticFetch('h2-summary.json') : fetchJSON('/h2/summary'),
  getH2Incidents: () => IS_STATIC ? staticFetch('h2-incidents.json') : fetchJSON('/h2/incidents'),

  getH4All: () => IS_STATIC ? staticFetch('h4-all.json') : fetchJSON('/h4/all'),
  getH4Catalog: () => IS_STATIC ? staticFetch('h4-catalog.json') : fetchJSON('/h4/catalog'),
  getH4Obd: () => IS_STATIC ? staticFetch('h4-obd.json') : fetchJSON('/h4/obd'),
  getH4Cx: () => IS_STATIC ? staticFetch('h4-cx.json') : fetchJSON('/h4/cx'),

  getTokenAnalysisSummary: () => IS_STATIC ? staticFetch('token-analysis-summary.json') : fetchJSON('/token-analysis/summary'),
  getTokenAnalysisPrompts: () => IS_STATIC ? staticFetch('token-analysis-prompts.json') : fetchJSON('/token-analysis/prompts'),
  getTokenSimulationResults: () => IS_STATIC ? Promise.resolve([]) : fetchJSON('/token-analysis/simulation'),
  getTokenSimulationStats: () => IS_STATIC ? staticFetch('token-analysis-simulation-stats.json') : fetchJSON('/token-analysis/simulation/stats'),
  getTokenSimulationChartData: () => IS_STATIC ? staticFetch('token-analysis-simulation-chart-data.json') : fetchJSON('/token-analysis/simulation/chart-data'),

  getH6Summary: () => IS_STATIC ? staticFetch('h6-summary.json') : fetchJSON('/h6/summary'),
  getH6Comparison: () => IS_STATIC ? staticFetch('h6-comparison.json') : fetchJSON('/h6/comparison'),
  getH6Data: () => IS_STATIC ? staticFetch('h6-data.json') : postJSON('/h6/data', {}),
  getH6Detail: (params) => IS_STATIC ? Promise.resolve(null) : postJSON('/h6/detail', params),
};
