import { useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine, LabelList,
} from 'recharts';
import { api } from '../api/client';

// Gemini 2.5 Flash pricing (per 1K tokens, USD)
const GEPA = {
  input_lt_200k:  0.00010,  // $0.10 / 1M
  input_gt_200k:  0.00040,  // $0.40 / 1M (>200K context)
  output:         0.00040,  // $0.40 / 1M
  image_per_img:  0.000265, // per image (standard ~265 tokens equivalent)
};

// Which agents run per incident type
const INCIDENT_PIPELINE = {
  misshipment: ['match', 'mismatch'],
  damage:      ['damage'],
  missing:     ['missing'],
};

const COLOR = {
  match:    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', hero: 'from-emerald-600 to-emerald-700' },
  mismatch: { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    badge: 'bg-rose-100 text-rose-800',       bar: 'bg-rose-500',    hero: 'from-rose-600 to-rose-700' },
  damage:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-800',     bar: 'bg-amber-500',   hero: 'from-amber-500 to-amber-600' },
  missing:  { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  badge: 'bg-violet-100 text-violet-800',   bar: 'bg-violet-500',  hero: 'from-violet-600 to-violet-700' },
};

const AGENT_LABEL = {
  match: 'Match Agent', mismatch: 'Mismatch Agent',
  damage: 'Damage Agent', missing: 'Missing Agent',
};

const IMAGE_COUNTS = { match: 2, mismatch: 2, damage: 2, missing: 2 }; // catalog + evidence

function fmt(n) { return n?.toLocaleString() ?? '—'; }
function fmtUSD(n, decimals = 4) { return n != null ? `$${n.toFixed(decimals)}` : '—'; }

function TokenBar({ value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-10 text-right">{fmt(value)}</span>
    </div>
  );
}

function AgentCard({ stat, maxTokens }) {
  const c = COLOR[stat.agent_type];
  const images = IMAGE_COUNTS[stat.agent_type] || 2;
  const costPerCall = (stat.avg / 1000) * GEPA.input_lt_200k + (150 / 1000) * GEPA.output + images * GEPA.image_per_img;
  const costMin = (stat.min / 1000) * GEPA.input_lt_200k + (50 / 1000) * GEPA.output + images * GEPA.image_per_img;
  const costMax = (stat.max / 1000) * GEPA.input_lt_200k + (200 / 1000) * GEPA.output + images * GEPA.image_per_img;

  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden`}>
      <div className={`bg-gradient-to-r ${c.hero} px-4 py-3 flex items-center justify-between`}>
        <div>
          <h3 className="text-white font-bold text-sm">{AGENT_LABEL[stat.agent_type]}</h3>
          <p className="text-white/70 text-xs">{stat.count} prompts  ·  {images} images per call</p>
        </div>
        <span className="text-white/80 text-xs font-mono">{fmt(stat.min)}–{fmt(stat.max)} tok</span>
      </div>
      <div className={`${c.bg} p-4 space-y-3`}>
        {/* Token range bars */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">
            <span>Prompt token range</span>
            <span>avg {fmt(stat.avg)}</span>
          </div>
          {['min','avg','max'].map(k => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 w-6 uppercase">{k}</span>
              <TokenBar value={stat[k]} max={maxTokens} color={c.bar} />
            </div>
          ))}
        </div>

        {/* Cost estimate */}
        <div className="border-t border-slate-200 pt-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-2">
            Est. cost / call (Gemini 2.5 Flash)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[['Min', costMin], ['Avg', costPerCall], ['Max', costMax]].map(([label, val]) => (
              <div key={label} className="text-center">
                <p className="text-[10px] text-slate-400">{label}</p>
                <p className={`text-sm font-bold ${c.text}`}>{fmtUSD(val)}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">
            Input + {images} images + ~output (est.)
          </p>
        </div>
      </div>
    </div>
  );
}

function PromptTable({ prompts, agentFilter }) {
  const [search, setSearch] = useState('');
  const filtered = prompts.filter(p =>
    (agentFilter === 'all' || p.agent_type === agentFilter) &&
    (p.vertical.includes(search) || (p.sub_type || '').includes(search))
  );
  const maxTok = Math.max(...filtered.map(p => p.prompt_tokens));

  return (
    <div>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Filter by vertical or sub-type..."
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800 text-white">
              {['Agent','Vertical','Sub-type','Prompt Tokens','Token Bar','Chars'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-[11px] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const c = COLOR[p.agent_type];
              return (
                <tr key={p.filename} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.badge}`}>
                      {AGENT_LABEL[p.agent_type]}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-700">{p.vertical}</td>
                  <td className="px-3 py-2 text-slate-500">{p.sub_type || '—'}</td>
                  <td className="px-3 py-2 font-mono font-bold text-slate-800">{fmt(p.prompt_tokens)}</td>
                  <td className="px-3 py-2 w-40">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${c.bar}`}
                        style={{ width: `${Math.round((p.prompt_tokens / maxTok) * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{fmt(p.char_count)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">No prompts match filter</div>
        )}
      </div>
      <p className="text-xs text-slate-400 mt-2">{filtered.length} of {prompts.length} prompts shown</p>
    </div>
  );
}

function OutputExplorer() {
  const [simData, setSimData]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [agentF, setAgentF]       = useState('all');
  const [vertF, setVertF]         = useState('all');
  const [statusF, setStatusF]     = useState('all');
  const [truncF, setTruncF]       = useState('all'); // all | truncated | not_truncated
  const [outTokMin, setOutTokMin] = useState('');
  const [outTokMax, setOutTokMax] = useState('');
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState(null);
  const [page, setPage]           = useState(0);
  const PAGE_SIZE = 50;

  function load() {
    api.getTokenSimulationResults()
      .then(d => { setSimData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading simulation results...</div>;
  if (!simData) return <div className="flex items-center justify-center h-48 text-rose-400 text-sm">Failed to load simulation data</div>;
  if (simData.status === 'pending') return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
      <p className="text-amber-800 font-semibold text-sm">Simulation not yet run</p>
      <p className="text-amber-600 text-xs mt-1">Run <code className="bg-amber-100 px-1 rounded">python3 scripts/token_simulation.py</code> to generate output data.</p>
    </div>
  );

  // Deduplicate: keep latest entry per (incident_id, agent_type, sub_type) — prefer success
  const raw = simData.results || [];
  const seen = new Map();
  for (const r of raw) {
    const k = `${r.incident_id}|${r.agent_type}|${r.sub_type}`;
    const prev = seen.get(k);
    if (!prev || (r.status === 'success' && prev.status !== 'success')) seen.set(k, r);
  }
  const results = [...seen.values()];
  const verticals = [...new Set(results.map(r => r.vertical))].sort();
  const agents    = [...new Set(results.map(r => r.agent_type))].sort();

  const filtered = results.filter(r => {
    if (agentF !== 'all' && r.agent_type !== agentF) return false;
    if (vertF !== 'all' && r.vertical !== vertF) return false;
    if (statusF !== 'all' && r.status !== statusF) return false;
    if (truncF === 'truncated' && r.output_tokens < 499) return false;
    if (truncF === 'not_truncated' && r.output_tokens >= 499) return false;
    if (outTokMin !== '' && r.output_tokens < Number(outTokMin)) return false;
    if (outTokMax !== '' && r.output_tokens > Number(outTokMax)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.incident_id||'').toLowerCase().includes(q)
          || (r.output_snippet||'').toLowerCase().includes(q)
          || (r.sub_type||'').toLowerCase().includes(q);
    }
    return true;
  });

  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const successCount = results.filter(r => r.status === 'success').length;
  const avgOut  = successCount > 0 ? Math.round(results.filter(r=>r.status==='success').reduce((s,r)=>s+r.output_tokens,0) / successCount) : 0;
  const avgIn   = successCount > 0 ? Math.round(results.filter(r=>r.status==='success').reduce((s,r)=>s+r.prompt_tokens,0) / successCount) : 0;


  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-4 gap-3 flex-1">
          {[
            ['Total calls', fmt(results.length)],
            ['Successful', `${fmt(successCount)} (${results.length ? Math.round(successCount/results.length*100) : 0}%)`],
            ['Avg input tok', fmt(avgIn)],
            ['Avg output tok', fmt(avgOut)],
          ].map(([label, val]) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</p>
              <p className="text-lg font-bold text-slate-800 font-mono">{val}</p>
            </div>
          ))}
        </div>
        <button onClick={load}
          className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-xl bg-white hover:bg-slate-50 text-slate-600 whitespace-nowrap">
          ↻ Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={agentF} onChange={e=>{setAgentF(e.target.value);setPage(0)}}
          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none">
          <option value="all">All agents</option>
          {agents.map(a => <option key={a} value={a}>{AGENT_LABEL[a] || a}</option>)}
        </select>
        <select value={vertF} onChange={e=>{setVertF(e.target.value);setPage(0)}}
          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none">
          <option value="all">All verticals</option>
          {verticals.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(0)}}
          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none">
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="no_images">No images</option>
          <option value="no_prompt">No prompt</option>
        </select>
        <select value={truncF} onChange={e=>{setTruncF(e.target.value);setPage(0)}}
          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none">
          <option value="all">All outputs</option>
          <option value="truncated">Truncated (≥499 tok)</option>
          <option value="not_truncated">Not truncated</option>
        </select>
        <div className="flex items-center gap-1 border border-slate-200 rounded-lg bg-white px-2 py-1">
          <span className="text-[10px] text-slate-400 whitespace-nowrap">Out tok:</span>
          <input value={outTokMin} onChange={e=>{setOutTokMin(e.target.value);setPage(0)}}
            placeholder="min" type="number" min="0"
            className="w-14 text-xs px-1 focus:outline-none text-slate-700" />
          <span className="text-slate-300">–</span>
          <input value={outTokMax} onChange={e=>{setOutTokMax(e.target.value);setPage(0)}}
            placeholder="max" type="number" min="0"
            className="w-14 text-xs px-1 focus:outline-none text-slate-700" />
        </div>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}
          placeholder="Search incident ID or output..."
          className="flex-1 min-w-40 text-xs px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800 text-white">
              {['Agent','Sub-type','Vertical','Incident ID','Status','In Tok','Out Tok','Imgs','Output Preview',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageSlice.map((r, i) => {
              const c = COLOR[r.agent_type] || COLOR.match;
              const isExpanded = expanded === `${r.incident_id}-${r.agent_type}-${r.sub_type}`;
              const key = `${r.incident_id}-${r.agent_type}-${r.sub_type}-${i}`;
              return (
                <>
                  <tr key={key} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.badge}`}>{AGENT_LABEL[r.agent_type] || r.agent_type}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.sub_type || '—'}</td>
                    <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.vertical}</td>
                    <td className="px-3 py-2 font-mono text-slate-500 text-[10px]">{r.incident_id?.slice(0,18)}…</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        r.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">{r.prompt_tokens > 0 ? fmt(r.prompt_tokens) : '—'}</td>
                    <td className="px-3 py-2 font-mono">
                      <span className={r.output_tokens >= 499 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                        {r.output_tokens > 0 ? fmt(r.output_tokens) : '—'}
                      </span>
                      {r.output_tokens >= 499 && <span className="ml-1 text-[9px] text-rose-500 font-semibold">TRUNC</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.image_count || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-xs truncate">{r.output_snippet || '—'}</td>
                    <td className="px-3 py-2">
                      {r.output_snippet && (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : `${r.incident_id}-${r.agent_type}-${r.sub_type}`)}
                          className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                        >
                          {isExpanded ? 'collapse' : 'expand'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={key+'-exp'} className="bg-slate-900">
                      <td colSpan={10} className="px-4 py-3">
                        <pre className="text-[11px] text-emerald-300 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                          {r.output_snippet}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400">No results match filter</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">← Prev</button>
          <span>Page {page+1} of {totalPages} ({filtered.length} results)</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1}
            className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">Next →</button>
        </div>
      )}
    </div>
  );
}

// ── GEPA Breakdown (per sub-agent, from simulation stats endpoint) ─────────
const INCIDENT_GROUP = {
  match:    { label: 'Misshipment',  bg: 'bg-emerald-900', text: 'text-emerald-100' },
  mismatch: { label: 'Misshipment',  bg: 'bg-emerald-900', text: 'text-emerald-100' },
  damage:   { label: 'Damage',       bg: 'bg-amber-800',   text: 'text-amber-100' },
  missing:  { label: 'Missing',      bg: 'bg-violet-900',  text: 'text-violet-100' },
};

const SUB_LABELS = {
  null:                       '—',
  'functional_damage':        'Functional Damage',
  'non_functional_damage':    'Non-functional Damage',
  'no_damage':                'No Damage',
  'missing_essential_part':   'Missing Essential Part',
  'missing_supplementary_item': 'Missing Supplementary Item',
  'product_complete':         'Product Complete',
};

function GepaBreakdown() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  function load() {
    api.getTokenSimulationStats()
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading simulation stats...</div>;

  const hasSim = stats?.status === 'ready' && stats.stats?.length > 0;

  // Order: match, mismatch, damage sub-agents, missing sub-agents
  const ORDER = [
    ['match', null],
    ['mismatch', null],
    ['damage', 'functional_damage'],
    ['damage', 'non_functional_damage'],
    ['damage', 'no_damage'],
    ['missing', 'missing_essential_part'],
    ['missing', 'missing_supplementary_item'],
    ['missing', 'product_complete'],
  ];

  // Compute incident-level costs (sum of sub-agents for each incident type)
  const incidentCostMap = {};
  if (hasSim) {
    const byKey = {};
    for (const s of stats.stats) {
      byKey[`${s.agent_type}||${s.sub_type||''}`] = s;
    }
    for (const [incType, agents] of Object.entries(INCIDENT_PIPELINE)) {
      let cost = 0;
      for (const at of agents) {
        // find sub-agents that belong to this agent type
        const matching = stats.stats.filter(s => s.agent_type === at);
        if (matching.length === 0) continue;
        const avgCost = matching.reduce((sum, s) => {
          return sum + (s.avg_input_tokens / 1000) * GEPA.input_lt_200k + (s.avg_output_tokens / 1000) * GEPA.output;
        }, 0) / matching.length;
        cost += avgCost;
      }
      incidentCostMap[incType] = cost;
    }
  }

  return (
    <div className="space-y-4">
      {/* Pricing reference */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2">Gemini 2.5 Flash — GEPA Pricing</p>
        <div className="grid grid-cols-4 gap-3 text-sm">
          {[
            ['Input ≤200K ctx', '$0.10 / 1M tok'],
            ['Input >200K ctx', '$0.40 / 1M tok'],
            ['Output',          '$0.40 / 1M tok'],
            ['Per image',       '~265 tok equiv'],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col bg-white rounded-lg px-3 py-2 border border-blue-100">
              <span className="text-[10px] text-blue-500 uppercase tracking-wide font-semibold">{k}</span>
              <span className="text-blue-900 font-bold font-mono text-xs mt-0.5">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {!hasSim && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-amber-800 font-semibold text-sm">Simulation data not yet available</p>
          <p className="text-amber-600 text-xs mt-1">Run <code className="bg-amber-100 px-1 rounded">python3 scripts/token_simulation.py</code> — this table will populate automatically.</p>
        </div>
      )}

      {hasSim && (() => {
        // build a lookup from sim stats
        const simLookup = {};
        for (const s of stats.stats) simLookup[`${s.agent_type}||${s.sub_type||''}`] = s;

        return (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide">Incident Type</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide">Sub-Agent</th>
                  <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide">Sub-type</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide">N calls</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Avg img tok</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Avg prompt tok</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Avg input tok</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Min input</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Max input</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Avg output</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Min output</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Max output</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Cost/call</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Cost/1K</th>
                  <th className="px-3 py-3 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Cost/10K</th>
                </tr>
              </thead>
              <tbody>
                {ORDER.map(([at, sub], idx) => {
                  const key = `${at}||${sub||''}`;
                  const s = simLookup[key];
                  const c = COLOR[at];
                  const grp = INCIDENT_GROUP[at];
                  const costCall = s
                    ? (s.avg_input_tokens / 1000) * GEPA.input_lt_200k + (s.avg_output_tokens / 1000) * GEPA.output
                    : null;
                  return (
                    <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${grp.bg} ${grp.text}`}>{grp.label}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.badge}`}>{AGENT_LABEL[at]}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{SUB_LABELS[sub] || sub || '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">{s ? fmt(s.n) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{s ? fmt(s.avg_img_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{s ? fmt(s.avg_prompt_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{s ? fmt(s.avg_input_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">{s ? fmt(s.min_input_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">{s ? fmt(s.max_input_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">{s ? fmt(s.avg_output_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">{s ? fmt(s.min_output_tokens) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-500">{s ? fmt(s.max_output_tokens) : '—'}</td>
                      <td className={`px-3 py-2.5 text-right font-bold font-mono ${c.text}`}>{costCall != null ? fmtUSD(costCall) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{costCall != null ? fmtUSD(costCall * 1000, 2) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{costCall != null ? fmtUSD(costCall * 10000, 2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Per-incident-type total rows */}
      {hasSim && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide" colSpan={2}>Incident Type Total (sum of sub-agents)</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide">Cost/incident</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide">Cost/1K incidents</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide">Cost/10K incidents</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Misshipment (Match + Mismatch)',      key: 'misshipment', bg: 'bg-emerald-800 text-white' },
                { label: 'Damage (3× Damage sub-agents)',       key: 'damage',      bg: 'bg-amber-700 text-white' },
                { label: 'Missing (3× Missing sub-agents)',     key: 'missing',     bg: 'bg-violet-800 text-white' },
              ].map(({ label, key, bg }) => {
                // Sum cost of all sub-agents in this incident type from real sim data
                const agentsInType = INCIDENT_PIPELINE[key];
                const simLookup = {};
                for (const s of stats.stats) simLookup[`${s.agent_type}||${s.sub_type||''}`] = s;
                let totalCost = 0;
                let found = false;
                for (const at of agentsInType) {
                  const subRows = ORDER.filter(([oat]) => oat === at);
                  for (const [, sub] of subRows) {
                    const s = simLookup[`${at}||${sub||''}`];
                    if (s) { totalCost += (s.avg_input_tokens / 1000) * GEPA.input_lt_200k + (s.avg_output_tokens / 1000) * GEPA.output; found = true; }
                  }
                }
                return (
                  <tr key={key} className={bg}>
                    <td className="px-3 py-2.5 font-bold" colSpan={2}>{label}</td>
                    <td className="px-3 py-2.5 text-right font-bold font-mono">{found ? fmtUSD(totalCost) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{found ? fmtUSD(totalCost * 1000, 2) : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{found ? fmtUSD(totalCost * 10000, 2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {hasSim
            ? `* Based on ${fmt(stats.success)} successful simulation calls (${fmt(stats.total)} unique incidents deduplicated). Image tokens at 265 tok/image.`
            : '* Simulation pending — values will populate once the simulation script completes.'}
        </p>
        <button onClick={load} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600">↻ Refresh</button>
      </div>
    </div>
  );
}

// ── Token Charts ───────────────────────────────────────────────────────────
const SUB_COLORS = {
  'match||':                            '#10b981',
  'mismatch||':                         '#f43f5e',
  'damage||functional_damage':          '#f59e0b',
  'damage||non_functional_damage':      '#ef4444',
  'damage||no_damage':                  '#84cc16',
  'missing||missing_essential_part':    '#8b5cf6',
  'missing||missing_supplementary_item':'#a78bfa',
  'missing||product_complete':          '#c4b5fd',
};

const SUB_SHORT = {
  'match||':                            'Match',
  'mismatch||':                         'Mismatch',
  'damage||functional_damage':          'Func. Damage',
  'damage||non_functional_damage':      'Non-func. Damage',
  'damage||no_damage':                  'No Damage',
  'missing||missing_essential_part':    'Missing Essential',
  'missing||missing_supplementary_item':'Missing Supp.',
  'missing||product_complete':          'Product Complete',
};

function subKey(a, s) { return `${a}||${s || ''}`; }
function subLabel(a, s) { return SUB_SHORT[subKey(a, s)] || s || a; }

function TokenCharts() {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState('scatter'); // scatter | bar
  const [subFilter, setSubFilter] = useState('all');

  function load() {
    api.getTokenSimulationChartData()
      .then(d => { setChartData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-48 text-slate-400 text-sm">Loading chart data...</div>;
  if (!chartData || chartData.status === 'pending') return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
      <p className="text-amber-800 font-semibold text-sm">No simulation data yet</p>
      <p className="text-amber-600 text-xs mt-1">Run the simulation to generate chart data.</p>
    </div>
  );

  const allPoints = chartData.points || [];
  const subKeys   = [...new Set(allPoints.map(p => subKey(p.a, p.s)))].sort();

  const points = subFilter === 'all' ? allPoints : allPoints.filter(p => subKey(p.a, p.s) === subFilter);

  const p99 = arr => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(Math.floor(sorted.length * 0.99), sorted.length - 1)];
  };

  // Group by sub-agent for the bar chart — compute min/avg/p99/max for input & output
  const barData = subKeys.map(sk => {
    const group = allPoints.filter(p => subKey(p.a, p.s) === sk);
    if (!group.length) return null;
    const avgArr = arr => Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    const iArr = group.map(p => p.i), oArr = group.map(p => p.o);
    const truncated = oArr.filter(o => o >= 499).length;
    const [at, sub] = sk.split('||');
    return {
      name: subLabel(at, sub || null),
      sk,
      n:            group.length,
      avgIn:        avgArr(iArr),
      minIn:        Math.min(...iArr),
      p99In:        p99(iArr),
      maxIn:        Math.max(...iArr),
      avgOut:       avgArr(oArr),
      minOut:       Math.min(...oArr),
      p99Out:       p99(oArr),
      maxOut:       Math.max(...oArr),
      truncated,
      truncatedPct: Math.round(truncated / oArr.length * 100),
    };
  }).filter(Boolean);

  // For scatter: group points by sub-agent (recharts ScatterChart needs separate <Scatter> per series)
  const scatterSeries = subKeys.map(sk => ({
    sk,
    color: SUB_COLORS[sk] || '#94a3b8',
    label: subLabel(...sk.split('||')),
    data:  allPoints.filter(p => subKey(p.a, p.s) === sk).map(p => ({ x: p.i, y: p.o, v: p.v, t: p.o >= 499 })),
  }));
  const activeSeries = subFilter === 'all' ? scatterSeries : scatterSeries.filter(s => s.sk === subFilter);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {[['scatter','Scatter (per incident)'],['bar','Range Bar (per sub-agent)']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <select value={subFilter} onChange={e => setSubFilter(e.target.value)}
          className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none">
          <option value="all">All sub-agents</option>
          {subKeys.map(sk => {
            const [at, sub] = sk.split('||');
            return <option key={sk} value={sk}>{subLabel(at, sub || null)}</option>;
          })}
        </select>
        <span className="text-xs text-slate-400 ml-auto">{points.length.toLocaleString()} incidents</span>
        <button onClick={load} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600">↻ Refresh</button>
      </div>

      {/* Scatter view */}
      {view === 'scatter' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Each dot = one incident. X = total input tokens (prompt + images). Y = output tokens.</p>
          <div className="bg-white border border-slate-200 rounded-xl p-4" style={{ height: 480 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="x" type="number" name="Input tokens"
                  label={{ value: 'Input tokens (prompt + images)', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#94a3b8' }}
                  tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                <YAxis dataKey="y" type="number" name="Output tokens"
                  label={{ value: 'Output tokens', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#94a3b8' }}
                  tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow text-xs">
                        <p className="font-semibold text-slate-700">{d?.v || ''}</p>
                        <p className="text-slate-500">Input: <span className="font-mono font-bold text-slate-800">{d?.x?.toLocaleString()}</span> tok</p>
                        <p className="text-slate-500">Output: <span className="font-mono font-bold text-slate-800">{d?.y?.toLocaleString()}</span> tok</p>
                        {d?.t && <p className="text-rose-600 font-semibold mt-1">⚠ Hit 500-tok limit — likely truncated</p>}
                      </div>
                    );
                  }}
                />
                <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                {activeSeries.map(s => (
                  <Scatter key={s.sk} name={s.label} data={s.data} fill={s.color} fillOpacity={0.5} r={3} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bar view */}
      {view === 'bar' && (
        <div className="space-y-5">
          {/* Sub-agent color legend */}
          <div className="flex flex-wrap gap-3">
            {barData.map(d => (
              <div key={d.sk} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: SUB_COLORS[d.sk] }} />
                <span className="text-xs text-slate-600">{d.name}</span>
              </div>
            ))}
          </div>

          {/* Input token ranges */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Input Tokens per Sub-agent (min / avg / max)</p>
            <div className="bg-white border border-slate-200 rounded-xl p-4" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 60, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} />
                  <Tooltip formatter={(v, name) => [v.toLocaleString() + ' tok', name]} contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="minIn" name="Min input" fill="#bae6fd" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={`${SUB_COLORS[d.sk]}44`} />)}
                  </Bar>
                  <Bar dataKey="avgIn" name="Avg input" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={SUB_COLORS[d.sk] || '#94a3b8'} />)}
                    <LabelList dataKey="avgIn" position="top" formatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v} style={{ fontSize: 9, fill: '#475569' }} />
                  </Bar>
                  <Bar dataKey="maxIn" name="Max input" fill="#e2e8f0" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={`${SUB_COLORS[d.sk]}88`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Output token ranges */}
          <div>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Output Tokens per Sub-agent (min / avg / p99 / max)</p>
            <div className="bg-white border border-slate-200 rounded-xl p-4" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 60, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip formatter={(v, name) => [v.toLocaleString() + ' tok', name]} contentStyle={{ fontSize: 11 }} />
<Bar dataKey="minOut" name="Min output" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={`${SUB_COLORS[d.sk]}44`} />)}
                  </Bar>
                  <Bar dataKey="avgOut" name="Avg output" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={SUB_COLORS[d.sk] || '#94a3b8'} />)}
                    <LabelList dataKey="avgOut" position="top" style={{ fontSize: 9, fill: '#475569' }} />
                  </Bar>
                  <Bar dataKey="p99Out" name="p99 output" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={`${SUB_COLORS[d.sk]}cc`} />)}
                  </Bar>
                  <Bar dataKey="maxOut" name="Max output" radius={[3,3,0,0]}>
                    {barData.map(d => <Cell key={d.sk} fill={`${SUB_COLORS[d.sk]}88`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Truncation warning */}
          {barData.some(d => d.truncatedPct > 0) && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <p className="text-xs font-bold text-rose-700 mb-1.5">⚠ Outputs hitting 500-token limit (potentially truncated)</p>
              <div className="flex flex-wrap gap-3">
                {barData.filter(d => d.truncatedPct > 0).map(d => (
                  <div key={d.sk} className="flex items-center gap-1.5 text-xs text-rose-600">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: SUB_COLORS[d.sk] }} />
                    <span className="font-medium">{d.name}:</span>
                    <span className="font-mono">{d.truncated.toLocaleString()} ({d.truncatedPct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample size note */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-800 text-white">
                {['Sub-agent','N','Avg input','Min input','p99 input','Max input','Avg output','Min output','p99 output','Max output','% truncated'].map(h =>
                  <th key={h} className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap">{h}</th>
                )}
              </tr></thead>
              <tbody>
                {barData.map((d, i) => (
                  <tr key={d.sk} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-3 py-2"><span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ background: SUB_COLORS[d.sk] }} />{d.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{d.n.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{d.avgIn.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{d.minIn.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-600 font-semibold">{d.p99In.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{d.maxIn.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-800">{d.avgOut.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{d.minOut.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-600 font-semibold">{d.p99Out.toLocaleString()}</td>
                    <td className="px-3 py-2 font-mono text-slate-500">{d.maxOut.toLocaleString()}</td>
                    <td className={`px-3 py-2 font-mono font-bold ${d.truncatedPct > 10 ? 'text-rose-600' : d.truncatedPct > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {d.truncatedPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TestTokenAnalysis() {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]     = useState('overview');
  const [agentFilter, setAgentFilter] = useState('all');

  useEffect(() => {
    api.getTokenAnalysisSummary().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading token analysis...</div>;
  if (!data) return <div className="flex items-center justify-center h-64 text-rose-400">Failed to load prompt data</div>;

  const { agent_stats, prompts, total_prompts } = data;
  const maxTokens = Math.max(...agent_stats.map(a => a.max));

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'prompts',  label: `Prompt Inventory (${total_prompts})` },
    { key: 'gepa',     label: 'GEPA Cost Breakdown' },
    { key: 'charts',   label: 'Token Charts' },
    { key: 'outputs',  label: 'Output Explorer' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-blue-500 rounded-full text-[10px] font-bold uppercase tracking-wide">Token Analysis</span>
              <span className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] font-medium text-slate-300">Binary Prompt Suite</span>
            </div>
            <h1 className="text-xl font-bold mt-2">Input / Output Token Range × GEPA</h1>
            <p className="text-slate-300 text-sm mt-1">
              Token sizing and cost estimation for the new binary sub-agent prompt suite across Match, Mismatch, Damage, and Missing agents.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-5 flex-wrap">
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Total Prompts</p>
            <p className="text-lg font-bold">{total_prompts}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Agent Types</p>
            <p className="text-lg font-bold">4</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Token Range (all prompts)</p>
            <p className="text-lg font-bold">{fmt(Math.min(...agent_stats.map(a => a.min)))}–{fmt(maxTokens)}</p>
          </div>
          <div className="bg-blue-500/20 border border-blue-400/30 rounded-xl px-4 py-2">
            <p className="text-[10px] text-blue-300">Per-call cost</p>
            <p className="text-xs text-blue-200 mt-0.5">See GEPA tab ↓</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {agent_stats.map(stat => (
              <AgentCard key={stat.agent_type} stat={stat} maxTokens={maxTokens} />
            ))}
          </div>

          {/* Prompt size note */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">Key Observations</p>
            <ul className="space-y-1.5 text-sm text-amber-900">
              <li>• <strong>Missing prompts are the heaviest</strong> — avg {fmt(agent_stats.find(a=>a.agent_type==='missing')?.avg)} tokens, up to {fmt(agent_stats.find(a=>a.agent_type==='missing')?.max)} — driven by detailed part enumeration per vertical.</li>
              <li>• <strong>Match prompts are the lightest</strong> — avg {fmt(agent_stats.find(a=>a.agent_type==='match')?.avg)} tokens — focused binary identity check, minimal context.</li>
              <li>• <strong>Mismatch prompts are uniform</strong> — range is narrow (~{fmt(agent_stats.find(a=>a.agent_type==='mismatch')?.min)}–{fmt(agent_stats.find(a=>a.agent_type==='mismatch')?.max)}) — consistent structure across verticals.</li>
              <li>• Simulation data pending — token counts above are prompt-only; actual input tokens will include image tokens + injected context.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Prompt inventory tab */}
      {tab === 'prompts' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            {['all', 'match', 'mismatch', 'damage', 'missing'].map(a => {
              const c = a !== 'all' ? COLOR[a] : null;
              return (
                <button
                  key={a}
                  onClick={() => setAgentFilter(a)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    agentFilter === a
                      ? (c ? `${c.badge} border-transparent` : 'bg-slate-800 text-white border-transparent')
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {a === 'all' ? 'All Agents' : AGENT_LABEL[a]}
                  {a !== 'all' && <span className="ml-1 opacity-60">({agent_stats.find(s=>s.agent_type===a)?.count})</span>}
                </button>
              );
            })}
          </div>
          <PromptTable prompts={prompts} agentFilter={agentFilter} />
        </div>
      )}

      {/* GEPA cost breakdown tab */}
      {tab === 'gepa' && <GepaBreakdown />}

      {/* Token Charts tab */}
      {tab === 'charts' && <TokenCharts />}

      {/* Output Explorer tab */}
      {tab === 'outputs' && <OutputExplorer />}

    </div>
  );
}
