import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

function AccBadge({ value }) {
  const c = value >= 75 ? 'bg-emerald-100 text-emerald-700' :
            value >= 50 ? 'bg-amber-100 text-amber-700' :
            'bg-rose-100 text-rose-700';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${c}`}>{value}%</span>;
}

function MatchBadge({ val }) {
  return val === 1
    ? <span className="inline-block w-5 h-5 leading-5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-600 text-center">✓</span>
    : <span className="inline-block w-5 h-5 leading-5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-600 text-center">✗</span>;
}

function ConfusionMatrix({ data, model, agent }) {
  if (!data || !data[model] || !data[model][agent]) return null;
  const matrix = data[model][agent];

  const allLabels = new Set();
  Object.keys(matrix).forEach(k => {
    const [pred, human] = k.split('|');
    allLabels.add(pred);
    allLabels.add(human);
  });
  const labels = [...allLabels].sort();

  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]">
        <thead>
          <tr>
            <th className="px-2 py-1 text-slate-400 font-normal">Pred \ Human</th>
            {labels.map(l => <th key={l} className="px-2 py-1 text-slate-600 font-semibold max-w-[70px] truncate" title={l}>{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {labels.map(pred => (
            <tr key={pred}>
              <td className="px-2 py-1 font-semibold text-slate-600">{pred}</td>
              {labels.map(human => {
                const val = matrix[`${pred}|${human}`] || 0;
                const isDiag = pred === human;
                return (
                  <td key={human} className={`px-2 py-1 text-center font-mono ${isDiag ? 'bg-emerald-50 font-bold text-emerald-700' : val > 0 ? 'bg-rose-50 text-rose-600' : 'text-gray-300'}`}>
                    {val || '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TestSariMisshipment() {
  const [summary, setSummary] = useState(null);
  const [confusion, setConfusion] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data table state
  const [model, setModel] = useState('GEMINI_2_0');
  const [agent, setAgent] = useState('');
  const [subReason, setSubReason] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [tableData, setTableData] = useState(null);
  const [tableLoading, setTableLoading] = useState(false);

  // Confusion matrix view
  const [confAgent, setConfAgent] = useState('image_adjudication_cx_agent');

  useEffect(() => {
    Promise.all([api.getSariSummary(), api.getSariConfusion()])
      .then(([s, c]) => { setSummary(s); setConfusion(c); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fetchTable = useCallback(() => {
    setTableLoading(true);
    api.getSariData({ model, agent, sub_reason: subReason, search, page, limit: 25 })
      .then(setTableData)
      .catch(console.error)
      .finally(() => setTableLoading(false));
  }, [model, agent, subReason, search, page]);

  useEffect(() => { fetchTable(); }, [fetchTable]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const models = summary ? Object.keys(summary) : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-rose-600 to-pink-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Sari Misshipment — Model Comparison</h1>
        <p className="text-rose-100 text-sm mt-1">
          Gemini 2.0 vs 2.5 Flash accuracy on Sari vertical, MISSHIPMENT return reason — image agents (cx + obd)
        </p>
      </div>

      {/* Model comparison cards */}
      {summary && (
        <div className="grid md:grid-cols-2 gap-4">
          {models.map(m => {
            const s = summary[m];
            const label = m.replace('_', ' ').replace('GEMINI ', 'Gemini ').replace('0', '.0').replace('5', '.5');
            const isNew = m === 'GEMINI_2_5';
            return (
              <div key={m} className={`rounded-xl border-2 p-5 ${isNew ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-800">{label}</h2>
                  {isNew && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-700">CURRENT</span>}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-white/70 rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Total Rows</p>
                    <p className="text-lg font-bold text-slate-800">{s.total_rows.toLocaleString()}</p>
                  </div>
                  <div className="bg-white/70 rounded-lg border border-slate-200 p-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase">Unique Incidents</p>
                    <p className="text-lg font-bold text-slate-800">{s.unique_incidents.toLocaleString()}</p>
                  </div>
                </div>

                {/* Per-agent accuracy */}
                <div className="space-y-2">
                  {s.agents.map(a => (
                    <div key={a.agent} className="flex items-center justify-between bg-white/70 rounded-lg border border-slate-200 px-3 py-2">
                      <span className="text-xs font-medium text-slate-700 truncate mr-2">{a.agent.replace('image_adjudication_', '').replace('_agent', '')}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">{a.accepted}/{a.total}</span>
                        <AccBadge value={a.accuracy} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sub-reason breakdown */}
                <div className="mt-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">By Sub-Reason</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(s.sub_reasons).sort((a,b) => b[1]-a[1]).map(([r, c]) => (
                      <span key={r} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {r.replace('DIFFERENT_', '').replace('_RECEIVED', '').replace('_FROM_WEBSITE', '').toLowerCase()}: {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Predicted class distribution */}
                <div className="mt-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Predicted Classes</p>
                  <div className="flex gap-2">
                    {Object.entries(s.predicted_classes).sort((a,b) => b[1]-a[1]).map(([cls, cnt]) => {
                      const pct = Math.round(cnt / s.total_rows * 100);
                      const color = cls === 'Misshipment' ? 'bg-rose-100 text-rose-700' :
                                    cls === 'No Issue' ? 'bg-emerald-100 text-emerald-700' :
                                    'bg-amber-100 text-amber-700';
                      return (
                        <div key={cls} className={`rounded-lg px-2.5 py-1.5 ${color}`}>
                          <p className="text-[10px] font-bold">{cls}</p>
                          <p className="text-xs font-bold">{pct}% <span className="font-normal text-[10px] opacity-70">({cnt})</span></p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confusion Matrices */}
      {confusion && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Confusion Matrix</h2>
            <select
              value={confAgent}
              onChange={e => setConfAgent(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="image_adjudication_cx_agent">CX Agent</option>
              <option value="image_adjudication_obd_agent">OBD Agent</option>
            </select>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {models.map(m => (
              <div key={m}>
                <p className="text-xs font-semibold text-slate-500 mb-2">{m.replace('_', ' ')}</p>
                <ConfusionMatrix data={confusion} model={m} agent={confAgent} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Raw Data Explorer</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={model}
              onChange={e => { setModel(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {models.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
            <select
              value={agent}
              onChange={e => { setAgent(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Agents</option>
              <option value="image_adjudication_cx_agent">CX Agent</option>
              <option value="image_adjudication_obd_agent">OBD Agent</option>
            </select>
            <select
              value={subReason}
              onChange={e => { setSubReason(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Sub-Reasons</option>
              {summary && summary[model] && Object.keys(summary[model].sub_reasons).sort().map(r => (
                <option key={r} value={r}>{r.replace('DIFFERENT_', '').replace('_RECEIVED', '').replace('_FROM_WEBSITE', '')}</option>
              ))}
            </select>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search order/incident..."
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            />
            {tableData && <span className="text-xs text-slate-400 ml-auto">{tableData.total} rows</span>}
          </div>
        </div>

        {tableLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : tableData && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Order ID</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Agent</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Predicted</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Human Label</th>
                    <th className="px-3 py-2.5 text-center font-semibold text-slate-500">Match</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Sub-Reason</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((r, i) => (
                    <tr key={`${r.invocation_id}-${r.agent_name}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-3 py-2 font-mono text-slate-600 text-[11px]">{r.order_id}</td>
                      <td className="px-3 py-2 text-slate-700">{(r.agent_name || '').replace('image_adjudication_', '').replace('_agent', '')}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          r.agent_predicted_class === 'Misshipment' ? 'bg-rose-100 text-rose-700' :
                          r.agent_predicted_class === 'No Issue' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{r.agent_predicted_class}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          r.human_labelled_class === 'Misshipment' ? 'bg-rose-100 text-rose-700' :
                          r.human_labelled_class === 'No Issue' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{r.human_labelled_class}</span>
                      </td>
                      <td className="px-3 py-2 text-center"><MatchBadge val={r.is_accepted} /></td>
                      <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate" title={r.return_sub_reason}>
                        {(r.return_sub_reason || '').replace('DIFFERENT_', '').replace('_RECEIVED', '').replace('_FROM_WEBSITE', '')}
                      </td>
                      <td className="px-3 py-2 text-slate-400 max-w-[200px] truncate" title={r.feedback_data}>
                        {r.feedback_data && r.feedback_data !== '{}' ? r.feedback_data.replace(/[{}"]/g, '').slice(0, 80) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {tableData.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >Previous</button>
                <span className="text-xs text-slate-500">Page {tableData.page} of {tableData.pages}</span>
                <button
                  onClick={() => setPage(p => Math.min(tableData.pages, p + 1))}
                  disabled={page >= tableData.pages}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
