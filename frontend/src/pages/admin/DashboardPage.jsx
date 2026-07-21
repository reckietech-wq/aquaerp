import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Truck,
  PackageCheck,
  Droplets,
  ReceiptText,
  IndianRupee,
  Package,
} from 'lucide-react';
import api from '../../lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN');
}

function fmtRupee(n) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }) {
  const palette = {
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-700',   val: 'text-blue-900' },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-700',  val: 'text-green-900' },
    orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-700', val: 'text-orange-900' },
    cyan:   { bg: 'bg-cyan-50',   icon: 'bg-cyan-100 text-cyan-700',    val: 'text-cyan-900' },
    red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-700',      val: 'text-red-900' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-700', val: 'text-purple-900' },
  }[color];

  return (
    <div className={`${palette.bg} rounded-2xl p-5 flex items-center gap-4`}>
      <div className={`${palette.icon} w-12 h-12 rounded-xl flex items-center justify-center shrink-0`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide truncate">{label}</p>
        <p className={`${palette.val} text-2xl font-bold mt-0.5 truncate`}>{value}</p>
      </div>
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className }) {
  return <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />;
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-slate-50 rounded-2xl p-5 flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
        status === 'COMPLETED'
          ? 'bg-green-100 text-green-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      {status === 'COMPLETED' ? 'Completed' : 'Pending'}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats]       = useState(null);
  const [inventory, setInventory] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loadingStats, setLoadingStats]           = useState(true);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, invRes] = await Promise.all([
        api.get('/api/dashboard/stats'),
        api.get('/api/inventory'),
      ]);
      setStats(statsRes.data);
      setInventory(invRes.data);
    } catch {
      // silently keep stale data on background refresh
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchDeliveries = useCallback(async () => {
    try {
      const res = await api.get('/api/dashboard/recent-deliveries');
      setDeliveries(res.data);
    } catch {
      // silently keep stale data
    } finally {
      setLoadingDeliveries(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchDeliveries();

    const interval = setInterval(() => {
      fetchStats();
      fetchDeliveries();
    }, 60_000);

    return () => clearInterval(interval);
  }, [fetchStats, fetchDeliveries]);

  const filledBottles = inventory?.totalFilledBottles ?? 0;
  const emptyBottles  = inventory?.totalEmptyBottles  ?? 0;
  const lowStock      = inventory?.lowStock ?? false;

  const statCards = stats
    ? [
        { label: 'Total Active Clients',    value: fmt(stats.totalClients),         icon: Users,        color: 'blue'   },
        { label: 'Total Drivers',           value: fmt(stats.totalDrivers),         icon: Truck,        color: 'green'  },
        { label: "Today's Deliveries",      value: fmt(stats.todayDeliveries),      icon: PackageCheck, color: 'orange' },
        { label: 'Bottles Delivered Today', value: fmt(stats.todayBottlesDelivered),icon: Droplets,     color: 'cyan'   },
        { label: 'Pending Invoices',        value: fmt(stats.pendingInvoices),      icon: ReceiptText,  color: 'red'    },
        { label: 'Total Revenue',           value: fmtRupee(stats.totalRevenue),    icon: IndianRupee,  color: 'purple' },
        { label: 'Filled Stock',            value: fmt(filledBottles),              icon: Package,      color: lowStock ? 'red' : 'blue'   },
        { label: 'Empty Bottles',           value: fmt(emptyBottles),               icon: Package,      color: 'orange' },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Live overview · refreshes every 60 s</p>
      </div>

      {/* Stat cards */}
      {loadingStats ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* Recent deliveries */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Recent Deliveries</h2>
          <span className="text-xs text-slate-400">Last 20</span>
        </div>

        {loadingDeliveries ? (
          <div className="p-5">
            <TableSkeleton />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
            <Droplets size={32} className="opacity-40" />
            <p className="text-sm">No deliveries recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Driver</th>
                  <th className="px-5 py-3 text-right">Delivered</th>
                  <th className="px-5 py-3 text-right">Empty Collected</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800">{d.client.name}</p>
                      <p className="text-xs text-slate-400">{d.client.address}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {d.driver?.user?.name ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-800">
                      {d.filledBottlesDelivered}
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-600">
                      {d.emptyBottlesCollected}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">
                      {fmtDate(d.deliveryDate)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={d.status} />
                    </td>
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
