import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Users, Pencil, MapPin, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import EditClientModal from '../../components/EditClientModal';

function StatusBadge({ isActive }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 rounded animate-pulse w-24" />
        </td>
      ))}
    </tr>
  );
}

function MobileCard({ client, onEdit }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800">{client.name}</p>
          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
            <Phone size={10} /> {client.mobile}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge isActive={client.isActive} />
          <button
            onClick={() => onEdit(client)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500">{client.address}</p>
      <div className="flex flex-wrap gap-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <MapPin size={10} /> Route {client.route}
        </span>
        <span>· Tempo: {client.tempoNumber}</span>
        <span>· {client.assignedDriver?.user?.name ?? '—'}</span>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDriver, setFilterDriver] = useState('');
  const [filterRoute, setFilterRoute] = useState('');
  const [editClient, setEditClient] = useState(null);

  async function fetchClients() {
    try {
      const params = new URLSearchParams();
      if (filterDriver) params.set('driverId', filterDriver);
      if (filterRoute) params.set('route', filterRoute);
      const res = await api.get(`/api/clients?${params}`);
      setClients(res.data);
    } catch {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get('/api/drivers').then((r) => setDrivers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchClients();
  }, [filterDriver, filterRoute]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId || clients.length === 0) return;
    const target = clients.find((c) => c.id === editId);
    if (target) setEditClient(target);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('edit');
      return next;
    }, { replace: true });
  }, [clients, searchParams]);

  const routes = useMemo(() => {
    const set = new Set(clients.map((c) => c.route).filter(Boolean));
    return [...set].sort();
  }, [clients]);

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

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {clients.length} total · {clients.filter((c) => c.isActive).length} active
          </p>
        </div>
        <button
          onClick={() => navigate('/admin/clients/new')}
          className="inline-flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Add New Client
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, mobile, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
          />
        </div>
        <select
          value={filterDriver}
          onChange={(e) => setFilterDriver(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-700"
        >
          <option value="">All Drivers</option>
          {drivers.filter((d) => d.isActive).map((d) => (
            <option key={d.id} value={d.id}>
              {d.user.name} — Route {d.route}
            </option>
          ))}
        </select>
        <select
          value={filterRoute}
          onChange={(e) => setFilterRoute(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-700"
        >
          <option value="">All Routes</option>
          {routes.map((r) => (
            <option key={r} value={r}>Route {r}</option>
          ))}
        </select>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-4 space-y-2 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-32" />
              <div className="h-3 bg-slate-200 rounded w-24" />
              <div className="h-3 bg-slate-200 rounded w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400 gap-2">
            <Users size={36} className="opacity-40" />
            <p className="text-sm">No clients found</p>
          </div>
        ) : (
          filtered.map((c) => (
            <MobileCard key={c.id} client={c} onEdit={setEditClient} />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Mobile</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Tempo</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={36} className="opacity-40" />
                      <p className="text-sm">
                        {search || filterDriver || filterRoute
                          ? 'No clients match your filters'
                          : 'No clients yet. Add one!'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-900 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {c.name[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-800">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.mobile}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[180px] truncate" title={c.address}>
                      {c.address}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.assignedDriver?.user?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                        <MapPin size={10} /> {c.route}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.tempoNumber}</td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={c.isActive} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setEditClient(c)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                        title="Edit client"
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editClient && (
        <EditClientModal
          client={editClient}
          drivers={drivers}
          onClose={() => setEditClient(null)}
          onSaved={() => { setEditClient(null); fetchClients(); }}
        />
      )}
    </div>
  );
}
