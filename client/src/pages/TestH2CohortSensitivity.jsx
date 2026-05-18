import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const VERTICALS = ['cases_covers', 'ethnic_set', 'jean', 'sari', 'shirt'];
const VERT_LABELS = {
  cases_covers: 'Cases & Covers', ethnic_set: 'Ethnic Set',
  jean: 'Jeans', sari: 'Sari', shirt: 'Shirt',
};
const DECISION_COLORS = {
  'Misshipment': 'bg-rose-100 text-rose-700',
  'No Issue': 'bg-emerald-100 text-emerald-700',
  "Can't Say": 'bg-amber-100 text-amber-700',
  'Multiple Issue': 'bg-violet-100 text-violet-700',
  'Minor Missing': 'bg-blue-100 text-blue-700',
  'Major Missing': 'bg-indigo-100 text-indigo-700',
  'Minor Damage': 'bg-orange-100 text-orange-700',
  'Major Damage': 'bg-red-100 text-red-700',
};

function DecisionPill({ value }) {
  if (!value) return <span className="text-slate-300">—</span>;
  const c = DECISION_COLORS[value] || 'bg-slate-100 text-slate-600';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${c}`}>{value}</span>;
}

function AgreeBar({ pct }) {
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 80 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-700 w-10 text-right">{pct}%</span>
    </div>
  );
}

function NetBadge({ net }) {
  if (net === 0) return <span className="text-slate-400 text-xs">—</span>;
  const color = net > 0 ? 'text-rose-600' : 'text-emerald-600';
  return <span className={`text-xs font-bold ${color}`}>{net > 0 ? '+' : ''}{net}</span>;
}

function DivergenceTable({ title, byVertical, flipMatrix, prodDist, pgDist }) {
  const [showFlips, setShowFlips] = useState(false);
  const totalMissDown = byVertical.reduce((s, v) => s + v.miss_downgrade, 0);
  const totalMissUp = byVertical.reduce((s, v) => s + v.miss_upgrade, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
        <button
          onClick={() => setShowFlips(s => !s)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {showFlips ? 'Show Vertical Summary' : 'Show Flip Matrix'}
        </button>
      </div>

      {!showFlips ? (
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Vertical</th>
                <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Cases</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600 min-w-[140px]">Agreement</th>
                <th className="px-4 py-2.5 text-center font-semibold text-rose-600">Prod=Miss → PG≠Miss</th>
                <th className="px-4 py-2.5 text-center font-semibold text-indigo-600">Prod≠Miss → PG=Miss</th>
                <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Net</th>
              </tr>
            </thead>
            <tbody>
              {byVertical.map(v => (
                <tr key={v.vertical} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{VERT_LABELS[v.vertical] || v.vertical}</td>
                  <td className="px-4 py-2.5 text-center text-slate-500">{v.n}</td>
                  <td className="px-4 py-2.5"><AgreeBar pct={v.agree_pct} /></td>
                  <td className="px-4 py-2.5 text-center font-semibold text-rose-600">{v.miss_downgrade}</td>
                  <td className="px-4 py-2.5 text-center font-semibold text-indigo-600">{v.miss_upgrade}</td>
                  <td className="px-4 py-2.5 text-center"><NetBadge net={v.net_miss} /></td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td className="px-4 py-2.5 text-slate-800">TOTAL</td>
                <td className="px-4 py-2.5 text-center text-slate-600">{byVertical.reduce((s,v) => s+v.n, 0)}</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 text-center text-rose-600">{totalMissDown}</td>
                <td className="px-4 py-2.5 text-center text-indigo-600">{totalMissUp}</td>
                <td className="px-4 py-2.5 text-center"><NetBadge net={totalMissUp - totalMissDown} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <p className="text-[11px] text-slate-500 mb-3">Top decision flips between Prod and PG (disagreements only)</p>
          <div className="space-y-1.5">
            {flipMatrix.slice(0, 12).map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <DecisionPill value={f.from} />
                <span className="text-slate-400 text-xs">→</span>
                <DecisionPill value={f.to} />
                <div className="flex-1 bg-slate-100 rounded-full h-1.5 mx-2">
                  <div
                    className="bg-indigo-400 h-1.5 rounded-full"
                    style={{ width: `${Math.min(f.count / flipMatrix[0].count * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-600 w-6 text-right">{f.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IncidentExplorer({ vertical, setVertical }) {
  const [page, setPage] = useState(1);
  const [divergeOnly, setDivergeOnly] = useState(true);
  const [agent, setAgent] = useState('both');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getH2Incidents({ vertical, diverge_only: divergeOnly, agent, page, page_size: 50 });
      setData(res);
    } catch { }
    setLoading(false);
  }, [vertical, divergeOnly, agent, page]);

  useEffect(() => { setPage(1); }, [vertical, divergeOnly, agent]);
  useEffect(() => { fetch(); }, [fetch]);

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <h3 className="font-bold text-slate-800 text-sm">Incident Explorer</h3>
        <select
          value={vertical}
          onChange={e => setVertical(e.target.value)}
          className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-700"
        >
          <option value="">All Verticals</option>
          {VERTICALS.map(v => <option key={v} value={v}>{VERT_LABELS[v]}</option>)}
        </select>
        <select
          value={agent}
          onChange={e => setAgent(e.target.value)}
          className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-700"
        >
          <option value="both">Both Agents</option>
          <option value="obd">OBD Only</option>
          <option value="cx">CX Only</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={divergeOnly} onChange={e => setDivergeOnly(e.target.checked)} className="rounded" />
          Divergences only
        </label>
        {data && <span className="text-xs text-slate-400 ml-auto">{data.total} rows</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Loading...</div>
      ) : data?.rows?.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Incident ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Vertical</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">OBD Prod</th>
                  <th className="px-3 py-2 text-center font-semibold text-indigo-600">OBD PG</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">CX Prod</th>
                  <th className="px-3 py-2 text-center font-semibold text-indigo-600">CX PG</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const obdDiff = r.obd_decision_prod !== r.obd_decision_pg;
                  const cxDiff = r.cx_decision_prod !== r.cx_decision_pg;
                  return (
                    <tr key={i} className={`border-t border-slate-100 hover:bg-slate-50 ${(obdDiff || cxDiff) ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{r.incident_id}</td>
                      <td className="px-3 py-2 text-slate-600">{VERT_LABELS[r.cms_vertical] || r.cms_vertical}</td>
                      <td className="px-3 py-2 text-center"><DecisionPill value={r.obd_decision_prod} /></td>
                      <td className={`px-3 py-2 text-center ${obdDiff ? 'bg-rose-50' : ''}`}><DecisionPill value={r.obd_decision_pg} /></td>
                      <td className="px-3 py-2 text-center"><DecisionPill value={r.cx_decision_prod} /></td>
                      <td className={`px-3 py-2 text-center ${cxDiff ? 'bg-rose-50' : ''}`}><DecisionPill value={r.cx_decision_pg} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >← Prev</button>
              <span className="text-xs text-slate-500">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >Next →</button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-24 text-slate-400 text-sm">No rows match the current filters.</div>
      )}
    </div>
  );
}

export default function TestH2CohortSensitivity() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [explorerVertical, setExplorerVertical] = useState('');

  useEffect(() => {
    api.getH2Summary()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64 text-slate-400">Loading H2 data...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64 text-rose-400">Failed to load data.</div>
      </div>
    );
  }

  const { overall, meta } = data;
  const tabs = [
    { key: 'summary', label: 'Divergence Summary' },
    { key: 'explorer', label: 'Incident Explorer' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">Hypothesis #2</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">Cohort Sensitivity</span>
            </div>
            <h1 className="text-xl font-bold">Prod vs PG Decision Divergence</h1>
            <p className="text-emerald-200 text-sm mt-1">
              {meta.date_range} · {meta.total_incidents.toLocaleString()} incidents · {meta.verticals.length} verticals · OBD + CX agents
            </p>
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200 uppercase tracking-wide">OBD Agreement</p>
            <p className="text-2xl font-bold">{overall.obd_agree_pct}%</p>
            <p className="text-[10px] text-emerald-300">{overall.obd_diverge} divergences</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200 uppercase tracking-wide">CX Agreement</p>
            <p className="text-2xl font-bold">{overall.cx_agree_pct}%</p>
            <p className="text-[10px] text-emerald-300">{overall.cx_diverge} divergences</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200 uppercase tracking-wide">OBD Net Miss (PG–Prod)</p>
            <p className={`text-2xl font-bold ${overall.obd_net_miss > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
              {overall.obd_net_miss > 0 ? '+' : ''}{overall.obd_net_miss}
            </p>
            <p className="text-[10px] text-emerald-300">↑{overall.obd_miss_upgrade} / ↓{overall.obd_miss_downgrade}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200 uppercase tracking-wide">CX Net Miss (PG–Prod)</p>
            <p className={`text-2xl font-bold ${overall.cx_net_miss > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
              {overall.cx_net_miss > 0 ? '+' : ''}{overall.cx_net_miss}
            </p>
            <p className="text-[10px] text-emerald-300">↑{overall.cx_miss_upgrade} / ↓{overall.cx_miss_downgrade}</p>
          </div>
        </div>

        {/* Key observations callout */}
        <div className="mt-4 bg-white/10 rounded-xl p-4 text-sm space-y-1">
          <p className="font-semibold text-white mb-1.5">Key Observations</p>
          <p className="text-emerald-100">
            · <strong>OBD:</strong> PG upgrades more incidents <em>to</em> Misshipment ({overall.obd_miss_upgrade}) than it downgrades ({overall.obd_miss_downgrade}) — net <strong>+{overall.obd_net_miss} Misshipments</strong> in PG vs Prod.
          </p>
          <p className="text-emerald-100">
            · <strong>CX:</strong> PG downgrades more incidents <em>from</em> Misshipment ({overall.cx_miss_downgrade}) than it upgrades ({overall.cx_miss_upgrade}) — net <strong>{overall.cx_net_miss} Misshipments</strong> in PG vs Prod.
          </p>
          <p className="text-emerald-100">
            · <strong>ethnic_set</strong> and <strong>sari</strong> are the most impacted verticals across both agents.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {activeTab === 'summary' ? (
        <div className="space-y-6">
          {/* OBD table */}
          <DivergenceTable
            title="OBD Decision: obd_decision_prod vs obd_decision_pg"
            byVertical={data.obd_by_vertical}
            flipMatrix={data.obd_flip_matrix}
            prodDist={data.obd_prod_dist}
            pgDist={data.obd_pg_dist}
          />

          {/* CX table */}
          <DivergenceTable
            title="CX Decision: cx_decision_prod vs cx_decision_pg"
            byVertical={data.cx_by_vertical}
            flipMatrix={data.cx_flip_matrix}
            prodDist={data.cx_prod_dist}
            pgDist={data.cx_pg_dist}
          />

          {/* Side-by-side mini heatmap */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-800 text-sm mb-4">Agreement Rate by Vertical</h3>
            <div className="grid grid-cols-5 gap-3">
              {VERTICALS.map(v => {
                const obd = data.obd_by_vertical.find(x => x.vertical === v);
                const cx = data.cx_by_vertical.find(x => x.vertical === v);
                return (
                  <div key={v} className="border border-slate-200 rounded-lg p-3 text-center">
                    <p className="text-[10px] font-semibold text-slate-600 mb-2">{VERT_LABELS[v]}</p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[9px] text-slate-400 mb-0.5">OBD</p>
                        <p className={`text-sm font-bold ${(obd?.agree_pct||0) >= 90 ? 'text-emerald-600' : (obd?.agree_pct||0) >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {obd?.agree_pct ?? '—'}%
                        </p>
                      </div>
                      <div className="border-t border-slate-100 pt-1">
                        <p className="text-[9px] text-slate-400 mb-0.5">CX</p>
                        <p className={`text-sm font-bold ${(cx?.agree_pct||0) >= 90 ? 'text-emerald-600' : (cx?.agree_pct||0) >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {cx?.agree_pct ?? '—'}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              shirt shows the highest stability (96% both agents). ethnic_set is the most divergent (OBD: 79.4%).
            </p>
          </div>
        </div>
      ) : (
        <IncidentExplorer vertical={explorerVertical} setVertical={setExplorerVertical} />
      )}
    </div>
  );
}
