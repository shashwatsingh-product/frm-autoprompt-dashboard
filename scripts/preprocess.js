const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const OUT_DIR = path.join(__dirname, '..', 'data', 'processed');

fs.mkdirSync(OUT_DIR, { recursive: true });

function parseAgents() {
  const raw = fs.readFileSync(path.join(RAW_DIR, 'agent_detailed_tabular.csv'), 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const agents = [];
  let current = null;

  for (const row of rows) {
    const useCase = row['Use-case']?.trim();
    const field = row['Field']?.trim();
    const value = row['Value']?.trim();

    if (!useCase || !field) continue;

    if (!current || current._useCase !== useCase) {
      if (current) agents.push(buildAgent(current));
      current = { _useCase: useCase, fields: {} };
    }
    current.fields[field] = value;
  }
  if (current) agents.push(buildAgent(current));

  return agents;
}

function buildAgent(raw) {
  const f = raw.fields;
  return {
    id: (f['Agent Name'] || '').replace(/_agent$/, ''),
    name: f['Agent Name'] || '',
    useCase: raw._useCase,
    functionality: f['Functionality'] || '',
    inputs: f['Inputs'] || '',
    inputType: f['Input Type'] || '',
    promptDescription: f['Input Prompt'] || '',
    promptVersions: f['Prompt Versions Available'] || '',
    evaluationClasses: (f['Prompt Evaluation Classes'] || '').split(',').map(s => s.trim()).filter(Boolean),
    decisionOutput: f['Decision Output'] || '',
    decisionOutputType: f['Decision Output Type'] || '',
    decisionOutputClasses: (f['Decision Output Class'] || '').split('|').map(s => s.trim()).filter(Boolean),
  };
}

function parseVerticals() {
  const raw = fs.readFileSync(path.join(RAW_DIR, 'vertical_incident_counts.csv'), 'utf-8');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const header = lines[0];
  const dataLines = lines.slice(1);

  const frmBlue = [];
  const frmHL = [];

  for (const line of dataLines) {
    const parts = line.split(',');
    const blueVertical = parts[0]?.trim();
    const blueCount = parseInt(parts[1]?.trim(), 10);
    const hlVertical = parts[3]?.trim();
    const hlCount = parseInt(parts[4]?.trim(), 10);

    if (blueVertical && blueVertical !== 'TOTAL' && !isNaN(blueCount)) {
      frmBlue.push({ vertical: blueVertical, incidents: blueCount });
    }
    if (hlVertical && hlVertical !== 'TOTAL' && !isNaN(hlCount)) {
      frmHL.push({ vertical: hlVertical, incidents: hlCount });
    }
  }

  frmBlue.sort((a, b) => b.incidents - a.incidents);
  frmHL.sort((a, b) => b.incidents - a.incidents);

  return { frmBlue, frmHL };
}

function parseCohorts() {
  const raw = fs.readFileSync(path.join(RAW_DIR, 'cohort_incident_tally.csv'), 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  return rows
    .filter(r => r['Cohort ID']?.trim())
    .map(r => ({
      cohortId: r['Cohort ID'].trim(),
      marketplace: r['Marketplace'].trim(),
      vertical: r['Vertical'].trim(),
      returnReason: r['Return Reason'].trim(),
      incidents: parseInt(r['Incident Count'], 10),
    }));
}

function buildOverview(agents, verticals, cohorts) {
  const totalBlue = verticals.frmBlue.reduce((s, v) => s + v.incidents, 0);
  const totalHL = verticals.frmHL.reduce((s, v) => s + v.incidents, 0);

  const reasonMap = {};
  const verticalMap = {};
  for (const c of cohorts) {
    reasonMap[c.returnReason] = (reasonMap[c.returnReason] || 0) + c.incidents;
    verticalMap[c.vertical] = (verticalMap[c.vertical] || 0) + c.incidents;
  }

  const returnReasons = Object.entries(reasonMap)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  const topVerticals = Object.entries(verticalMap)
    .map(([vertical, count]) => ({ vertical, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    totalIncidents: totalBlue + totalHL,
    agentCount: agents.length,
    cohortCount: cohorts.length,
    marketplaces: [
      { name: 'FRM-Blue (Flipkart)', key: 'FLIPKART', incidents: totalBlue, verticals: verticals.frmBlue.length },
      { name: 'FRM-HL (Hyperlocal)', key: 'HYPERLOCAL', incidents: totalHL, verticals: verticals.frmHL.length },
    ],
    returnReasons,
    topVerticals,
  };
}

// Run
const agents = parseAgents();
const verticals = parseVerticals();
const cohorts = parseCohorts();
const overview = buildOverview(agents, verticals, cohorts);

fs.writeFileSync(path.join(OUT_DIR, 'agents.json'), JSON.stringify(agents, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'verticals.json'), JSON.stringify(verticals, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'cohorts.json'), JSON.stringify(cohorts, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'overview.json'), JSON.stringify(overview, null, 2));

console.log(`Preprocessed: ${agents.length} agents, ${verticals.frmBlue.length}+${verticals.frmHL.length} verticals, ${cohorts.length} cohorts`);
console.log(`Total incidents: ${overview.totalIncidents}`);
