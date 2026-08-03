import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, CheckCircle2, Users } from 'lucide-react';
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

export default function AddClientPage() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [created, setCreated] = useState(null);

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
      const driverName =
        drivers.find((d) => d.id === data.assignedDriverId)?.user?.name ?? 'selected driver';
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
            <h2 className="text-xl font-bold text-slate-800">Client Added!</h2>
            <p className="text-slate-500 text-sm mt-2">
              <span className="font-semibold text-slate-700">{created.name}</span> has been added
              and assigned to Driver{' '}
              <span className="font-semibold text-slate-700">{created.driverName}</span>.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCreated(null)}
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
          <h1 className="text-2xl font-bold text-slate-800">Add New Client</h1>
          <p className="text-slate-500 text-sm">Register a new water can delivery client</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-7"
      >
        {/* ── Personal Info ─────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Client Info
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client Name" required error={errors.name?.message}>
              <Input
                hasError={!!errors.name}
                placeholder="e.g. Rajesh Sharma"
                {...register('name', { required: 'Client name is required' })}
              />
            </Field>
            <Field label="Mobile Number" required error={errors.mobile?.message}>
              <Input
                hasError={!!errors.mobile}
                placeholder="10-digit mobile"
                type="tel"
                maxLength={10}
                {...register('mobile', {
                  required: 'Mobile number is required',
                  pattern: {
                    value: /^[6-9]\d{9}$/,
                    message: 'Enter a valid 10-digit mobile number',
                  },
                })}
              />
            </Field>
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
            disabled={isSubmitting}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Adding…
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
