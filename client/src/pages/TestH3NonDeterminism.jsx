import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

function ConsistencyBadge({ value }) {
  if (value == null) return null;
  const c = value >= 90 ? 'bg-emerald-100 text-emerald-700' :
            value >= 80 ? 'bg-amber-100 text-amber-700' :
            'bg-rose-100 text-rose-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{value}%</span>;
}

function ProgressBar({ pct }) {
  return (
    <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
      <div className="bg-amber-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function extractVerdict(raw) {
  if (!raw) return null;
  try {
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean.split('\n').filter(l => !l.trim().startsWith('```')).join('\n').trim();
    }
    const parsed = JSON.parse(clean);
    return parsed.decision || parsed.product_match || parsed.classification || null;
  } catch { return null; }
}

function OutputCompare({ incident_id, agent, rerun_raw, run_id }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getH3Detail({ incident_id, agent, run_id }).then(d => { setDetail(d); setLoading(false); }).catch(() => setLoading(false));
  }, [incident_id, agent, run_id]);

  if (loading) return <div className="text-xs text-slate-400 py-2">Loading AI outputs...</div>;

  const orig = detail?.original_raw || '—';
  const rerun = rerun_raw || detail?.rerun_raw || '—';
  const origVerdict = extractVerdict(orig);
  const rerunVerdict = extractVerdict(rerun);
  const verdictMatch = origVerdict && rerunVerdict && origVerdict === rerunVerdict;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-slate-600">Verdict Comparison:</span>
        <span className={`px-2 py-0.5 rounded font-medium ${verdictMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {origVerdict || '?'} {verdictMatch ? '=' : '≠'} {rerunVerdict || '?'}
        </span>
        {!verdictMatch && <span className="text-rose-500 text-[10px]">Decision flipped</span>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Original AI Output (at labelling)</p>
          <pre className="bg-slate-50 border rounded-lg p-3 text-[11px] text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">{orig}</pre>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Re-run AI Output (Run {run_id})</p>
          <pre className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">{rerun}</pre>
        </div>
      </div>
    </div>
  );
}

function PrecisionTable({ precision, precisionTab, setPrecisionTab }) {
  if (!precision || !Object.keys(precision).length) return null;
  const tabData = precision[precisionTab] || precision.overall || {};
  const tabs = [
    { key: 'overall', label: 'Overall' },
    { key: 'cx', label: 'CX Agent' },
    { key: 'obd', label: 'OBD Agent' },
  ];
  return (
    <div className="bg-white rounded-xl border p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-slate-800">Precision: Original vs Re-run</h3>
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setPrecisionTab(t.key)}
              className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                precisionTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">Of predictions for each class, how many match the human label?</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2 px-3 font-medium">Class</th>
              <th className="py-2 px-3 font-medium text-center">Original Predicted</th>
              <th className="py-2 px-3 font-medium text-center">Original Precision</th>
              <th className="py-2 px-3 font-medium text-center">Re-run Predicted</th>
              <th className="py-2 px-3 font-medium text-center">Re-run Precision</th>
              <th className="py-2 px-3 font-medium text-center">Delta</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(tabData)
              .sort((a, b) => b[1].original_predicted - a[1].original_predicted)
              .map(([cls, p]) => {
                const delta = p.rerun_precision - p.original_precision;
                const deltaColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-400';
                return (
                  <tr key={cls} className="border-b hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium text-slate-700">{cls}</td>
                    <td className="py-2 px-3 text-center text-slate-600">{p.original_predicted} <span className="text-slate-400 text-[10px]">({p.original_correct} correct)</span></td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.original_precision >= 80 ? 'bg-emerald-100 text-emerald-700' : p.original_precision >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {p.original_precision}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center text-slate-600">{p.rerun_predicted} <span className="text-slate-400 text-[10px]">({p.rerun_correct} correct)</span></td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${p.rerun_precision >= 80 ? 'bg-emerald-100 text-emerald-700' : p.rerun_precision >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                        {p.rerun_precision}%
                      </span>
                    </td>
                    <td className={`py-2 px-3 text-center text-xs font-bold ${deltaColor}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}pp
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Multi-Run Summary View ──────────────────────────────────────── */
function MultiRunSummary({ multi }) {
  const [precisionTab, setPrecisionTab] = useState('overall');
  const [patternFilter, setPatternFilter] = useState('all');

  if (!multi || multi.status === 'no_data') return null;

  const filteredPatterns = patternFilter === 'all'
    ? multi.pattern_rows
    : multi.pattern_rows.filter(r => r.category === patternFilter);

  return (
    <div className="space-y-6">
      {/* Per-Run Stats Table */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-bold text-slate-800 mb-4">Per-Run Consistency</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 px-3 font-medium">Run</th>
                <th className="py-2 px-3 font-medium text-center">Rows</th>
                <th className="py-2 px-3 font-medium text-center">Consistency</th>
                <th className="py-2 px-3 font-medium text-center">CX Agent</th>
                <th className="py-2 px-3 font-medium text-center">OBD Agent</th>
                <th className="py-2 px-3 font-medium text-center">Matches</th>
                <th className="py-2 px-3 font-medium text-center">Mismatches</th>
                <th className="py-2 px-3 font-medium text-center">Errors</th>
                <th className="py-2 px-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {multi.per_run.map(run => (
                <tr key={run.run_id} className="border-b hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium text-slate-700">Run {run.run_id}</td>
                  <td className="py-2 px-3 text-center text-slate-600">{run.total_rows}</td>
                  <td className="py-2 px-3 text-center"><ConsistencyBadge value={run.consistency_pct} /></td>
                  <td className="py-2 px-3 text-center"><ConsistencyBadge value={run.cx_consistency_pct} /></td>
                  <td className="py-2 px-3 text-center"><ConsistencyBadge value={run.obd_consistency_pct} /></td>
                  <td className="py-2 px-3 text-center text-emerald-600 font-medium">{run.matches}</td>
                  <td className="py-2 px-3 text-center text-rose-600 font-medium">{run.mismatches}</td>
                  <td className="py-2 px-3 text-center text-slate-400">{run.errors}</td>
                  <td className="py-2 px-3 text-center">
                    {run.is_complete
                      ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Complete</span>
                      : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">In Progress</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {multi.per_run.length > 1 && (() => {
          const consistencies = multi.per_run.filter(r => r.total_compared > 0).map(r => r.consistency_pct);
          const avg = (consistencies.reduce((a, b) => a + b, 0) / consistencies.length).toFixed(1);
          const min = Math.min(...consistencies).toFixed(1);
          const max = Math.max(...consistencies).toFixed(1);
          return (
            <div className="mt-4 flex gap-6 text-sm">
              <span className="text-slate-500">Across {consistencies.length} runs:</span>
              <span className="font-medium">Avg: <ConsistencyBadge value={parseFloat(avg)} /></span>
              <span className="text-slate-500">Min: {min}%</span>
              <span className="text-slate-500">Max: {max}%</span>
              <span className="text-slate-500">Range: {(max - min).toFixed(1)}pp</span>
            </div>
          );
        })()}
      </div>

      {/* Mismatch Pattern Analysis */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-800">Mismatch Pattern Analysis</h3>
          <span className="text-xs text-slate-400">{multi.pattern_total} incidents with at least 1 mismatch</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">Are the same incidents mismatching across runs, or different ones each time?</p>

        {/* Pattern Buckets */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { key: 'always', label: 'Always Mismatch', desc: 'Every run', color: 'rose' },
            { key: 'frequent', label: 'Frequent', desc: '≥70% of runs', color: 'orange' },
            { key: 'occasional', label: 'Occasional', desc: '30-70% of runs', color: 'amber' },
            { key: 'rare', label: 'Rare', desc: '<30% of runs', color: 'blue' },
            { key: 'never', label: 'Never Mismatch', desc: 'Consistent', color: 'emerald' },
          ].map(b => (
            <button key={b.key} onClick={() => setPatternFilter(patternFilter === b.key ? 'all' : b.key)}
              className={`border rounded-lg p-3 text-left transition-colors ${patternFilter === b.key ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}>
              <p className="text-xs font-medium text-slate-600">{b.label}</p>
              <p className={`text-2xl font-bold mt-1 text-${b.color}-600`}>{multi.pattern_buckets[b.key] || 0}</p>
              <p className="text-[10px] text-slate-400">{b.desc}</p>
            </button>
          ))}
        </div>

        {/* Pattern Detail Table */}
        {filteredPatterns.length > 0 && (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 px-3 font-medium">Incident ID</th>
                  <th className="py-2 px-3 font-medium">Agent</th>
                  <th className="py-2 px-3 font-medium">Original</th>
                  <th className="py-2 px-3 font-medium">Human Label</th>
                  <th className="py-2 px-3 font-medium text-center">Mismatches</th>
                  <th className="py-2 px-3 font-medium text-center">Rate</th>
                  <th className="py-2 px-3 font-medium">Category</th>
                  <th className="py-2 px-3 font-medium">Re-run Decisions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatterns.slice(0, 100).map((r, i) => {
                  const catColor = { always: 'bg-rose-100 text-rose-700', frequent: 'bg-orange-100 text-orange-700',
                    occasional: 'bg-amber-100 text-amber-700', rare: 'bg-blue-100 text-blue-700' }[r.category] || 'bg-slate-100 text-slate-700';
                  const decisions = Object.entries(r.rerun_decisions || {}).map(([run, dec]) => dec);
                  const uniqueDecs = [...new Set(decisions)];
                  return (
                    <tr key={i} className="border-b hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-xs">{r.incident_id}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.agent === 'cx' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {r.agent?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs">{r.original_decision}</td>
                      <td className="py-2 px-3 text-xs text-slate-500">{r.human_label || '—'}</td>
                      <td className="py-2 px-3 text-center font-bold text-rose-600">{r.mismatch_count}/{r.run_count}</td>
                      <td className="py-2 px-3 text-center"><ConsistencyBadge value={100 - r.mismatch_rate} /></td>
                      <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${catColor}`}>{r.category}</span></td>
                      <td className="py-2 px-3 text-[10px] font-mono text-slate-500">{uniqueDecs.join(', ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aggregate Precision */}
      {multi.avg_precision && (
        <PrecisionTable precision={multi.avg_precision} precisionTab={precisionTab} setPrecisionTab={setPrecisionTab} />
      )}
    </div>
  );
}

/* ─── Inter-Run Analysis View ─────────────────────────────────────── */
function InterRunAnalysis() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [agentFilter, setAgentFilter] = useState('');
  const [precisionTab, setPrecisionTab] = useState('overall');

  useEffect(() => {
    api.getH3InterRun().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading inter-run analysis...</div>;
  if (!data || data.status !== 'ok') return <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400">No inter-run data available yet. Need at least 2 completed runs.</div>;

  const filtered = agentFilter
    ? data.inconsistent_rows.filter(r => r.agent === agentFilter)
    : data.inconsistent_rows;

  const runIds = data.run_ids || [];

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white">
        <h3 className="text-lg font-bold mb-1">Inter-Run Consistency</h3>
        <p className="text-violet-200 text-xs mb-4">Do re-runs agree with each other? Comparing decisions across {data.total_runs} runs (not vs original).</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-violet-200">Inter-Run Consistency</p>
            <p className="text-2xl font-bold">{data.inter_run_consistency_pct}%</p>
            <p className="text-[10px] text-violet-200">{data.consistent_count}/{data.total_pairs}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-violet-200">Always Same</p>
            <p className="text-2xl font-bold text-emerald-300">{data.consistent_count}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-violet-200">Runs Disagree</p>
            <p className="text-2xl font-bold text-rose-300">{data.inconsistent_count}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-violet-200">CX Agent</p>
            <p className="text-2xl font-bold">{data.per_agent?.cx?.consistency_pct || 0}%</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-violet-200">OBD Agent</p>
            <p className="text-2xl font-bold">{data.per_agent?.obd?.consistency_pct || 0}%</p>
          </div>
        </div>
      </div>

      {/* Per-Class Inter-Run Consistency */}
      {data.per_class && Object.keys(data.per_class).length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-bold text-slate-800 mb-4">Per-Class Inter-Run Consistency</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.per_class)
              .sort((a, b) => a[1].consistency_pct - b[1].consistency_pct)
              .map(([cls, s]) => (
                <div key={cls} className="border rounded-lg p-4">
                  <p className="text-sm font-medium text-slate-700">{cls}</p>
                  <div className="flex items-end gap-2 mt-1">
                    <ConsistencyBadge value={s.consistency_pct} />
                    <span className="text-[10px] text-slate-400">{s.consistent}/{s.total} same</span>
                  </div>
                  <p className="text-[10px] text-rose-500 mt-1">{s.inconsistent} disagree</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Per-Run Precision Table */}
      {data.per_run_precision && (
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-800">Per-Run Precision (Re-run vs Human Label)</h3>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {[{ key: 'overall', label: 'Overall' }, { key: 'cx', label: 'CX Agent' }, { key: 'obd', label: 'OBD Agent' }].map(t => (
                <button key={t.key} onClick={() => setPrecisionTab(t.key)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    precisionTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>{t.label}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-4">How precise is each run's re-run decision vs the human label?</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-2 px-3 font-medium">Run</th>
                  <th className="py-2 px-3 font-medium text-center">Correct</th>
                  <th className="py-2 px-3 font-medium text-center">Total</th>
                  <th className="py-2 px-3 font-medium text-center">Precision</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.per_run_precision)
                  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                  .map(([rid, p]) => {
                    const val = precisionTab === 'cx' ? p.cx : precisionTab === 'obd' ? p.obd : p.overall;
                    const n = precisionTab === 'cx' ? p.cx_n : precisionTab === 'obd' ? p.obd_n : p.overall_n;
                    const c = precisionTab === 'cx' ? p.cx_correct : precisionTab === 'obd' ? p.obd_correct : p.overall_correct;
                    return (
                      <tr key={rid} className="border-b hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-700">Run {rid}</td>
                        <td className="py-2 px-3 text-center text-emerald-600 font-medium">{c}</td>
                        <td className="py-2 px-3 text-center text-slate-500">{n}</td>
                        <td className="py-2 px-3 text-center"><ConsistencyBadge value={val} /></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {(() => {
              const vals = Object.values(data.per_run_precision).map(p =>
                precisionTab === 'cx' ? p.cx : precisionTab === 'obd' ? p.obd : p.overall
              ).filter(v => v > 0);
              if (vals.length < 2) return null;
              const avg = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
              const min = Math.min(...vals).toFixed(1);
              const max = Math.max(...vals).toFixed(1);
              return (
                <div className="mt-4 flex gap-6 text-sm">
                  <span className="text-slate-500">Across {vals.length} runs:</span>
                  <span className="font-medium">Avg: <ConsistencyBadge value={parseFloat(avg)} /></span>
                  <span className="text-slate-500">Min: {min}%</span>
                  <span className="text-slate-500">Max: {max}%</span>
                  <span className="text-slate-500">Range: {(max - min).toFixed(1)}pp</span>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Inconsistent Incidents Table */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-800">Incidents with Different Outputs Across Runs</h3>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-slate-400">{data.inconsistent_total} total</span>
            <select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">All Agents</option>
              <option value="cx">CX Agent</option>
              <option value="obd">OBD Agent</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-4">These incidents got different predictions in different re-runs.</p>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 px-2 font-medium w-8"></th>
                <th className="py-2 px-3 font-medium">Incident ID</th>
                <th className="py-2 px-3 font-medium">Agent</th>
                <th className="py-2 px-3 font-medium">Original</th>
                <th className="py-2 px-3 font-medium">Human Label</th>
                <th className="py-2 px-3 font-medium">Unique Outputs</th>
                <th className="py-2 px-3 font-medium text-center">Agreement</th>
                {runIds.map(rid => (
                  <th key={rid} className="py-2 px-2 font-medium text-center text-[10px]">R{rid}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 150).map((r, i) => {
                const rowKey = `${r.incident_id}-${r.agent}`;
                const isExpanded = expandedRow === rowKey;
                return (
                  <React.Fragment key={i}>
                    <tr className="border-b cursor-pointer hover:bg-slate-50 bg-rose-50/40"
                      onClick={() => setExpandedRow(isExpanded ? null : rowKey)}>
                      <td className="py-2 px-2 text-slate-400 text-xs">{isExpanded ? '▼' : '▶'}</td>
                      <td className="py-2 px-3 font-mono text-xs">{r.incident_id}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.agent === 'cx' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {r.agent?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs">{r.original_decision}</td>
                      <td className="py-2 px-3 text-xs text-slate-500">{r.human_label || '—'}</td>
                      <td className="py-2 px-3 text-xs">
                        {r.unique_decisions?.map((d, j) => (
                          <span key={j} className="inline-block mr-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">{d}</span>
                        ))}
                      </td>
                      <td className="py-2 px-3 text-center"><ConsistencyBadge value={r.agreement_pct} /></td>
                      {runIds.map(rid => {
                        const dec = r.decisions?.[`run_${rid}`];
                        const isMajority = dec === r.majority_decision;
                        return (
                          <td key={rid} className={`py-2 px-2 text-center text-[10px] font-mono ${dec ? (isMajority ? 'text-emerald-600' : 'text-rose-600 font-bold') : 'text-slate-300'}`}>
                            {dec ? dec.replace('Misshipment', 'Mis').replace('No Issue', 'NI').replace("Can't Say", 'CS').replace('Multiple Issue', 'MI').replace('Quality Issue', 'QI').replace('Major Damage', 'MD').replace('Minor Damage', 'mD').replace('Major Missing', 'MM').replace('Minor Missing', 'mM').replace('Expiry Issue', 'EI') : '—'}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <tr className="border-b">
                        <td colSpan={7 + runIds.length} className="bg-slate-50/50 p-4">
                          <div className="space-y-4">
                            {/* Images */}
                            {r.images && r.images.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Input Images</p>
                                <div className="flex gap-3 overflow-x-auto">
                                  {r.images.map((url, j) => (
                                    <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                                      <img src={url} alt={`Image ${j + 1}`}
                                        className="h-32 w-auto rounded-lg border shadow-sm hover:shadow-md transition-shadow object-contain bg-white"
                                        onError={e => { e.target.style.display = 'none'; }} />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Decision details */}
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Per-Run Decisions</p>
                              <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                                {runIds.map(rid => {
                                  const dec = r.decisions?.[`run_${rid}`];
                                  const matchesHuman = dec === r.human_label;
                                  const isMajority = dec === r.majority_decision;
                                  return (
                                    <div key={rid} className={`border rounded-lg p-2 text-center ${matchesHuman ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                                      <p className="text-[10px] text-slate-400">Run {rid}</p>
                                      <p className={`text-xs font-bold mt-0.5 ${matchesHuman ? 'text-emerald-700' : 'text-rose-700'}`}>{dec || '—'}</p>
                                      {!isMajority && dec && <p className="text-[8px] text-rose-500 mt-0.5">outlier</p>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex gap-6 text-xs text-slate-500">
                              <span>Original: <strong className="text-slate-700">{r.original_decision}</strong></span>
                              <span>Human Label: <strong className="text-slate-700">{r.human_label || '—'}</strong></span>
                              <span>Majority: <strong className="text-slate-700">{r.majority_decision}</strong></span>
                              <span>Agreement: <strong className="text-slate-700">{r.agreement_pct}%</strong></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Single Run View ─────────────────────────────────────────────── */
function SingleRunView({ runId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [agent, setAgent] = useState('');
  const [matchFilter, setMatchFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);
  const [precisionTab, setPrecisionTab] = useState('overall');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.getH3Summary({ run_id: runId });
      setSummary(data);
      if (data.is_complete) setAutoRefresh(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [runId]);

  const fetchTable = useCallback(async () => {
    setTableLoading(true);
    try {
      const data = await api.getH3Data({ run_id: runId, agent, match_filter: matchFilter, search, page, limit: 25 });
      setTableData(data);
    } catch (e) { console.error(e); }
    finally { setTableLoading(false); }
  }, [runId, agent, matchFilter, search, page]);

  useEffect(() => { setLoading(true); fetchSummary(); }, [fetchSummary]);
  useEffect(() => { if (summary && summary.status !== 'no_data') fetchTable(); }, [fetchTable, summary]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchSummary, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchSummary]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading Run {runId}...</div>;
  if (!summary || summary.status === 'no_data') {
    return <div className="bg-slate-50 rounded-xl p-8 text-center text-slate-400">No data for Run {runId} yet.</div>;
  }

  const s = summary;
  const consistencyColor = s.consistency_pct >= 90 ? 'emerald' : s.consistency_pct >= 80 ? 'amber' : 'rose';

  return (
    <div className="space-y-6">
      {/* Hero Stats */}
      <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-yellow-600 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold">Run {runId} Results</h3>
          <div className="text-right">
            {!s.is_complete ? (
              <div>
                <span className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/30 rounded-full text-sm">
                  <span className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse" />
                  {s.progress_pct}%
                </span>
                <ProgressBar pct={s.progress_pct} />
                <p className="text-[11px] text-amber-200 mt-1">{s.total_rows} / {s.total_target} rows</p>
              </div>
            ) : (
              <span className="text-xs bg-white/20 px-3 py-1 rounded-full">Complete</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">Consistency</p>
            <p className="text-2xl font-bold">{s.consistency_pct}%</p>
            <p className="text-[10px] text-amber-200">{s.matches}/{s.total_compared}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">Mismatches</p>
            <p className="text-2xl font-bold">{s.mismatches}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">CX Agent</p>
            <p className="text-2xl font-bold">{s.cx_consistency_pct}%</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">OBD Agent</p>
            <p className="text-2xl font-bold">{s.obd_consistency_pct}%</p>
          </div>
        </div>
      </div>

      {/* Assessment + Per-class */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`rounded-xl border p-6 ${consistencyColor === 'emerald' ? 'bg-emerald-50 border-emerald-200' : consistencyColor === 'amber' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
          <h3 className="font-bold text-slate-800 mb-3">Assessment</h3>
          <div className="text-sm space-y-2">
            {s.consistency_pct >= 95 ? (
              <p className="text-emerald-700 font-medium">Non-determinism NOT significant (&gt;95%)</p>
            ) : s.consistency_pct >= 85 ? (
              <p className="text-amber-700 font-medium">Moderate non-determinism (85-95%)</p>
            ) : (
              <p className="text-rose-700 font-medium">Significant non-determinism — H3 VALIDATED (&lt;85%)</p>
            )}
            {s.impact && (
              <div className="mt-2 space-y-1 text-slate-600 text-xs">
                <p className="text-rose-600">↓ {s.impact.degraded} degraded</p>
                <p className="text-emerald-600">↑ {s.impact.improved} improved</p>
                <p className="text-slate-500">↔ {s.impact.lateral} lateral</p>
              </div>
            )}
          </div>
        </div>

        {s.per_class && Object.keys(s.per_class).length > 0 && (
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-bold text-slate-800 mb-3">Per-Class Consistency</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(s.per_class)
                .sort((a, b) => a[1].consistency - b[1].consistency)
                .map(([cls, stats]) => (
                  <div key={cls} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-600 truncate" title={cls}>{cls}</span>
                    <ConsistencyBadge value={stats.consistency} />
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Precision */}
      <PrecisionTable precision={s.precision} precisionTab={precisionTab} setPrecisionTab={setPrecisionTab} />

      {/* Flip Directions */}
      {s.flip_directions && Object.keys(s.flip_directions).length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-bold text-slate-800 mb-4">Flip Directions</h3>
          <div className="space-y-2">
            {Object.entries(s.flip_directions).map(([dir, count]) => {
              const maxCount = Math.max(...Object.values(s.flip_directions));
              const pct = (count / maxCount) * 100;
              return (
                <div key={dir} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-64 shrink-0 font-mono">{dir}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                    <div className="bg-rose-400 h-5 rounded-full flex items-center justify-end pr-2 text-[10px] text-white font-bold" style={{ width: `${Math.max(pct, 15)}%` }}>
                      {count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800">All Results — Run {runId}</h3>
          <div className="flex gap-2">
            <select value={agent} onChange={e => { setAgent(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">All Agents</option>
              <option value="cx">CX Agent</option>
              <option value="obd">OBD Agent</option>
            </select>
            <select value={matchFilter} onChange={e => { setMatchFilter(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">All Results</option>
              <option value="match">Matches Only</option>
              <option value="mismatch">Mismatches Only</option>
              <option value="error">Errors Only</option>
            </select>
            <input type="text" placeholder="Search incident ID..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-1.5 text-sm w-48" />
          </div>
        </div>

        {tableLoading ? (
          <div className="text-center py-8 text-slate-400">Loading...</div>
        ) : tableData && tableData.rows ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="py-2 px-3 font-medium">Incident ID</th>
                    <th className="py-2 px-3 font-medium">Agent</th>
                    <th className="py-2 px-3 font-medium">Original</th>
                    <th className="py-2 px-3 font-medium">Re-run</th>
                    <th className="py-2 px-3 font-medium">Human Label</th>
                    <th className="py-2 px-3 font-medium">Match</th>
                    <th className="py-2 px-3 font-medium">Images</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((r, i) => {
                    const rowKey = `${r.incident_id}-${r.agent}`;
                    const isExpanded = expandedRow === rowKey;
                    const rowBg = r.match === true ? 'bg-emerald-50/60' : r.match === false ? 'bg-rose-50/60' : '';
                    return (
                      <React.Fragment key={i}>
                        <tr className={`border-b cursor-pointer hover:bg-slate-100 ${rowBg}`}
                          onClick={() => setExpandedRow(isExpanded ? null : rowKey)}>
                          <td className="py-2 px-3 font-mono text-xs">
                            <span className="mr-1 text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                            {r.incident_id}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.agent === 'cx' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                              {r.agent?.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-xs">{r.original_decision}</td>
                          <td className="py-2 px-3 text-xs">{r.rerun_decision || '—'}</td>
                          <td className="py-2 px-3 text-xs text-slate-500">{r.human_label || '—'}</td>
                          <td className="py-2 px-3">
                            {r.match === true && <span className="inline-block w-5 h-5 leading-5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-600 text-center">✓</span>}
                            {r.match === false && <span className="inline-block w-5 h-5 leading-5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-600 text-center">✗</span>}
                            {r.match == null && <span className="text-xs text-slate-400">—</span>}
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-400">{r.image_count}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b">
                            <td colSpan={7} className="bg-slate-50/50">
                              <OutputCompare incident_id={r.incident_id} agent={r.agent} rerun_raw={r.rerun_raw} run_id={runId} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tableData.pages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-slate-400">{tableData.total} results</p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-30">Prev</button>
                  <span className="px-3 py-1 text-sm text-slate-500">{page} / {tableData.pages}</span>
                  <button onClick={() => setPage(p => Math.min(tableData.pages, p + 1))} disabled={page >= tableData.pages}
                    className="px-3 py-1 text-sm border rounded disabled:opacity-30">Next</button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────── */
export default function TestH3NonDeterminism() {
  const [multi, setMulti] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    api.getH3MultiSummary()
      .then(d => { setMulti(d); setLoading(false); })
      .catch(() => {
        api.getH3Summary().then(d => {
          setMulti({ status: 'ok', total_runs: 1, run_ids: [1], per_run: [{ run_id: 1, ...d }], pattern_buckets: {}, pattern_rows: [], avg_precision: d.precision });
          setLoading(false);
        }).catch(() => setLoading(false));
      });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading H3 results...</div>;
  if (!multi || multi.status === 'no_data') {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center">
        <div className="bg-amber-50 rounded-2xl p-12">
          <h2 className="text-2xl font-bold text-amber-800">H3: Non-Determinism Test</h2>
          <p className="text-amber-600 mt-3">No results yet.</p>
          <p className="text-sm text-amber-500 mt-2">Run: <code className="bg-amber-100 px-2 py-1 rounded">python3 scripts/h3_rerun_validation.py --ids-file /tmp/gemini25_matched_ids.txt --run-id 1</code></p>
        </div>
      </div>
    );
  }

  const runIds = multi.run_ids || [1];
  const tabs = [
    { key: 'summary', label: `Summary (${multi.total_runs} runs)` },
    { key: 'inter_run', label: 'Inter-Run Analysis' },
    ...runIds.map(id => ({ key: `run_${id}`, label: `Run ${id}` })),
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-yellow-600 rounded-2xl p-8 text-white">
        <h1 className="text-2xl font-bold">H3: Non-Determinism Test</h1>
        <p className="text-amber-100 mt-1 text-sm max-w-xl">
          Same data × same Gemini 2.5 Flash model → same output? {multi.total_runs} re-run(s) on 787 Sari Misshipment incidents.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">Total Runs</p>
            <p className="text-2xl font-bold">{multi.total_runs}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">Avg Consistency</p>
            <p className="text-2xl font-bold">
              {multi.per_run.length > 0
                ? (multi.per_run.reduce((a, r) => a + (r.consistency_pct || 0), 0) / multi.per_run.length).toFixed(1)
                : '—'}%
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">Always Mismatch</p>
            <p className="text-2xl font-bold">{multi.pattern_buckets?.always || 0}</p>
            <p className="text-[10px] text-amber-200">incidents</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-amber-200">Never Mismatch</p>
            <p className="text-2xl font-bold">{multi.pattern_buckets?.never || 0}</p>
            <p className="text-[10px] text-amber-200">incidents</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-slate-100 rounded-lg p-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors ${
              activeTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' ? (
        <MultiRunSummary multi={multi} />
      ) : activeTab === 'inter_run' ? (
        <InterRunAnalysis />
      ) : (
        <SingleRunView runId={parseInt(activeTab.replace('run_', ''))} />
      )}
    </div>
  );
}
