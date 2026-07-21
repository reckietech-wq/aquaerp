import { useEffect, useState } from 'react';
import { PackageCheck, Package, Droplets } from 'lucide-react';
import api from '../../lib/api';

function StatCard({ label, value, icon: Icon, color }) {
  const c = {
    green:  'bg-green-50 text-green-800',
    orange: 'bg-orange-50 text-orange-800',
    blue:   'bg-blue-50 text-blue-900',
  }[color];
  return (
    <div className={`${c} rounded-2xl p-5 flex items-center gap-4`}>
      <Icon size={28} className="shrink-0 opacity-70" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
        <p className="text-3xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export default function DriverSummaryPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/driver/summary')
      .then((r) => setSummary(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 pt-4 space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Today's Summary</h1>
      <p className="text-sm text-slate-500">
        {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-slate-200 rounded-2xl" />)}
        </div>
      ) : summary ? (
        <div className="space-y-3">
          <StatCard label="Total Clients" value={summary.totalClients} icon={Droplets} color="blue" />
          <StatCard label="Delivered Today" value={summary.deliveredToday} icon={PackageCheck} color="green" />
          <StatCard label="Still Pending" value={summary.pendingToday} icon={Package} color="orange" />
        </div>
      ) : (
        <p className="text-slate-400 text-sm">Could not load summary.</p>
      )}
    </div>
  );
}
