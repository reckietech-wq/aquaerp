import { useEffect, useState, useCallback, useMemo } from 'react';
import { Phone, MapPin, Clock, CheckCircle2, RefreshCw, Search, Droplets, Droplet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import DeliveryModal from '../../components/DeliveryModal';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return null;
  const date = new Date(d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date >= today) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── Summary pill ─────────────────────────────────────────────────────────────

function SummaryPill({ label, value, color, icon: Icon }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-900',
    green:  'bg-green-50 text-green-800',
    orange: 'bg-orange-50 text-orange-800',
    cyan:   'bg-cyan-50 text-cyan-800',
  };
  return (
    <div className={`flex-1 flex flex-col items-center py-3 px-1 rounded-2xl ${colors[color]}`}>
      {Icon && <Icon size={14} className="mb-0.5 opacity-60" />}
      <span className="text-xl font-bold leading-tight">{value}</span>
      <span className="text-xs font-medium mt-0.5 opacity-60 text-center leading-tight">{label}</span>
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-1.5">
          <div className="h-5 w-36 bg-slate-200 rounded" />
          <div className="h-3 w-24 bg-slate-100 rounded" />
        </div>
        <div className="w-8 h-8 bg-slate-200 rounded-full" />
      </div>
      <div className="h-3 w-full bg-slate-100 rounded" />
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-slate-100 rounded-full" />
        <div className="h-6 w-24 bg-slate-100 rounded-full" />
      </div>
    </div>
  );
}

// ─── Client card ─────────────────────────────────────────────────────────────

function ClientCard({ client, onClick }) {
  const delivered = client.deliveredToday;

  return (
    <button
      onClick={() => onClick(client)}
      className={`w-full text-left rounded-2xl border shadow-sm p-4 space-y-3 transition-all active:scale-[0.98] ${
        delivered
          ? 'bg-green-50 border-green-200'
          : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-md'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-800 leading-snug">{client.name}</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-2">{client.address}</p>
        </div>
        <div className="shrink-0 mt-0.5">
          {delivered ? (
            <CheckCircle2 size={24} className="text-green-500" />
          ) : (
            <Clock size={24} className="text-orange-400" />
          )}
        </div>
      </div>

      {/* Call link */}
      <a
        href={`tel:${client.mobile}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 text-blue-700 text-sm font-medium"
      >
        <Phone size={13} className="shrink-0" />
        {client.mobile}
      </a>

      {/* Footer badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
          <MapPin size={10} /> {client.route}
        </span>
        {delivered ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
            ✅ {client.todayDelivery?.filledBottlesDelivered ?? 0} bottles
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
            ⏳ Pending
          </span>
        )}
        {!delivered && client.lastDeliveryDate && (
          <span className="text-xs text-slate-400 ml-auto">
            Last: {fmtDate(client.lastDeliveryDate)}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DriverDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeClient, setActiveClient] = useState(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await api.get('/api/driver/clients');
      setData(res.data);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleDelivered() {
    fetchData(true);
  }

  const clients = data?.clients ?? [];
  const driver = data?.driver;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.mobile.includes(q) ||
        c.address.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const deliveredCount    = clients.filter((c) => c.deliveredToday).length;
  const pendingCount      = clients.length - deliveredCount;
  const totalBottlesToday = clients.reduce(
    (s, c) => s + (c.deliveredToday ? (c.todayDelivery?.filledBottlesDelivered ?? 0) : 0),
    0
  );

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-4">
        <div className="h-5 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="flex-1 h-16 bg-slate-200 rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-11 bg-slate-200 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      {/* Driver info + refresh */}
      <div className="flex items-center justify-between">
        <div>
          {driver && (
            <p className="text-xs text-slate-400 font-medium">
              Route {driver.route} · {driver.vehicleType} {driver.vehicleNumber}
            </p>
          )}
          <p className="text-sm font-semibold text-slate-700 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={`text-slate-600 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-2">
        <SummaryPill label="Clients"   value={clients.length}    color="blue"   />
        <SummaryPill label="Done ✅"   value={deliveredCount}    color="green"  />
        <SummaryPill label="Pending ⏳" value={pendingCount}     color="orange" />
        <SummaryPill label="Bottles"   value={totalBottlesToday} color="cyan"   icon={Droplet} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
        />
      </div>

      {/* Section labels */}
      {!search && pendingCount > 0 && deliveredCount > 0 && (
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-orange-400" />
          <span className="text-xs font-semibold text-orange-500 uppercase tracking-wide">
            {pendingCount} Pending
          </span>
        </div>
      )}

      {/* Client cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <Droplets size={40} className="opacity-30" />
          <p className="text-sm">
            {search ? 'No clients match your search' : 'No clients assigned yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((client, idx) => {
            const prevDelivered = idx > 0 && filtered[idx - 1].deliveredToday;
            const showDoneLabel =
              !search && client.deliveredToday && !prevDelivered && pendingCount > 0;
            return (
              <div key={client.id}>
                {showDoneLabel && (
                  <div className="flex items-center gap-2 pt-1 pb-0.5">
                    <CheckCircle2 size={13} className="text-green-500" />
                    <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                      {deliveredCount} Delivered
                    </span>
                  </div>
                )}
                <ClientCard client={client} onClick={setActiveClient} />
              </div>
            );
          })}
        </div>
      )}

      {/* Delivery modal */}
      {activeClient && (
        <DeliveryModal
          client={activeClient}
          onClose={() => setActiveClient(null)}
          onDelivered={() => {
            setActiveClient(null);
            handleDelivered();
          }}
        />
      )}
    </div>
  );
}
