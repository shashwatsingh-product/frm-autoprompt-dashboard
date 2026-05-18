export default function StatCard({ label, value, subtitle, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color] || colors.blue}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {subtitle && <p className="text-xs mt-1 opacity-60">{subtitle}</p>}
    </div>
  );
}
