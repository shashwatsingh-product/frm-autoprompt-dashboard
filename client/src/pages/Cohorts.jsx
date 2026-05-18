import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import SortableTable from '../components/SortableTable';
import StatCard from '../components/StatCard';
import Comments from '../components/Comments';

export default function Cohorts() {
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marketplace, setMarketplace] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [verticalSearch, setVerticalSearch] = useState('');

  useEffect(() => {
    api.getCohorts().then(setCohorts).finally(() => setLoading(false));
  }, []);

  const returnReasons = useMemo(() => {
    return [...new Set(cohorts.map(c => c.returnReason))].sort();
  }, [cohorts]);

  const filtered = useMemo(() => {
    let data = cohorts;
    if (marketplace) data = data.filter(c => c.marketplace === marketplace);
    if (returnReason) data = data.filter(c => c.returnReason === returnReason);
    if (verticalSearch) data = data.filter(c => c.vertical.toLowerCase().includes(verticalSearch.toLowerCase()));
    return data;
  }, [cohorts, marketplace, returnReason, verticalSearch]);

  const filteredTotal = filtered.reduce((s, c) => s + c.incidents, 0);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;

  const columns = [
    { key: 'cohortId', label: 'Cohort ID' },
    {
      key: 'marketplace',
      label: 'Marketplace',
      render: (v) => (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          v === 'FLIPKART' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {v === 'FLIPKART' ? 'FRM-Blue' : 'FRM-HL'}
        </span>
      ),
    },
    { key: 'vertical', label: 'Vertical' },
    {
      key: 'returnReason',
      label: 'Return Reason',
      render: (v) => (
        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
          {v.replace(/_/g, ' ')}
        </span>
      ),
    },
    { key: 'incidents', label: 'Incidents' },
  ];

  return (
    <div>
      <PageHeader title="Cohorts" subtitle="Marketplace x Vertical x Return Reason incident tally" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Cohorts" value={cohorts.length} color="blue" />
        <StatCard label="Filtered" value={filtered.length} subtitle={`${filteredTotal.toLocaleString()} incidents`} color="amber" />
        <StatCard
          label="Flipkart Cohorts"
          value={cohorts.filter(c => c.marketplace === 'FLIPKART').length}
          color="sky"
        />
        <StatCard
          label="Hyperlocal Cohorts"
          value={cohorts.filter(c => c.marketplace === 'HYPERLOCAL').length}
          color="emerald"
        />
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={marketplace}
          onChange={e => setMarketplace(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Marketplaces</option>
          <option value="FLIPKART">FRM-Blue (Flipkart)</option>
          <option value="HYPERLOCAL">FRM-HL (Hyperlocal)</option>
        </select>

        <select
          value={returnReason}
          onChange={e => setReturnReason(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Return Reasons</option>
          {returnReasons.map(r => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search vertical..."
          value={verticalSearch}
          onChange={e => setVerticalSearch(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {(marketplace || returnReason || verticalSearch) && (
          <button
            onClick={() => { setMarketplace(''); setReturnReason(''); setVerticalSearch(''); }}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            Clear filters
          </button>
        )}
      </div>

      <SortableTable columns={columns} data={filtered} pageSize={25} />

      <Comments pageId="cohorts" />
    </div>
  );
}
