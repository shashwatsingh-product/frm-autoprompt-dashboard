import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function VerticalBarChart({ data, title, color = '#2563eb', maxBars = 15 }) {
  if (!data || data.length === 0) return null;

  const chartData = data.slice(0, maxBars).map(d => ({
    name: d.vertical.length > 18 ? d.vertical.slice(0, 16) + '..' : d.vertical,
    fullName: d.vertical,
    incidents: d.incidents || d.count,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>}
      <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 30)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={v => v.toLocaleString()} fontSize={11} />
          <YAxis type="category" dataKey="name" width={120} fontSize={11} />
          <Tooltip
            formatter={(v) => v.toLocaleString()}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
          />
          <Bar dataKey="incidents" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
