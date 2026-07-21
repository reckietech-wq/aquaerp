import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Truck, Users, MapPin, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';
import EditDriverModal from '../../components/EditDriverModal';

function RouteBadge({ route }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
      <MapPin size={10} />
      Route {route}
    </span>
  );
}

function StatusDot({ isActive }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-300'}`}
    />
  );
}

function DriverCard({ driver, onEdit, onToggle, toggling }) {
  const { user, vehicleNumber, vehicleType, route, isActive, _count } = driver;
  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
      onClick={() => onEdit(driver)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold text-base shrink-0">
            {user.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">{user.name}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
              <Phone size={10} /> {user.mobile}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusDot isActive={isActive} />
          <span className="text-xs text-slate-400">{isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      {/* Vehicle info */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-xs text-slate-400 mb-0.5">Vehicle No.</p>
          <p className="font-medium text-slate-700">{vehicleNumber}</p>
        </div>
        <div className="bg-slate-50 rounded-lg px-3 py-2">
          <p className="text-xs text-slate-400 mb-0.5">Type</p>
          <p className="font-medium text-slate-700">{vehicleType}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <RouteBadge route={route} />
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Users size={12} />
          <span>{_count?.clients ?? 0} clients</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(driver); }}
          disabled={toggling === driver.id}
          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-50 ${
            isActive
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-green-50 text-green-600 hover:bg-green-100'
          }`}
        >
          {toggling === driver.id ? '…' : isActive ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-32" />
          <div className="h-3 bg-slate-200 rounded w-20" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 bg-slate-100 rounded-lg" />
        <div className="h-12 bg-slate-100 rounded-lg" />
      </div>
      <div className="h-8 bg-slate-100 rounded-lg" />
    </div>
  );
}

export default function DriversPage() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState(null);
  const [editDriver, setEditDriver] = useState(null);

  async function fetchDrivers() {
    try {
      const res = await api.get('/api/drivers');
      setDrivers(res.data);
    } catch {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDrivers(); }, []);

  async function handleToggle(driver) {
    const action = driver.isActive ? 'deactivate' : 're-activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${driver.user.name}?`)) return;
    setToggling(driver.id);
    try {
      if (driver.isActive) {
        await api.delete(`/api/drivers/${driver.id}`);
        toast.success('Driver deactivated');
      } else {
        await api.put(`/api/drivers/${driver.id}`, { isActive: true });
        toast.success('Driver activated');
      }
      fetchDrivers();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to update driver');
    } finally {
      setToggling(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.user.name.toLowerCase().includes(q) ||
        d.route.toLowerCase().includes(q) ||
        d.vehicleNumber.toLowerCase().includes(q)
    );
  }, [drivers, search]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">Drivers</h1>
          <p className="text-slate-500 text-sm mt-0.5">{drivers.length} total · {drivers.filter(d => d.isActive).length} active</p>
        </div>
        <button
          onClick={() => navigate('/admin/drivers/new')}
          className="inline-flex items-center gap-2 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Plus size={16} /> Add New Driver
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, route, vehicle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <Truck size={40} className="opacity-40" />
          <p className="text-sm">{search ? 'No drivers match your search' : 'No drivers yet. Add one!'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <DriverCard
              key={d.id}
              driver={d}
              onEdit={setEditDriver}
              onToggle={handleToggle}
              toggling={toggling}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editDriver && (
        <EditDriverModal
          driver={editDriver}
          onClose={() => setEditDriver(null)}
          onSaved={() => { setEditDriver(null); fetchDrivers(); }}
        />
      )}
    </div>
  );
}
