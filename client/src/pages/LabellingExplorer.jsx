import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import Comments from '../components/Comments';

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);

  function toggle(val) {
    onChange(
      selected.includes(val)
        ? selected.filter(v => v !== val)
        : [...selected, val]
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white flex items-center gap-2 min-w-[160px] hover:border-gray-300 transition-colors"
      >
        <span className="flex-1 text-left truncate">
          {selected.length === 0 ? label : `${label} (${selected.length})`}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto min-w-[220px]">
            {selected.length > 0 && (
              <button
                onClick={() => { onChange([]); }}
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border-b border-gray-100"
              >
                Clear all
              </button>
            )}
            {options.map(opt => (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExpandedRow({ recordId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('input');

  useEffect(() => {
    api.getLabellingDetail(recordId).then(setData).finally(() => setLoading(false));
  }, [recordId]);

  if (loading) return (
    <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Loading details...</td></tr>
  );

  if (!data) return (
    <tr><td colSpan={9} className="px-4 py-6 text-center text-red-500">Failed to load</td></tr>
  );

  let inputData = {};
  try { inputData = JSON.parse(data.input_data || '{}'); } catch {}
  let agentOutput = {};
  try { agentOutput = JSON.parse(data.agent_output || '{}'); } catch {}

  const tabs = [
    { key: 'input', label: 'Input Data', count: Object.keys(inputData).length },
    { key: 'output', label: 'Agent Output' },
    { key: 'prompt', label: 'Prompt' },
  ];

  return (
    <tr>
      <td colSpan={9} className="p-0">
        <div className="bg-blue-50 border-y border-blue-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex gap-1">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab === t.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t.label}{t.count != null ? ` (${t.count})` : ''}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-sm">
              Close
            </button>
          </div>

          {tab === 'input' && (
            <div className="bg-white rounded-lg border border-gray-200 max-h-[400px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 w-1/3">Field</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(inputData).map(([k, v]) => (
                    <tr key={k} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-mono text-blue-700 align-top">{k}</td>
                      <td className="px-3 py-1.5 text-gray-700 break-all whitespace-pre-wrap max-w-[600px]">
                        {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v ?? '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'output' && (
            <pre className="bg-white rounded-lg border border-gray-200 p-4 text-xs overflow-auto max-h-[400px] whitespace-pre-wrap text-gray-700">
              {JSON.stringify(agentOutput, null, 2)}
            </pre>
          )}

          {tab === 'prompt' && (
            <pre className="bg-white rounded-lg border border-gray-200 p-4 text-xs overflow-auto max-h-[400px] whitespace-pre-wrap text-gray-700 leading-relaxed">
              {data.prompt || '(No prompt recorded)'}
            </pre>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function LabellingExplorer() {
  const [filters, setFilters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queryLoading, setQueryLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [selAgents, setSelAgents] = useState([]);
  const [selVerticals, setSelVerticals] = useState([]);
  const [selReasons, setSelReasons] = useState([]);
  const [selMarketplaces, setSelMarketplaces] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.getLabellingFilters()
      .then(f => {
        setFilters(f);
        if (f.date_range) {
          setDateFrom(f.date_range.min || '');
          setDateTo(f.date_range.max || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const buildParams = useCallback(() => ({
    agents: selAgents,
    verticals: selVerticals,
    reasons: selReasons,
    marketplaces: selMarketplaces,
    date_from: dateFrom,
    date_to: dateTo,
    search: search,
  }), [selAgents, selVerticals, selReasons, selMarketplaces, dateFrom, dateTo, search]);

  const runQuery = useCallback((pg = 1) => {
    setQueryLoading(true);
    setExpandedId(null);
    const params = { ...buildParams(), page: pg, page_size: 25 };
    Promise.all([
      api.queryLabelling(params),
      api.getLabellingStats(buildParams()),
    ]).then(([r, s]) => {
      setResult(r);
      setStats(s);
      setPage(pg);
    }).finally(() => setQueryLoading(false));
  }, [buildParams]);

  useEffect(() => {
    if (!loading && filters) runQuery(1);
  }, [loading, filters]);

  function handleSearch() {
    runQuery(1);
  }

  function handleDownload() {
    setDownloading(true);
    api.downloadLabelling({ ...buildParams(), limit: 10000 })
      .then(data => {
        if (!data.records || data.records.length === 0) {
          alert('No records to download');
          return;
        }

        const headers = [
          'incident_id', 'agent', 'vertical', 'return_reason', 'marketplace',
          'feedback_date', 'predicted_class', 'human_label', 'is_accepted',
          'feedback_by', 'input_data', 'agent_output', 'prompt'
        ];

        const csvRows = [headers.join(',')];
        for (const r of data.records) {
          const row = headers.map(h => {
            let val = r[h] ?? '';
            val = String(val).replace(/"/g, '""');
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              val = `"${val}"`;
            }
            return val;
          });
          csvRows.push(row.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `labelling_data_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .finally(() => setDownloading(false));
  }

  function clearFilters() {
    setSelAgents([]);
    setSelVerticals([]);
    setSelReasons([]);
    setSelMarketplaces([]);
    setSearch('');
    if (filters?.date_range) {
      setDateFrom(filters.date_range.min || '');
      setDateTo(filters.date_range.max || '');
    }
  }

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading filters...</div>;
  if (filters?.error) return <div className="text-red-500 py-20 text-center">{filters.error}</div>;

  const hasFilters = selAgents.length > 0 || selVerticals.length > 0 || selReasons.length > 0 || selMarketplaces.length > 0 || search;

  return (
    <div>
      <PageHeader
        title="Labelling Explorer"
        subtitle="Browse, filter, and download ground truth labelling data across all agents and cohorts"
      />

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Total Records</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{filters.total_records?.toLocaleString()}</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <p className="text-xs text-blue-600 font-semibold uppercase">Filtered Records</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{stats.total?.toLocaleString()}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <p className="text-xs text-emerald-600 font-semibold uppercase">Filtered Accuracy</p>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{(stats.accuracy * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase">Date Range</p>
            <p className="text-sm font-bold text-gray-900 mt-1">{filters.date_range?.min} — {filters.date_range?.max}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <MultiSelect
            label="Agent"
            options={filters?.agent || []}
            selected={selAgents}
            onChange={setSelAgents}
          />
          <MultiSelect
            label="Vertical"
            options={filters?.vertical || []}
            selected={selVerticals}
            onChange={setSelVerticals}
          />
          <MultiSelect
            label="Return Reason"
            options={filters?.return_reason || []}
            selected={selReasons}
            onChange={setSelReasons}
          />
          <MultiSelect
            label="Marketplace"
            options={filters?.marketplace || []}
            selected={selMarketplaces}
            onChange={setSelMarketplaces}
          />
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase block mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase block mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 font-semibold uppercase block mb-1">Incident ID</label>
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSearch}
            disabled={queryLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {queryLoading ? 'Searching...' : 'Apply Filters'}
          </button>
          {hasFilters && (
            <button
              onClick={() => { clearFilters(); setTimeout(() => runQuery(1), 0); }}
              className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Clear Filters
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading || !result?.total}
            className="ml-auto px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {downloading ? 'Preparing...' : `Download CSV (max 10k)`}
          </button>
        </div>
      </div>

      {queryLoading && !result && (
        <div className="text-gray-400 py-10 text-center">Loading data...</div>
      )}

      {result && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">
              Showing {((result.page - 1) * result.page_size) + 1}–{Math.min(result.page * result.page_size, result.total)} of {result.total.toLocaleString()} records
            </span>
            {result.total_pages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => runQuery(1)}
                  disabled={page <= 1 || queryLoading}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                >
                  First
                </button>
                <button
                  onClick={() => runQuery(page - 1)}
                  disabled={page <= 1 || queryLoading}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-xs text-gray-600 px-2">
                  Page {result.page} of {result.total_pages.toLocaleString()}
                </span>
                <button
                  onClick={() => runQuery(page + 1)}
                  disabled={page >= result.total_pages || queryLoading}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                >
                  Next
                </button>
                <button
                  onClick={() => runQuery(result.total_pages)}
                  disabled={page >= result.total_pages || queryLoading}
                  className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                >
                  Last
                </button>
              </div>
            )}
          </div>

          <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${queryLoading ? 'opacity-50' : ''}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase w-8"></th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Incident ID</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Vertical</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Return Reason</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Mkt</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Predicted</th>
                    <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Human Label</th>
                  </tr>
                </thead>
                <tbody>
                  {result.records.map(r => {
                    const match = r.predicted_class === r.human_label;
                    const isExpanded = expandedId === r.id;
                    return (
                      <>
                        <tr
                          key={r.id}
                          onClick={() => setExpandedId(isExpanded ? null : r.id)}
                          className={`border-b border-gray-50 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="px-3 py-2.5 text-gray-400 text-xs">
                            {isExpanded ? '▼' : '▶'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{r.incident_id}</td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                              {r.agent}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700 text-xs">{r.vertical}</td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                              {r.return_reason}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              r.marketplace === 'FLIPKART' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {r.marketplace === 'FLIPKART' ? 'FK' : r.marketplace === 'HYPERLOCAL' ? 'HL' : r.marketplace}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{r.feedback_date}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {r.predicted_class || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-[10px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded font-medium">
                              {r.human_label || '-'}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <ExpandedRow
                            key={`detail-${r.id}`}
                            recordId={r.id}
                            onClose={() => setExpandedId(null)}
                          />
                        )}
                      </>
                    );
                  })}
                  {result.records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                        No records match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {result.total_pages > 1 && (
            <div className="flex justify-center mt-4 gap-1">
              <button
                onClick={() => runQuery(page - 1)}
                disabled={page <= 1 || queryLoading}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">
                Page {result.page} of {result.total_pages.toLocaleString()}
              </span>
              <button
                onClick={() => runQuery(page + 1)}
                disabled={page >= result.total_pages || queryLoading}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      <Comments pageId="labelling-explorer" />
    </div>
  );
}
