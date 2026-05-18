import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import SortableTable from '../components/SortableTable';
import Comments from '../components/Comments';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

/* ── Shared UI Atoms ────────────────────────────────────────────── */

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  function toggle(val) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white flex items-center gap-2 min-w-[150px] hover:border-gray-300 transition-colors"
      >
        <span className="flex-1 text-left truncate">
          {selected.length === 0 ? label : `${label} (${selected.length})`}
        </span>
        <span className="text-gray-400 text-xs">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto min-w-[220px]">
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border-b border-gray-100">
                Clear all
              </button>
            )}
            {options.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MetricBadge({ value, label }) {
  if (value == null) return <span className="text-[10px] text-gray-300">-</span>;
  const color = value >= 0.8 ? 'text-emerald-700 bg-emerald-50' :
                value >= 0.6 ? 'text-amber-700 bg-amber-50' :
                'text-red-700 bg-red-50';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${color}`}>
      {label}: {(value * 100).toFixed(1)}%
    </span>
  );
}

function ModeToggle({ mode, setMode, allCount, simulatedCount }) {
  const tabs = [
    { key: 'all', label: 'At Labelling Time', count: allCount, active: 'bg-blue-600 text-white', countActive: 'text-blue-200' },
    { key: 'current', label: 'Current Production Prompt', count: simulatedCount, active: 'bg-emerald-600 text-white', countActive: 'text-emerald-200' },
    { key: 'compare', label: 'Comparison', count: null, active: 'bg-amber-600 text-white', countActive: '' },
  ];
  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-1.5 mb-6">
      {tabs.map(({ key, label, count, active, countActive }) => (
        <button
          key={key}
          onClick={() => setMode(key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === key ? active : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {label}
          {count != null && (
            <span className={`ml-2 text-xs ${mode === key ? countActive : 'text-gray-400'}`}>
              {count?.toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function m(obj, field, mode) {
  if (mode === 'current') return obj[field + '_simulated'] ?? 0;
  return obj[field] ?? 0;
}

function approvalPrecision(obj, mode) {
  const pc = mode === 'current' ? (obj.per_class_simulated || {}) : (obj.per_class || {});
  if (pc['Approve']) return pc['Approve'].precision ?? null;
  if (pc['No Issue']) return pc['No Issue'].precision ?? null;
  return null;
}

function ApprovalBadge({ value, agent }) {
  if (value == null) return <span className="text-[10px] text-gray-300">-</span>;
  const color = value >= 0.8 ? 'text-emerald-700 bg-emerald-50' :
                value >= 0.6 ? 'text-amber-700 bg-amber-50' :
                'text-red-700 bg-red-50';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded ${color}`}>AP: {(value * 100).toFixed(1)}%</span>;
}

/* ── Per-class breakdown ────────────────────────────────────────── */

function PerClassTable({ perClass }) {
  if (!perClass || Object.keys(perClass).length === 0) return null;
  const rows = Object.entries(perClass).map(([cls, metrics]) => ({ class: cls, ...metrics }));
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 mt-4">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Class', 'Precision', 'Recall', 'F1', 'TP', 'FP', 'FN', 'Support'].map(h => (
              <th key={h} className={`px-4 py-2 text-xs font-semibold text-gray-600 uppercase ${h === 'Class' ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => (
            <tr key={r.class} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-medium text-gray-800">{r.class}</td>
              <td className="px-4 py-2 text-right">{(r.precision * 100).toFixed(1)}%</td>
              <td className="px-4 py-2 text-right">{(r.recall * 100).toFixed(1)}%</td>
              <td className="px-4 py-2 text-right font-semibold">{(r.f1 * 100).toFixed(1)}%</td>
              <td className="px-4 py-2 text-right text-gray-500">{r.tp}</td>
              <td className="px-4 py-2 text-right text-gray-500">{r.fp}</td>
              <td className="px-4 py-2 text-right text-gray-500">{r.fn}</td>
              <td className="px-4 py-2 text-right text-xs text-gray-500">{r.support}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Delta indicator ────────────────────────────────────────────── */

function DeltaBadge({ allVal, simVal, label, hasSimData }) {
  if (simVal == null || (!hasSimData && simVal === 0)) return <span className="text-[10px] text-gray-300">N/A</span>;
  const delta = simVal - allVal;
  const pct = (delta * 100).toFixed(1);
  const arrow = delta > 0.001 ? '\u25B2' : delta < -0.001 ? '\u25BC' : '\u25CF';
  const color = delta > 0.001 ? 'text-emerald-600' : delta < -0.001 ? 'text-red-600' : 'text-gray-400';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex gap-1 text-[10px]">
        <span className="text-blue-500">{(allVal * 100).toFixed(1)}</span>
        <span className="text-gray-300">vs</span>
        <span className="text-emerald-600">{(simVal * 100).toFixed(1)}</span>
      </div>
      <span className={`text-[10px] font-bold ${color}`}>
        {arrow} {delta > 0 ? '+' : ''}{pct}pp
      </span>
    </div>
  );
}

/* ── Prompt Diff Engine ─────────────────────────────────────────── */

function computeLineDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const result = [];

  const oldSet = new Set(oldLines.map(l => l.trim()));
  const newSet = new Set(newLines.map(l => l.trim()));

  const lcs = [];
  const m = oldLines.length, n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i - 1].trim() === newLines[j - 1].trim()
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);

  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1].trim() === newLines[j - 1].trim()) {
      lcs.unshift({ oi: i - 1, ni: j - 1 });
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  let oi = 0, ni = 0, li = 0;
  while (li < lcs.length || oi < m || ni < n) {
    const match = lcs[li];
    if (match && oi === match.oi && ni === match.ni) {
      result.push({ type: 'same', text: oldLines[oi] });
      oi++; ni++; li++;
    } else if (match) {
      while (oi < match.oi) { result.push({ type: 'removed', text: oldLines[oi] }); oi++; }
      while (ni < match.ni) { result.push({ type: 'added', text: newLines[ni] }); ni++; }
    } else {
      while (oi < m) { result.push({ type: 'removed', text: oldLines[oi] }); oi++; }
      while (ni < n) { result.push({ type: 'added', text: newLines[ni] }); ni++; }
    }
  }
  return result;
}

/* ── Prompt Comparison Modal ────────────────────────────────────── */

function PromptComparisonModal({ promptId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('diff');

  useEffect(() => {
    if (!promptId) return;
    api.getPromptComparison(promptId).then(setData).finally(() => setLoading(false));
  }, [promptId]);

  const diff = useMemo(() => {
    if (!data) return [];
    return computeLineDiff(data.labelling_prompt || '', data.current_prompt || '');
  }, [data]);

  const diffStats = useMemo(() => {
    const added = diff.filter(d => d.type === 'added').length;
    const removed = diff.filter(d => d.type === 'removed').length;
    const same = diff.filter(d => d.type === 'same').length;
    const total = Math.max(diff.length, 1);
    const changePercent = ((added + removed) / total * 100).toFixed(0);
    return { added, removed, same, changePercent };
  }, [diff]);

  if (!promptId) return null;

  const lineColors = { removed: 'bg-red-50 text-red-800', added: 'bg-emerald-50 text-emerald-800', same: 'text-gray-700' };
  const linePrefix = { removed: '-', added: '+', same: ' ' };
  const linePrefixColor = { removed: 'text-red-400', added: 'text-emerald-400', same: 'text-gray-300' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-7xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Prompt Comparison</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-500">
                {data?.current_prompt_name || promptId}
                {data?.current_prompt_agent && <span className="ml-1 text-gray-400">({data.current_prompt_agent})</span>}
              </span>
              {data && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-semibold">-{diffStats.removed} lines</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">+{diffStats.added} lines</span>
                  <span className="text-gray-400">{diffStats.changePercent}% changed</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {['diff', 'side-by-side'].map(m => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${viewMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {m === 'diff' ? 'Unified Diff' : 'Side by Side'}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none ml-4">&times;</button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20 text-gray-400">Loading prompts...</div>
        ) : viewMode === 'diff' ? (
          <div className="flex-1 overflow-y-auto">
            {diffStats.added === 0 && diffStats.removed === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <span className="text-3xl mb-2">===</span>
                <span className="text-sm font-medium">Prompts are identical</span>
                <span className="text-xs mt-1">No differences found between labelling and current production prompt</span>
              </div>
            ) : (
              <div className="font-mono text-xs leading-relaxed">
                {diff.map((line, idx) => (
                  <div key={idx} className={`flex ${lineColors[line.type]} ${line.type !== 'same' ? 'border-l-2' : ''} ${line.type === 'removed' ? 'border-red-300' : line.type === 'added' ? 'border-emerald-300' : ''}`}>
                    <span className={`w-6 text-right pr-1 select-none ${linePrefixColor[line.type]} font-bold flex-shrink-0`}>{linePrefix[line.type]}</span>
                    <span className="px-3 py-px whitespace-pre-wrap break-all flex-1">{line.text || '\u00A0'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-gray-200">
            <div className="flex flex-col overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
                <h3 className="text-sm font-semibold text-amber-800">Labelling Prompt</h3>
                <p className="text-[10px] text-amber-600">Prompt used during labelling (from raw data)</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {data?.labelling_prompt || 'No labelling prompt found'}
                </pre>
              </div>
            </div>
            <div className="flex flex-col overflow-hidden">
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200">
                <h3 className="text-sm font-semibold text-emerald-800">Current Production Prompt</h3>
                <p className="text-[10px] text-emerald-600">From Prompts Hub / DOCX (current live version)</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {data?.current_prompt || 'No production prompt found in Prompts Hub'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── HPC/MPC Badge ──────────────────────────────────────────────── */

function PromptChangedBadge({ row }) {
  const total = row.total || 0;
  const current = row.total_current || 0;
  if (total === 0) return <span className="text-[10px] text-gray-300">-</span>;
  if (current === total) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-600 border-emerald-200">Same</span>;
  if (current === 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-orange-50 text-orange-600 border-orange-200">Changed</span>;
  const pct = ((total - current) / total * 100).toFixed(0);
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200" title={`${pct}% records on different prompt`}>Partial</span>;
}

function HpcMpcBadge({ value }) {
  if (!value) return <span className="text-[10px] text-gray-300">-</span>;
  const cls = value === 'HPC'
    ? 'bg-rose-100 text-rose-700 border-rose-200'
    : 'bg-sky-100 text-sky-700 border-sky-200';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}`}>{value}</span>;
}

/* ── Comparison Agent Bar Chart ─────────────────────────────────── */

function ComparisonBarChart({ agentMetrics }) {
  const data = agentMetrics
    .filter(a => (a.total_simulated || 0) > 0)
    .map(a => ({
      name: a.agent.replace(/_agent$/, ''),
      'Labelling - Precision': +(a.macro_precision * 100).toFixed(1),
      'Prod Prompt - Precision': +((a.macro_precision_simulated || 0) * 100).toFixed(1),
      'Labelling - Recall': +(a.macro_recall * 100).toFixed(1),
      'Prod Prompt - Recall': +((a.macro_recall_simulated || 0) * 100).toFixed(1),
    }));

  if (!data.length) return <p className="text-sm text-gray-400 py-8 text-center">No agents with simulation data yet</p>;

  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart data={data} margin={{ left: 10, right: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={80} />
        <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} fontSize={11} />
        <Tooltip formatter={v => v + '%'} />
        <Legend />
        <Bar dataKey="Labelling - Precision" fill="#60a5fa" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Prod Prompt - Precision" fill="#34d399" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Labelling - Recall" fill="#93c5fd" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Prod Prompt - Recall" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */

export default function Simulation() {
  const [summary, setSummary] = useState(null);
  const [agentMetrics, setAgentMetrics] = useState([]);
  const [cohortMetrics, setCohortMetrics] = useState([]);
  const [groundTruth, setGroundTruth] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('all');

  const [selAgents, setSelAgents] = useState([]);
  const [selMarketplaces, setSelMarketplaces] = useState([]);
  const [selReasons, setSelReasons] = useState([]);
  const [selVerticals, setSelVerticals] = useState([]);
  const [selHpcMpc, setSelHpcMpc] = useState([]);
  const [verticalSearch, setVerticalSearch] = useState('');

  const [expandedAgent, setExpandedAgent] = useState(null);
  const [comparePromptId, setComparePromptId] = useState(null);

  useEffect(() => {
    Promise.all([
      api.getSimulationSummary(),
      api.getSimulationAgents(),
      api.getSimulationCohorts(),
      api.getNote('ground-truth'),
    ]).then(([s, a, c, gt]) => {
      setSummary(s);
      setAgentMetrics(a);
      setCohortMetrics(c);
      setGroundTruth(gt.content);
    }).finally(() => setLoading(false));
  }, []);

  const agents = useMemo(() => [...new Set(cohortMetrics.map(c => c.agent))].sort(), [cohortMetrics]);
  const marketplaces = useMemo(() => [...new Set(cohortMetrics.map(c => c.marketplace))].sort(), [cohortMetrics]);
  const returnReasons = useMemo(() => [...new Set(cohortMetrics.map(c => c.return_reason))].sort(), [cohortMetrics]);
  const verticals = useMemo(() => [...new Set(cohortMetrics.map(c => c.vertical))].sort(), [cohortMetrics]);
  const hpcMpcOptions = useMemo(() => [...new Set(cohortMetrics.map(c => c.hpc_mpc).filter(Boolean))].sort(), [cohortMetrics]);

  const hasAnyFilter = selAgents.length || selMarketplaces.length || selReasons.length || selVerticals.length || selHpcMpc.length || verticalSearch;
  const clearFilters = useCallback(() => {
    setSelAgents([]); setSelMarketplaces([]); setSelReasons([]); setSelVerticals([]); setSelHpcMpc([]); setVerticalSearch('');
  }, []);

  const filtered = useMemo(() => {
    let data = cohortMetrics;
    if (mode === 'current') data = data.filter(c => (c.total_simulated || 0) > 0);
    if (mode === 'compare') data = data.filter(c => (c.total_simulated || 0) > 0);
    if (selAgents.length) data = data.filter(c => selAgents.includes(c.agent));
    if (selMarketplaces.length) data = data.filter(c => selMarketplaces.includes(c.marketplace));
    if (selReasons.length) data = data.filter(c => selReasons.includes(c.return_reason));
    if (selVerticals.length) data = data.filter(c => selVerticals.includes(c.vertical));
    if (selHpcMpc.length) data = data.filter(c => selHpcMpc.includes(c.hpc_mpc || ''));
    if (verticalSearch) data = data.filter(c => c.vertical.toLowerCase().includes(verticalSearch.toLowerCase()));
    return data;
  }, [cohortMetrics, selAgents, selMarketplaces, selReasons, selVerticals, selHpcMpc, verticalSearch, mode]);

  const agentChartData = useMemo(() =>
    agentMetrics
      .filter(a => {
        if (mode === 'current') return (a.total_simulated || 0) > 0;
        return true;
      })
      .map(a => ({
        name: a.agent.replace(/_agent$/, ''),
        accuracy: +(m(a, 'accuracy', mode) * 100).toFixed(1),
        macro_f1: +(m(a, 'macro_f1', mode) * 100).toFixed(1),
        macro_precision: +(m(a, 'macro_precision', mode) * 100).toFixed(1),
        macro_recall: +(m(a, 'macro_recall', mode) * 100).toFixed(1),
        total: mode === 'current' ? (a.total_simulated || 0) : a.total,
      })),
    [agentMetrics, mode]
  );

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;
  if (!summary || !summary.total_records) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500 text-lg">No simulation data available</p>
        <p className="text-gray-400 text-sm mt-2">Run <code className="bg-gray-100 px-2 py-1 rounded">python3 scripts/recompute_simulation.py</code></p>
      </div>
    );
  }

  const hasSimData = (summary.total_simulated_records || 0) > 0;
  const totalForMode = mode === 'current' ? (summary.total_simulated_records || 0) : summary.total_records;
  const hpcMpcStats = summary.hpc_mpc_stats || {};

  /* ── Cohort table columns ─────────────────────────────────────── */
  const baseCols = [
    {
      key: 'agent', label: 'Agent',
      render: v => <span className="text-xs font-medium">{v.replace(/_agent$/, '')}</span>,
    },
    {
      key: 'marketplace', label: 'Mkt',
      render: v => <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${v === 'FLIPKART' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {v === 'FLIPKART' ? 'Blue' : 'HL'}
      </span>,
    },
    { key: 'vertical', label: 'Vertical' },
    {
      key: 'return_reason', label: 'Reason',
      render: v => <span className="text-xs">{v.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'hpc_mpc', label: 'HPC/MPC',
      render: v => <HpcMpcBadge value={v} />,
    },
    {
      key: 'prompt_id', label: 'Prompt',
      render: v => v ? (
        <button
          onClick={e => { e.stopPropagation(); setComparePromptId(v); }}
          className="text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer truncate max-w-[120px] block"
          title={`Compare prompts: ${v}`}
        >
          {v}
        </button>
      ) : <span className="text-gray-300 text-[10px]">-</span>,
    },
  ];

  let cohortColumns;
  if (mode === 'compare') {
    cohortColumns = [
      ...baseCols,
      { key: 'total', label: 'N (Lab)', render: (v) => v?.toLocaleString() },
      { key: 'total_simulated', label: 'N (Sim)', render: (v, row) => (row.total_simulated || 0).toLocaleString() },
      {
        key: 'macro_precision', label: 'Precision \u0394',
        render: (v, row) => <DeltaBadge allVal={row.macro_precision} simVal={row.macro_precision_simulated} label="P" hasSimData={(row.total_simulated || 0) > 0} />,
      },
      {
        key: 'macro_recall', label: 'Recall \u0394',
        render: (v, row) => <DeltaBadge allVal={row.macro_recall} simVal={row.macro_recall_simulated} label="R" hasSimData={(row.total_simulated || 0) > 0} />,
      },
      {
        key: 'macro_f1', label: 'F1 \u0394',
        render: (v, row) => <DeltaBadge allVal={row.macro_f1} simVal={row.macro_f1_simulated} label="F1" hasSimData={(row.total_simulated || 0) > 0} />,
      },
      {
        key: 'accuracy', label: 'Accuracy \u0394',
        render: (v, row) => <DeltaBadge allVal={row.accuracy} simVal={row.accuracy_simulated} label="Acc" hasSimData={(row.total_simulated || 0) > 0} />,
      },
      {
        key: 'approval_precision', label: 'Appr. Prec. \u0394',
        render: (v, row) => {
          const allAp = approvalPrecision(row, 'all');
          const simAp = approvalPrecision(row, 'current');
          if (allAp == null && simAp == null) return <span className="text-[10px] text-gray-300">-</span>;
          return <DeltaBadge allVal={allAp || 0} simVal={simAp} label="AP" hasSimData={simAp != null} />;
        },
      },
    ];
  } else {
    const mKey = mode === 'current' ? '_simulated' : '';
    cohortColumns = [
      ...baseCols,
      {
        key: mode === 'current' ? 'total_simulated' : 'total',
        label: 'N',
        render: (v, row) => (mode === 'current' ? (row.total_simulated || 0) : row.total)?.toLocaleString(),
      },
      {
        key: `accuracy${mKey}`, label: 'Accuracy',
        render: (v, row) => <MetricBadge value={m(row, 'accuracy', mode)} label="Acc" />,
      },
      {
        key: `macro_precision${mKey}`, label: 'Precision',
        render: (v, row) => <MetricBadge value={m(row, 'macro_precision', mode)} label="P" />,
      },
      {
        key: `macro_recall${mKey}`, label: 'Recall',
        render: (v, row) => <MetricBadge value={m(row, 'macro_recall', mode)} label="R" />,
      },
      {
        key: `macro_f1${mKey}`, label: 'F1',
        render: (v, row) => <MetricBadge value={m(row, 'macro_f1', mode)} label="F1" />,
      },
      {
        key: 'approval_precision', label: 'Appr. Prec.',
        render: (v, row) => <ApprovalBadge value={approvalPrecision(row, mode)} />,
      },
    ];
  }

  return (
    <div>
      <PageHeader
        title="Simulation Results"
        subtitle="Agent performance: precision, recall, F1 at cohort level (vertical x reason x marketplace)"
      />

      {groundTruth && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1">Ground Truth Assumptions</h4>
          <p className="text-sm text-blue-800 whitespace-pre-wrap">{groundTruth}</p>
        </div>
      )}

      <ModeToggle mode={mode} setMode={setMode} allCount={summary.total_records} simulatedCount={summary.total_simulated_records || 0} />

      {mode === 'current' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-emerald-800">
            All labelled records <strong>re-run through the current production prompt</strong> via Gemini 2.5 Flash.
            This shows how today's prompt performs against human ground truth across all historical data.
          </p>
          <p className="text-xs text-emerald-600 mt-1">
            {(summary.total_simulated_records || 0).toLocaleString()} of {summary.total_records.toLocaleString()} records simulated
            ({((summary.total_simulated_records || 0) / summary.total_records * 100).toFixed(1)}%)
            {(summary.total_simulated_records || 0) < summary.total_records && ' — simulation in progress for HPC cohorts'}
          </p>
        </div>
      )}

      {mode === 'compare' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            Comparing <span className="font-semibold text-blue-600">At Labelling Time</span> vs{' '}
            <span className="font-semibold text-emerald-600">Current Production Prompt</span> (re-simulated via Gemini) side by side.
            Only cohorts with simulation data are shown. Green delta = current prompt performs better.
          </p>
        </div>
      )}

      {/* ── Summary stat cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Prediction Records" value={mode === 'compare' ? summary.total_records : totalForMode} color="blue" />
        <StatCard label="Agents Evaluated" value={summary.agents_evaluated} color="emerald" />
        <StatCard label="Cohorts" value={filtered.length} color="amber" />
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {mode === 'compare' ? 'Simulated Records' : 'HPC / MPC'}
          </p>
          {mode === 'compare' ? (
            <>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{(summary.total_simulated_records || 0).toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {((summary.total_simulated_records || 0) / summary.total_records * 100).toFixed(1)}% simulated
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-rose-600">{hpcMpcStats.hpc || 0}</span>
                <span className="text-xs text-gray-400">/</span>
                <span className="text-lg font-bold text-sky-600">{hpcMpcStats.mpc || 0}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">cohorts classified</p>
            </>
          )}
        </div>
        <StatCard label="Date Range" value={`${summary.timestamp_range?.from?.slice(0, 10) || ''} \u2014 ${summary.timestamp_range?.to?.slice(0, 10) || ''}`} color="sky" />
      </div>

      {/* ── Charts ────────────────────────────────────────────────── */}
      {mode === 'compare' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Precision & Recall: At Labelling Time vs Current Production Prompt</h3>
          <p className="text-xs text-gray-400 mb-4">Only agents with simulation data shown</p>
          <ComparisonBarChart agentMetrics={agentMetrics} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Agent-Level Performance Overview</h3>
          <p className="text-xs text-gray-400 mb-4">
            {mode === 'current' ? 'Showing metrics from re-simulation with current production prompt' : 'Showing metrics across all labelling data (at labelling time)'}
          </p>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={agentChartData} margin={{ left: 10, right: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} angle={-25} textAnchor="end" height={80} />
              <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} fontSize={11} />
              <Tooltip formatter={v => v + '%'} />
              <Legend />
              <Bar dataKey="accuracy" name="Accuracy" fill={mode === 'current' ? '#059669' : mode === 'simulated' ? '#2563eb' : '#2563eb'} radius={[4, 4, 0, 0]} />
              <Bar dataKey="macro_f1" name="Macro F1" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="macro_precision" name="Macro Precision" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="macro_recall" name="Macro Recall" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Agent detail (not in compare mode) ────────────────────── */}
      {mode !== 'compare' && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Agent Detail Breakdown</h3>
          <div className="space-y-3">
            {agentMetrics
              .filter(a => {
                if (mode === 'current') return (a.total_simulated || 0) > 0;
                return true;
              })
              .map(a => {
                const total = m(a, 'total', mode);
                const correct = m(a, 'correct', mode);
                const perClass = mode === 'current' ? (a.per_class_simulated || {}) : a.per_class;
                return (
                  <div key={a.agent} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedAgent(expandedAgent === a.agent ? null : a.agent)}>
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-gray-800 text-sm">{a.agent}</h4>
                        <span className="text-xs text-gray-400">{total.toLocaleString()} records</span>
                        {mode === 'all' && (a.total_simulated || 0) > 0 && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">
                            {(a.total_simulated || 0).toLocaleString()} simulated
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <MetricBadge value={m(a, 'accuracy', mode)} label="Acc" />
                        <MetricBadge value={m(a, 'macro_f1', mode)} label="F1" />
                        <ApprovalBadge value={approvalPrecision(a, mode)} />
                        <span className="text-gray-400 text-sm">{expandedAgent === a.agent ? '\u25B2' : '\u25BC'}</span>
                      </div>
                    </div>
                    {expandedAgent === a.agent && (
                      <div className="mt-3">
                        <div className="flex gap-4 text-xs text-gray-500 mb-2">
                          <span>Macro Precision: {(m(a, 'macro_precision', mode) * 100).toFixed(1)}%</span>
                          <span>Macro Recall: {(m(a, 'macro_recall', mode) * 100).toFixed(1)}%</span>
                          {approvalPrecision(a, mode) != null && <span>Approval Precision: {(approvalPrecision(a, mode) * 100).toFixed(1)}%</span>}
                          <span>Correct: {correct.toLocaleString()} / {total.toLocaleString()}</span>
                        </div>
                        {mode === 'all' && (a.total_simulated || 0) > 0 && (
                          <div className="flex gap-4 text-xs text-emerald-600 mb-2 bg-emerald-50 p-2 rounded">
                            <span>Current Prod Prompt \u2014 Acc: {((a.accuracy_simulated || 0) * 100).toFixed(1)}%</span>
                            <span>F1: {((a.macro_f1_simulated || 0) * 100).toFixed(1)}%</span>
                            <span>P: {((a.macro_precision_simulated || 0) * 100).toFixed(1)}%</span>
                            <span>R: {((a.macro_recall_simulated || 0) * 100).toFixed(1)}%</span>
                            {approvalPrecision(a, 'current') != null && <span>AP: {(approvalPrecision(a, 'current') * 100).toFixed(1)}%</span>}
                            <span>({(a.total_simulated || 0).toLocaleString()} records)</span>
                          </div>
                        )}
                        <PerClassTable perClass={perClass} />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Compare mode: agent comparison cards ──────────────────── */}
      {mode === 'compare' && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Agent-Level Comparison</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agentMetrics
              .filter(a => (a.total_simulated || 0) > 0)
              .map(a => {
                const metrics = ['accuracy', 'macro_precision', 'macro_recall', 'macro_f1', 'approval_precision'];
                const labels = { accuracy: 'Accuracy', macro_precision: 'Precision', macro_recall: 'Recall', macro_f1: 'F1', approval_precision: 'Appr. Prec.' };
                return (
                  <div key={a.agent} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800 text-sm">{a.agent.replace(/_agent$/, '')}</h4>
                      <span className="text-[10px] text-gray-400">{a.total.toLocaleString()} labelled / {(a.total_simulated || 0).toLocaleString()} simulated</span>
                    </div>
                    <div className="grid grid-cols-5 gap-3">
                      {metrics.map(metric => {
                        const allVal = metric === 'approval_precision' ? (approvalPrecision(a, 'all') ?? null) : (a[metric] || 0);
                        const curVal = metric === 'approval_precision' ? (approvalPrecision(a, 'current') ?? null) : (a[`${metric}_simulated`] || 0);
                        if (allVal == null && curVal == null) return (
                          <div key={metric} className="text-center">
                            <p className="text-[10px] text-gray-500 uppercase mb-1">{labels[metric]}</p>
                            <span className="text-[10px] text-gray-300">N/A</span>
                          </div>
                        );
                        const delta = curVal - allVal;
                        const deltaColor = delta > 0.001 ? 'text-emerald-600' : delta < -0.001 ? 'text-red-600' : 'text-gray-400';
                        return (
                          <div key={metric} className="text-center">
                            <p className="text-[10px] text-gray-500 uppercase mb-1">{labels[metric]}</p>
                            <div className="flex justify-center gap-1 text-xs">
                              <span className="text-blue-600 font-semibold">{(allVal * 100).toFixed(1)}</span>
                              <span className="text-gray-300">/</span>
                              <span className="text-emerald-600 font-semibold">{(curVal * 100).toFixed(1)}</span>
                            </div>
                            <p className={`text-[10px] font-bold ${deltaColor}`}>
                              {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}pp
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Cohort-level section ──────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Cohort-Level Metrics</h3>

        <div className="flex flex-wrap gap-3 mb-4">
          <MultiSelect label="Agent" options={agents} selected={selAgents} onChange={setSelAgents} />
          <MultiSelect label="Marketplace" options={marketplaces} selected={selMarketplaces} onChange={setSelMarketplaces} />
          <MultiSelect label="Return Reason" options={returnReasons} selected={selReasons} onChange={setSelReasons} />
          <MultiSelect label="Vertical" options={verticals} selected={selVerticals} onChange={setSelVerticals} />
          {hpcMpcOptions.length > 0 && (
            <MultiSelect label="HPC/MPC" options={hpcMpcOptions} selected={selHpcMpc} onChange={setSelHpcMpc} />
          )}
          <input
            type="text"
            placeholder="Search vertical..."
            value={verticalSearch}
            onChange={e => setVerticalSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {hasAnyFilter && (
            <button onClick={clearFilters} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
              Clear filters
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mb-3">
          Showing {filtered.length} cohort-agent combinations
          {mode === 'current' && ' (with simulation data only)'}
          {mode === 'compare' && ' (with simulation data for comparison)'}
        </p>

        <SortableTable columns={cohortColumns} data={filtered} pageSize={25} />
      </div>

      <Comments pageId="simulation" />

      {comparePromptId && (
        <PromptComparisonModal promptId={comparePromptId} onClose={() => setComparePromptId(null)} />
      )}
    </div>
  );
}
