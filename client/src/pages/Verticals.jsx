import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import VerticalBarChart from '../components/VerticalBarChart';
import SortableTable from '../components/SortableTable';
import Comments from '../components/Comments';

export default function Verticals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('frmBlue');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getVerticals().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;
  if (!data) return <div className="text-red-500 py-20 text-center">Failed to load data</div>;

  const current = tab === 'frmBlue' ? data.frmBlue : data.frmHL;
  const filtered = search
    ? current.filter(v => v.vertical.toLowerCase().includes(search.toLowerCase()))
    : current;

  const totalIncidents = current.reduce((s, v) => s + v.incidents, 0);

  const columns = [
    { key: 'vertical', label: 'Vertical' },
    { key: 'incidents', label: 'Incidents' },
    {
      key: 'share',
      label: '% Share',
      render: (_, row) => ((row.incidents / totalIncidents) * 100).toFixed(1) + '%',
    },
  ];

  return (
    <div>
      <PageHeader title="Verticals" subtitle="Product vertical incident breakdown by marketplace" />

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setTab('frmBlue'); setSearch(''); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'frmBlue' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          FRM-Blue ({data.frmBlue.length} verticals)
        </button>
        <button
          onClick={() => { setTab('frmHL'); setSearch(''); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'frmHL' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          FRM-HL ({data.frmHL.length} verticals)
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Verticals</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{current.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Total Incidents</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalIncidents.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Top Vertical</p>
          <p className="text-lg font-bold text-gray-900 mt-1">{current[0]?.vertical}</p>
          <p className="text-xs text-gray-500">{current[0]?.incidents.toLocaleString()} incidents</p>
        </div>
      </div>

      <div className="mb-6">
        <VerticalBarChart
          data={current.slice(0, 15)}
          title={`Top 15 ${tab === 'frmBlue' ? 'FRM-Blue' : 'FRM-HL'} Verticals`}
          color={tab === 'frmBlue' ? '#2563eb' : '#10b981'}
        />
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search verticals..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <SortableTable columns={columns} data={filtered} pageSize={30} />

      <Comments pageId="verticals" />
    </div>
  );
}
