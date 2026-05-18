import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import Comments from '../components/Comments';

export default function CohortPromptMapping() {
  const [mappings, setMappings] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMarketplace, setFilterMarketplace] = useState('');
  const [filterReason, setFilterReason] = useState('');
  const [filterVertical, setFilterVertical] = useState('');
  const [filterPrompt, setFilterPrompt] = useState('');
  const [sortField, setSortField] = useState('vertical');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    Promise.all([api.getPromptMappings({}), api.getPrompts()])
      .then(([m, p]) => { setMappings(m); setPrompts(p); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;

  const marketplaces = [...new Set(mappings.map(m => m.marketplace))].sort();
  const reasons = [...new Set(mappings.map(m => m.return_reason))].sort();
  const promptIds = [...new Set(mappings.map(m => m.prompt_id))].sort();
  const promptMap = Object.fromEntries(prompts.map(p => [p.id, p]));

  let filtered = mappings;
  if (filterMarketplace) filtered = filtered.filter(m => m.marketplace === filterMarketplace);
  if (filterReason) filtered = filtered.filter(m => m.return_reason === filterReason);
  if (filterVertical) filtered = filtered.filter(m => m.vertical.toLowerCase().includes(filterVertical.toLowerCase()));
  if (filterPrompt) filtered = filtered.filter(m => m.prompt_id === filterPrompt);

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortField] || '';
    const bv = b[sortField] || '';
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  const fkCount = mappings.filter(m => m.marketplace === 'FLIPKART').length;
  const hlCount = mappings.filter(m => m.marketplace === 'HYPERLOCAL').length;

  const SortIcon = ({ field }) => (
    <span className="ml-1 text-gray-400">
      {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  return (
    <div>
      <PageHeader
        title="Cohort x Prompt Mapping"
        subtitle="Live production mapping of prompts to vertical x return reason x marketplace cohorts"
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Total Mappings</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{mappings.length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <p className="text-xs text-blue-600 font-semibold uppercase">Flipkart (FK)</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">{fkCount}</p>
        </div>
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
          <p className="text-xs text-purple-600 font-semibold uppercase">Hyperlocal (HL)</p>
          <p className="text-2xl font-bold text-purple-900 mt-1">{hlCount}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-xs text-emerald-600 font-semibold uppercase">Unique Prompts Used</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{promptIds.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filterMarketplace}
          onChange={e => setFilterMarketplace(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Marketplaces</option>
          {marketplaces.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={filterReason}
          onChange={e => setFilterReason(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Return Reasons</option>
          {reasons.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <input
          type="text"
          placeholder="Search vertical..."
          value={filterVertical}
          onChange={e => setFilterVertical(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />

        <select
          value={filterPrompt}
          onChange={e => setFilterPrompt(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Prompts</option>
          {promptIds.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {(filterMarketplace || filterReason || filterVertical || filterPrompt) && (
          <button
            onClick={() => { setFilterMarketplace(''); setFilterReason(''); setFilterVertical(''); setFilterPrompt(''); }}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500 mb-2">{sorted.length} of {mappings.length} mappings shown</div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {[
                  { field: 'marketplace', label: 'Marketplace' },
                  { field: 'vertical', label: 'Vertical' },
                  { field: 'return_reason', label: 'Return Reason' },
                  { field: 'return_sub_reason', label: 'Sub Reason' },
                  { field: 'prompt_id', label: 'Prompt ID' },
                ].map(({ field, label }) => (
                  <th
                    key={field}
                    onClick={() => handleSort(field)}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 select-none"
                  >
                    {label}<SortIcon field={field} />
                  </th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Prompt Name
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => {
                const prompt = promptMap[m.prompt_id];
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        m.marketplace === 'FLIPKART'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {m.marketplace === 'FLIPKART' ? 'FK' : 'HL'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{m.vertical}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        {m.return_reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{m.return_sub_reason || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-mono font-medium">
                        {m.prompt_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {prompt ? prompt.name : '-'}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No mappings match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Comments pageId="cohort-prompt-mapping" />
    </div>
  );
}
