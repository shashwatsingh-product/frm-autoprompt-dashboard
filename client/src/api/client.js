const BASE = '/api';

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
  getOverview: () => fetchJSON('/overview'),
  getAgents: () => fetchJSON('/agents'),
  getAgent: (id) => fetchJSON(`/agents/${id}`),
  getVerticals: () => fetchJSON('/verticals'),
  getCohorts: (filters) => fetchJSON('/cohorts', filters),

  getComments: (pageId) => fetchJSON(`/comments/${pageId}`),
  addComment: (pageId, { author, text }) => postJSON(`/comments/${pageId}`, { author, text }),
  deleteComment: (pageId, commentId) => deleteJSON(`/comments/${pageId}/${commentId}`),

  getNote: (pageId) => fetchJSON(`/notes/${pageId}`),
  saveNote: (pageId, content) => putJSON(`/notes/${pageId}`, { content }),

  getPrompts: () => fetchJSON('/prompts'),
  getPrompt: (id) => fetchJSON(`/prompts/${id}`),
  getPromptsSummary: () => fetchJSON('/prompts/summary'),
  updatePromptStatus: (id, isLive) => fetch('/api/prompts/' + id + '/status', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isLive }),
  }).then(r => r.json()),
  getPromptMappings: (filters) => fetchJSON('/prompts/mappings/list', filters),

  getSimulationSummary: () => fetchJSON('/simulation/summary'),
  getSimulationAgents: () => fetchJSON('/simulation/agents'),
  getSimulationCohorts: (filters) => fetchJSON('/simulation/cohorts', filters),
  getPromptComparison: (promptId) => fetchJSON(`/simulation/prompt-compare/${encodeURIComponent(promptId)}`),

  getPlaygroundOptions: () => fetchJSON('/playground/options'),
  getSimulationStatus: () => fetchJSON('/playground/simulation-status'),
  runPlaygroundSimulation: (params) => postJSON('/playground/simulate', params),

  getLabellingFilters: () => fetchJSON('/labelling/filters'),
  queryLabelling: (params) => postJSON('/labelling/query', params),
  getLabellingDetail: (id) => fetchJSON(`/labelling/detail/${id}`),
  downloadLabelling: (params) => postJSON('/labelling/download', params),
  getLabellingStats: (params) => postJSON('/labelling/stats', params),

  getGoldenSummary: () => fetchJSON('/golden-set/summary'),
  getGoldenCohorts: (params) => postJSON('/golden-set/cohorts', params),
  getGoldenCohortDetail: (params) => postJSON('/golden-set/cohort-detail', params),

  getSariSummary: () => fetchJSON('/sari-misshipment/summary'),
  getSariData: (params) => postJSON('/sari-misshipment/data', params),
  getSariConfusion: () => fetchJSON('/sari-misshipment/confusion'),

  getH3Summary: (params) => params ? postJSON('/h3-test/summary', params) : fetchJSON('/h3-test/summary'),
  getH3MultiSummary: () => fetchJSON('/h3-test/multi-summary'),
  getH3Mismatches: (params) => postJSON('/h3-test/mismatches', params),
  getH3Data: (params) => postJSON('/h3-test/data', params),
  getH3Detail: (params) => postJSON('/h3-test/detail', params),
  getH3InterRun: () => fetchJSON('/h3-test/inter-run'),

  getH2Summary: () => fetchJSON('/h2/summary'),
  getH2Incidents: (params) => fetchJSON('/h2/incidents', params),

  getH4All: () => fetchJSON('/h4/all'),
  getH4Catalog: () => fetchJSON('/h4/catalog'),
  getH4Obd: () => fetchJSON('/h4/obd'),
  getH4Cx: () => fetchJSON('/h4/cx'),

  getTokenAnalysisSummary: () => fetchJSON('/token-analysis/summary'),
  getTokenAnalysisPrompts: () => fetchJSON('/token-analysis/prompts'),
  getTokenSimulationResults: () => fetchJSON('/token-analysis/simulation'),
  getTokenSimulationStats: () => fetchJSON('/token-analysis/simulation/stats'),
  getTokenSimulationChartData: () => fetchJSON('/token-analysis/simulation/chart-data'),

  getH6Summary: () => fetchJSON('/h6/summary'),
  getH6Comparison: () => fetchJSON('/h6/comparison'),
  getH6Data: (params) => postJSON('/h6/data', params),
  getH6Detail: (params) => postJSON('/h6/detail', params),
};
