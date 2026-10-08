import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, CheckCircle2, Users, Search, Building2, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

const routeOptions = [
  'Route 1', 'Route 2', 'Route 3', 'Route 4', 'Route 5',
  'Route 6', 'Route 7', 'Route 8', 'Route 9', 'Route 10',
];

function Field({ label, required, error, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Input({ hasError, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
        focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition
        ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}
        ${className}`}
    />
  );
}

// Searchable customer picker used by the "Add to existing customer" mode —
// finds the customer first, then the form below collects just this new
// location's own fields (address/route/rate/driver), never a balance.
function CustomerPicker({ selected, onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      api.get(`/api/customers?search=${encodeURIComponent(query.trim())}`)
        .then((r) => setResults(r.data))
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {selected.name[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">{selected.name}</p>
            <p className="text-xs text-blue-600">
              {selected.locationCount} existing location{selected.locationCount === 1 ? '' : 's'} · Outstanding ₹{Number(selected.outstandingBalance ?? 0).toFixed(2)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs font-semibold text-blue-700 hover:text-blue-900"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search customer by name or mobile…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent"
        />
      </div>
      {query.trim() && (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
          {searching ? (
            <p className="text-sm text-slate-400 px-4 py-3">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-400 px-4 py-3">No matching customers</p>
          ) : (
            results.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => onSelect(c)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <span className="text-sm font-medium text-slate-700">{c.name}</span>
                <span className="text-xs text-slate-400">
                  {c.locationCount} location{c.locationCount === 1 ? '' : 's'}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function AddClientPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [created, setCreated] = useState(null);
  const [mode, setMode] = useState(searchParams.get('mode') === 'existing' ? 'existing' : 'new');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { ratePerBottle: 50 } });

  const selectedDriverId = watch('assignedDriverId');

  useEffect(() => {
    api.get('/api/drivers')
      .then((r) => setDrivers(r.data.filter((d) => d.isActive)))
      .catch(() => toast.error('Failed to load drivers'))
      .finally(() => setLoadingDrivers(false));
  }, []);

  // Auto-fill route when driver changes
  useEffect(() => {
    if (!selectedDriverId) return;
    const driver = drivers.find((d) => d.id === selectedDriverId);
    if (driver) {
      const driverRoute = routeOptions.includes(driver.route) ? driver.route : `Route ${driver.route}`;
      setValue('route', driverRoute, { shouldValidate: false });
    }
  }, [selectedDriverId, drivers, setValue]);

  async function onSubmit(data) {
    const driverName =
      drivers.find((d) => d.id === data.assignedDriverId)?.user?.name ?? 'selected driver';

    if (mode === 'existing') {
      if (!selectedCustomer) {
        toast.error('Pick a customer first');
        return;
      }
      try {
        const res = await api.post(`/api/customers/${selectedCustomer.id}/locations`, {
          name: data.name || undefined,
          address: data.address,
          assignedDriverId: data.assignedDriverId,
          tempoNumber: data.tempoNumber,
          route: data.route,
          ratePerBottle: data.ratePerBottle,
          ...(data.mobile && { mobile: data.mobile }),
        });
        setCreated({ name: res.data.name, driverName });
        toast.success(`${res.data.name} added as a new location under ${selectedCustomer.name}`);
      } catch (err) {
        toast.error(err.response?.data?.error ?? 'Failed to add location');
      }
      return;
    }

    try {
      const res = await api.post('/api/clients', {
        name: data.name,
        mobile: data.mobile,
        email: data.email || undefined,
        address: data.address,
        assignedDriverId: data.assignedDriverId,
        tempoNumber: data.tempoNumber,
        route: data.route,
        ratePerBottle: data.ratePerBottle,
      });

      const openingBalance = parseFloat(data.openingBalance);
      if (!isNaN(openingBalance) && openingBalance > 0) {
        // The historical-record endpoint is bottle-count based, so convert the
        // rupee opening balance into an equivalent bottle count at this
        // client's rate — that's the closest fit without a separate raw-amount
        // historical entry type.
        const rate = data.ratePerBottle;
        const bottlesEquivalent = Math.round(openingBalance / rate);
        try {
          await api.post(`/api/clients/${res.data.id}/historical-record`, {
            date: new Date().toISOString().slice(0, 10),
            bottlesDelivered: bottlesEquivalent || 1,
            ratePerBottle: rate,
            amountPaid: 0,
            paymentMethod: null,
            note: 'Opening balance at client creation',
          });
        } catch (histErr) {
          toast.error(histErr.response?.data?.error ?? 'Client created, but opening balance entry failed — add it manually via Past Records');
        }
      }

      setCreated({ name: res.data.name, driverName });
      toast.success(`${res.data.name} added and assigned to ${driverName}`);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to create client');
    }
  }

  if (created) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <button
          onClick={() => navigate('/admin/clients')}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Clients
        </button>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {mode === 'existing' ? 'Location Added!' : 'Client Added!'}
            </h2>
            <p className="text-slate-500 text-sm mt-2">
              <span className="font-semibold text-slate-700">{created.name}</span>{' '}
              {mode === 'existing'
                ? <>has been added as a new location under <span className="font-semibold text-slate-700">{selectedCustomer?.name}</span>, sharing its balance,</>
                : 'has been added'}{' '}
              and assigned to Driver{' '}
              <span className="font-semibold text-slate-700">{created.driverName}</span>.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setCreated(null); setSelectedCustomer(null); }}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Add Another
            </button>
            <button
              onClick={() => navigate('/admin/clients')}
              className="flex-1 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-sm font-semibold text-white transition-colors"
            >
              View All Clients
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/clients')}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {mode === 'existing' ? 'Add Location' : 'Add New Client'}
          </h1>
          <p className="text-slate-500 text-sm">
            {mode === 'existing'
              ? 'Add another delivery location to an existing customer'
              : 'Register a new water can delivery client'}
          </p>
        </div>
      </div>

      {/* New customer vs. add-to-existing toggle */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex gap-1">
        <button
          type="button"
          onClick={() => { setMode('new'); setSelectedCustomer(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            mode === 'new' ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Users size={15} /> New Customer
        </button>
        <button
          type="button"
          onClick={() => setMode('existing')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            mode === 'existing' ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Building2 size={15} /> Add to Existing Customer
        </button>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-7"
      >
        {mode === 'existing' && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Building2 size={13} /> Customer
            </h2>
            <CustomerPicker selected={selectedCustomer} onSelect={setSelectedCustomer} />
            <p className="text-xs text-slate-400">
              This new location will share {selectedCustomer ? selectedCustomer.name + "'s" : "the customer's"} existing balance — it won't have its own.
            </p>
          </section>
        )}

        {/* ── Personal Info ─────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            {mode === 'existing' ? 'Location Info' : 'Client Info'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={mode === 'existing' ? 'Location Label' : 'Client Name'} required={mode === 'new'} error={errors.name?.message}>
              <Input
                hasError={!!errors.name}
                placeholder={mode === 'existing' ? 'optional — e.g. "Branch 2"' : 'e.g. Rajesh Sharma'}
                {...register('name', mode === 'new' ? { required: 'Client name is required' } : {})}
              />
            </Field>
            <Field label="Mobile Number" required={mode === 'new'} error={errors.mobile?.message}>
              <Input
                hasError={!!errors.mobile}
                placeholder={mode === 'existing' ? 'optional — defaults to customer\'s mobile' : '10-digit mobile'}
                type="tel"
                maxLength={10}
                {...register('mobile', mode === 'new' ? {
                  required: 'Mobile number is required',
                  pattern: {
                    value: /^[6-9]\d{9}$/,
                    message: 'Enter a valid 10-digit mobile number',
                  },
                } : {
                  pattern: {
                    value: /^[6-9]\d{9}$/,
                    message: 'Enter a valid 10-digit mobile number',
                  },
                })}
              />
            </Field>
            {mode === 'new' && (
              <Field label="Email Address" error={errors.email?.message}>
                <Input
                  hasError={!!errors.email}
                  placeholder="optional"
                  type="email"
                  {...register('email', {
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                      message: 'Enter a valid email address',
                    },
                  })}
                />
              </Field>
            )}
          </div>
          <Field label="Full Address" required error={errors.address?.message}>
            <textarea
              rows={3}
              placeholder="House/flat no., street, area, city…"
              {...register('address', { required: 'Address is required' })}
              className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition resize-none
                ${errors.address ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
            />
          </Field>
        </section>

        {/* ── Delivery Assignment ───────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Delivery Assignment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Assign Driver" required error={errors.assignedDriverId?.message}>
              <select
                {...register('assignedDriverId', { required: 'Please select a driver' })}
                disabled={loadingDrivers}
                className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800
                  focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent bg-white transition
                  ${errors.assignedDriverId ? 'border-red-300 bg-red-50' : 'border-slate-200'}
                  disabled:opacity-60`}
              >
                <option value="">
                  {loadingDrivers ? 'Loading drivers…' : '— Select a driver —'}
                </option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.user.name} · Route {d.route} · {d.vehicleType}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Route" required error={errors.route?.message}>
              <select
                {...register('route', { required: 'Route is required' })}
                className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800
                  focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent bg-white transition
                  ${errors.route ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              >
                <option value="">Select Route</option>
                {routeOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>

            <Field label="Tempo Number" required error={errors.tempoNumber?.message}>
              <Input
                hasError={!!errors.tempoNumber}
                placeholder="e.g. T-001, MH12AB1234"
                {...register('tempoNumber', { required: 'Tempo number is required' })}
              />
            </Field>

            <Field label="Rate Per Bottle (₹)" required error={errors.ratePerBottle?.message}>
              <Input
                type="number"
                min="0"
                step="0.01"
                hasError={!!errors.ratePerBottle}
                {...register('ratePerBottle', {
                  required: 'Rate per bottle is required',
                  valueAsNumber: true,
                  min: { value: 0, message: 'Rate must be positive' },
                })}
              />
            </Field>
            {mode === 'new' && (
              <Field label="Opening Balance (₹)" error={errors.openingBalance?.message}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="optional — past dues carried over"
                  hasError={!!errors.openingBalance}
                  {...register('openingBalance', {
                    min: { value: 0, message: 'Must be positive' },
                  })}
                />
                <p className="text-xs text-slate-400 mt-1">
                  If this client owes money from before the system started, enter it here — it'll be
                  recorded as a historical record you can review under "Past Records".
                </p>
              </Field>
            )}
          </div>

          {/* Driver info preview */}
          {selectedDriverId && (() => {
            const d = drivers.find((dr) => dr.id === selectedDriverId);
            if (!d) return null;
            return (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {d.user.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-blue-900">{d.user.name}</p>
                  <p className="text-xs text-blue-600">
                    {d.vehicleType} · {d.vehicleNumber} · Route {d.route}
                  </p>
                </div>
              </div>
            );
          })()}
        </section>

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => navigate('/admin/clients')}
            className="px-6 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || (mode === 'existing' && !selectedCustomer)}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Adding…
              </>
            ) : mode === 'existing' ? (
              <>
                <MapPin size={15} /> Add Location
              </>
            ) : (
              <>
                <Users size={15} /> Add Client
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
