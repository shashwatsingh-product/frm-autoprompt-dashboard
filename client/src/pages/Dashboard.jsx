import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import MarketplacePieChart from '../components/MarketplacePieChart';
import VerticalBarChart from '../components/VerticalBarChart';
import Comments from '../components/Comments';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOverview().then(setOverview).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;
  if (!overview) return <div className="text-red-500 py-20 text-center">Failed to load data</div>;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="FRM AutoPrompt System Overview" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Incidents" value={overview.totalIncidents} subtitle="Labelled ground truth" color="blue" />
        <StatCard label="Agents" value={overview.agentCount} subtitle="Production GenAI agents" color="emerald" />
        <StatCard label="Cohorts" value={overview.cohortCount} subtitle="Unique marketplace x vertical x reason" color="amber" />
        <StatCard label="Marketplaces" value={overview.marketplaces.length} subtitle="FRM-Blue + FRM-HL" color="sky" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <MarketplacePieChart data={overview.marketplaces} />

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Return Reason Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={overview.returnReasons} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="reason"
                fontSize={10}
                angle={-30}
                textAnchor="end"
                height={80}
                tickFormatter={v => v.length > 15 ? v.slice(0, 13) + '..' : v}
              />
              <YAxis tickFormatter={v => v.toLocaleString()} fontSize={11} />
              <Tooltip formatter={v => v.toLocaleString()} />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <VerticalBarChart
        data={overview.topVerticals}
        title="Top 15 Verticals by Incident Count"
        color="#3b82f6"
        maxBars={15}
      />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {overview.marketplaces.map(m => (
          <div key={m.key} className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700">{m.name}</h3>
            <div className="mt-3 flex gap-6">
              <div>
                <p className="text-2xl font-bold text-gray-900">{m.incidents.toLocaleString()}</p>
                <p className="text-xs text-gray-500">incidents</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{m.verticals}</p>
                <p className="text-xs text-gray-500">verticals</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Comments pageId="dashboard" />
    </div>
  );
}
