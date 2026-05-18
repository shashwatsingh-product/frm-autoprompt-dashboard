import { useState, useEffect, useCallback, Fragment } from 'react';
import { api } from '../api/client';

function StatCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  };
  return (
    <div className={`rounded-xl border-2 p-4 ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

function AccuracyBadge({ value }) {
  const color = value >= 85 ? 'bg-emerald-100 text-emerald-700' :
                value >= 70 ? 'bg-amber-100 text-amber-700' :
                'bg-rose-100 text-rose-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      {value}%
    </span>
  );
}

function SortHeader({ label, col, current, dir, onSort }) {
  const active = current === col;
  return (
    <th
      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-blue-600 select-none"
      onClick={() => onSort(col)}
    >
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

function CohortDetail({ data, loading }) {
  const [showIncidents, setShowIncidents] = useState(false);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
        <p className="text-xs text-gray-400 mt-2">Loading cohort detail...</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 space-y-4">
      {/* Per-agent accuracy */}
      <div>
        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Per-Agent Accuracy</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {data.agents.map(a => (
            <div key={a.agent} className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-700 truncate">{a.agent}</p>
              <div className="flex items-center justify-between mt-1">
                <AccuracyBadge value={a.accuracy} />
                <span className="text-[10px] text-slate-400">{a.correct}/{a.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Overall */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>Overall: <span className="font-bold text-slate-700">{data.overall_accuracy}%</span></span>
        <span>{data.total_incidents} incidents</span>
        <span>{data.agents.reduce((s, a) => s + a.total, 0)} total predictions</span>
      </div>

      {/* Incident-level toggle */}
      <div>
        <button
          onClick={() => setShowIncidents(!showIncidents)}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <span className={`transition-transform ${showIncidents ? 'rotate-90' : ''}`}>&#9654;</span>
          {showIncidents ? 'Hide' : 'Show'} Incident-Level Detail ({data.total_incidents} incidents)
        </button>

        {showIncidents && (
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">Incident ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-500">Human Label</th>
                  {data.agents.map(a => (
                    <th key={a.agent} className="px-2 py-2 text-center font-semibold text-slate-500 max-w-[80px] truncate" title={a.agent}>
                      {a.agent.replace('_agent', '').slice(0, 8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.incidents.map((inc, i) => (
                  <tr key={inc.incident_id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-600">{inc.incident_id}</td>
                    <td className="px-3 py-1.5 text-slate-700">{inc.human_label || '—'}</td>
                    {data.agents.map(a => {
                      const agentData = inc.agents[a.agent];
                      if (!agentData) return <td key={a.agent} className="px-2 py-1.5 text-center text-slate-300">—</td>;
                      const match = agentData.accepted === 1;
                      return (
                        <td key={a.agent} className="px-2 py-1.5 text-center" title={agentData.predicted}>
                          <span className={`inline-block w-5 h-5 leading-5 rounded-full text-[10px] font-bold ${
                            match ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                            {match ? '✓' : '✗'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesignGoldenDataset() {
  const [summary, setSummary] = useState(null);
  const [cohortsData, setCohortsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cohortsLoading, setCohortsLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [sortCol, setSortCol] = useState('total_incidents');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  // Expanded cohort
  const [expandedKey, setExpandedKey] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.getGoldenSummary().then(setSummary).catch(console.error).finally(() => setLoading(false));
  }, []);

  const fetchCohorts = useCallback(() => {
    setCohortsLoading(true);
    api.getGoldenCohorts({ search, marketplace, return_reason: returnReason, sort: sortCol, sort_dir: sortDir, page, limit: 20 })
      .then(setCohortsData)
      .catch(console.error)
      .finally(() => setCohortsLoading(false));
  }, [search, marketplace, returnReason, sortCol, sortDir, page]);

  useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  function handleExpand(cohort) {
    const key = `${cohort.marketplace}|${cohort.vertical}|${cohort.return_reason}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      setDetailData(null);
      return;
    }
    setExpandedKey(key);
    setDetailLoading(true);
    setDetailData(null);
    api.getGoldenCohortDetail({
      marketplace: cohort.marketplace,
      vertical: cohort.vertical,
      return_reason: cohort.return_reason,
    }).then(setDetailData).catch(console.error).finally(() => setDetailLoading(false));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <h1 className="text-2xl font-bold">Golden Evaluation Dataset</h1>
        <p className="text-blue-100 text-sm mt-1">
          {summary?.golden_size || 50} incidents per qualifying MPC cohort — deterministic ground truth for agent evaluation
        </p>
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-xs text-blue-200 font-semibold">Total Cohorts</p>
              <p className="text-xl font-bold">{summary.total_cohorts}</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-xs text-blue-200 font-semibold">Total Incidents</p>
              <p className="text-xl font-bold">{summary.total_incidents?.toLocaleString()}</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-xs text-blue-200 font-semibold">Total Rows</p>
              <p className="text-xl font-bold">{summary.total_rows?.toLocaleString()}</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3">
              <p className="text-xs text-blue-200 font-semibold">Avg Accuracy</p>
              <p className="text-xl font-bold">{summary.avg_accuracy}%</p>
            </div>
          </div>
        )}
      </div>

      {/* Methodology + Breakdown */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Selection Methodology</h2>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">1.</span>
              <p>Group all labelled records by <span className="font-semibold">Marketplace x Vertical x Return Reason</span> (MPC triplet)</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">2.</span>
              <p>Qualify cohorts with <span className="font-semibold">&ge; 50 unique incident_ids</span></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">3.</span>
              <p>Select first 50 incidents deterministically via <code className="bg-slate-100 px-1 rounded">ORDER BY incident_id LIMIT 50</code></p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">4.</span>
              <p>Include all agent rows per incident (~8-9 agents) for complete evaluation coverage</p>
            </div>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700">
              <span className="font-bold">Purpose:</span> Baseline evaluation set for GEPA binary agent accuracy measurement per cohort.
              Deterministic selection ensures reproducibility across evaluation runs.
            </p>
          </div>
        </div>

        {summary && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">Distribution</h2>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">By Marketplace</p>
                {Object.entries(summary.by_marketplace).map(([mp, count]) => (
                  <div key={mp} className="flex justify-between items-center text-xs py-1">
                    <span className="text-slate-600 font-medium">{mp}</span>
                    <span className="text-slate-500">{count} cohorts</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">By Return Reason</p>
                {Object.entries(summary.by_return_reason).map(([rr, count]) => (
                  <div key={rr} className="flex justify-between items-center text-xs py-1">
                    <span className="text-slate-600 font-medium truncate mr-2">{rr}</span>
                    <span className="text-slate-500 whitespace-nowrap">{count} cohorts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search vertical or reason..."
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          {cohortsData?.filters && (
            <>
              <select
                value={marketplace}
                onChange={e => { setMarketplace(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Marketplaces</option>
                {cohortsData.filters.marketplaces.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={returnReason}
                onChange={e => { setReturnReason(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Return Reasons</option>
                {cohortsData.filters.return_reasons.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </>
          )}
          {cohortsData && (
            <span className="text-xs text-slate-400 ml-auto">
              {cohortsData.total} cohorts
            </span>
          )}
        </div>
      </div>

      {/* Cohort Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {cohortsLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-8 px-3 py-2.5"></th>
                    <SortHeader label="Marketplace" col="marketplace" current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Vertical" col="vertical" current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Return Reason" col="return_reason" current={sortCol} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Total Incidents" col="total_incidents" current={sortCol} dir={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Golden</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Agents</th>
                    <SortHeader label="Accuracy" col="accuracy" current={sortCol} dir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {cohortsData?.cohorts.map((c, i) => {
                    const key = `${c.marketplace}|${c.vertical}|${c.return_reason}`;
                    const isExpanded = expandedKey === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          className={`cursor-pointer transition-colors ${isExpanded ? 'bg-blue-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100'}`}
                          onClick={() => handleExpand(c)}
                        >
                          <td className="px-3 py-2.5 text-xs text-slate-400">
                            <span className={`transition-transform inline-block ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs font-medium text-slate-700">{c.marketplace}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[200px] truncate" title={c.vertical}>{c.vertical}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[160px] truncate" title={c.return_reason}>{c.return_reason}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-700 font-medium">{c.total_incidents.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-xs text-blue-600 font-bold">{c.golden_count}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">{c.agent_count}</td>
                          <td className="px-3 py-2.5"><AccuracyBadge value={c.accuracy} /></td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-blue-50/50 border-t border-b border-blue-200">
                              <CohortDetail data={detailData} loading={detailLoading} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {cohortsData && cohortsData.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs text-slate-500">
                  Page {cohortsData.page} of {cohortsData.pages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(cohortsData.pages, p + 1))}
                  disabled={page >= cohortsData.pages}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
