import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import VerticalBarChart from '../components/VerticalBarChart';
import Comments from '../components/Comments';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function Marketplace() {
  const [overview, setOverview] = useState(null);
  const [verticals, setVerticals] = useState(null);
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getOverview(), api.getVerticals(), api.getCohorts()])
      .then(([o, v, c]) => { setOverview(o); setVerticals(v); setCohorts(c); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;
  if (!overview) return <div className="text-red-500 py-20 text-center">Failed to load</div>;

  const fk = overview.marketplaces.find(m => m.key === 'FLIPKART');
  const hl = overview.marketplaces.find(m => m.key === 'HYPERLOCAL');

  const fkReasons = {};
  const hlReasons = {};
  cohorts.forEach(c => {
    const map = c.marketplace === 'FLIPKART' ? fkReasons : hlReasons;
    map[c.returnReason] = (map[c.returnReason] || 0) + c.incidents;
  });

  const allReasons = [...new Set([...Object.keys(fkReasons), ...Object.keys(hlReasons)])];
  const reasonComparison = allReasons.map(r => ({
    reason: r.replace(/_/g, ' '),
    'FRM-Blue': fkReasons[r] || 0,
    'FRM-HL': hlReasons[r] || 0,
  })).sort((a, b) => (b['FRM-Blue'] + b['FRM-HL']) - (a['FRM-Blue'] + a['FRM-HL']));

  return (
    <div>
      <PageHeader title="Marketplace Comparison" subtitle="FRM-Blue (Flipkart) vs FRM-HL (Hyperlocal)" />

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
          <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider">FRM-Blue (Flipkart)</h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold text-blue-900">{fk?.incidents.toLocaleString()}</p>
              <p className="text-xs text-blue-600 mt-1">incidents</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-900">{fk?.verticals}</p>
              <p className="text-xs text-blue-600 mt-1">verticals</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-900">
                {cohorts.filter(c => c.marketplace === 'FLIPKART').length}
              </p>
              <p className="text-xs text-blue-600 mt-1">cohorts</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-900">
                {Object.keys(fkReasons).length}
              </p>
              <p className="text-xs text-blue-600 mt-1">return reasons</p>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-6">
          <h3 className="text-sm font-semibold text-emerald-700 uppercase tracking-wider">FRM-HL (Hyperlocal)</h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-3xl font-bold text-emerald-900">{hl?.incidents.toLocaleString()}</p>
              <p className="text-xs text-emerald-600 mt-1">incidents</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-900">{hl?.verticals}</p>
              <p className="text-xs text-emerald-600 mt-1">verticals</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-900">
                {cohorts.filter(c => c.marketplace === 'HYPERLOCAL').length}
              </p>
              <p className="text-xs text-emerald-600 mt-1">cohorts</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-900">
                {Object.keys(hlReasons).length}
              </p>
              <p className="text-xs text-emerald-600 mt-1">return reasons</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Return Reason Comparison</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={reasonComparison} margin={{ left: 10, right: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="reason"
              fontSize={10}
              angle={-35}
              textAnchor="end"
              height={80}
              tickFormatter={v => v.length > 20 ? v.slice(0, 18) + '..' : v}
            />
            <YAxis tickFormatter={v => v.toLocaleString()} fontSize={11} />
            <Tooltip formatter={v => v.toLocaleString()} />
            <Legend />
            <Bar dataKey="FRM-Blue" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="FRM-HL" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {verticals && (
          <>
            <VerticalBarChart
              data={verticals.frmBlue.slice(0, 10)}
              title="Top 10 FRM-Blue Verticals"
              color="#2563eb"
              maxBars={10}
            />
            <VerticalBarChart
              data={verticals.frmHL.slice(0, 10)}
              title="Top 10 FRM-HL Verticals"
              color="#10b981"
              maxBars={10}
            />
          </>
        )}
      </div>

      <Comments pageId="marketplace" />
    </div>
  );
}
