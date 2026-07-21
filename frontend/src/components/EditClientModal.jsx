import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, AlertTriangle, PackageCheck, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

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

function Input({ hasError, ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
        focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition
        ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}
    />
  );
}

function ConfirmDialog({ name, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Deactivate Client?</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {name} will be marked inactive.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white"
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
    }`}>
      {status === 'COMPLETED' ? 'Done' : 'Pending'}
    </span>
  );
}

export default function EditClientModal({ client, drivers, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const activeDrivers = drivers.filter((d) => d.isActive);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm();

  const selectedDriverId = watch('assignedDriverId');

  useEffect(() => {
    reset({
      name: client.name,
      mobile: client.mobile,
      email: client.email ?? '',
      address: client.address,
      assignedDriverId: client.assignedDriverId,
      tempoNumber: client.tempoNumber,
      route: client.route,
    });

    api.get(`/api/clients/${client.id}`)
      .then((res) => setDetail(res.data))
      .catch(() => {})
      .finally(() => setLoadingDetail(false));
  }, [client, reset]);

  // Auto-fill route on driver change (only if driver actually changes)
  useEffect(() => {
    if (!selectedDriverId || selectedDriverId === client.assignedDriverId) return;
    const driver = activeDrivers.find((d) => d.id === selectedDriverId);
    if (driver) setValue('route', driver.route);
  }, [selectedDriverId]);

  async function onSubmit(data) {
    try {
      await api.put(`/api/clients/${client.id}`, {
        name: data.name,
        mobile: data.mobile,
        email: data.email || undefined,
        address: data.address,
        assignedDriverId: data.assignedDriverId,
        tempoNumber: data.tempoNumber,
        route: data.route,
      });
      toast.success('Client updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to update client');
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      await api.delete(`/api/clients/${client.id}`);
      toast.success('Client deactivated');
      setShowConfirm(false);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to deactivate');
    } finally {
      setDeactivating(false);
    }
  }

  const deliveries = detail?.deliveries ?? [];
  const totalDelivered = deliveries.reduce((s, d) => s + (d.filledBottlesDelivered ?? 0), 0);
  const totalEmpty = deliveries.reduce((s, d) => s + (d.emptyBottlesCollected ?? 0), 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl my-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold">
                {client.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{client.name}</p>
                <p className="text-xs text-slate-400">{client.mobile}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">

            {/* Client Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Client Name" required error={errors.name?.message}>
                <Input
                  hasError={!!errors.name}
                  {...register('name', { required: 'Required' })}
                />
              </Field>
              <Field label="Mobile" required error={errors.mobile?.message}>
                <Input
                  hasError={!!errors.mobile}
                  type="tel"
                  maxLength={10}
                  {...register('mobile', {
                    required: 'Required',
                    pattern: { value: /^[6-9]\d{9}$/, message: 'Invalid mobile number' },
                  })}
                />
              </Field>
              <Field label="Email" error={errors.email?.message}>
                <Input
                  hasError={!!errors.email}
                  type="email"
                  placeholder="optional"
                  {...register('email', {
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
                  })}
                />
              </Field>
            </div>

            <Field label="Address" required error={errors.address?.message}>
              <textarea
                rows={2}
                {...register('address', { required: 'Required' })}
                className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
                  focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition resize-none
                  ${errors.address ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
              />
            </Field>

            {/* Assignment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Assigned Driver" required error={errors.assignedDriverId?.message}>
                <select
                  {...register('assignedDriverId', { required: 'Required' })}
                  className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800
                    focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white transition
                    ${errors.assignedDriverId ? 'border-red-300' : 'border-slate-200'}`}
                >
                  <option value="">— Select driver —</option>
                  {activeDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.user.name} · Route {d.route}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Route" required error={errors.route?.message}>
                <Input
                  hasError={!!errors.route}
                  {...register('route', { required: 'Required' })}
                />
              </Field>
              <Field label="Tempo Number" required error={errors.tempoNumber?.message}>
                <Input
                  hasError={!!errors.tempoNumber}
                  {...register('tempoNumber', { required: 'Required' })}
                />
              </Field>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              {client.isActive && (
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
                >
                  Deactivate
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isDirty}
                className="px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-sm font-semibold text-white transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving…
                  </>
                ) : 'Save Changes'}
              </button>
            </div>
          </form>

          {/* Delivery history summary */}
          <div className="border-t border-slate-100 px-6 py-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                <PackageCheck size={15} className="text-slate-400" />
                Delivery History
              </h3>
              {!loadingDetail && deliveries.length > 0 && (
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>
                    <span className="font-semibold text-slate-700">{totalDelivered}</span> delivered
                  </span>
                  <span>
                    <span className="font-semibold text-slate-700">{totalEmpty}</span> collected
                  </span>
                </div>
              )}
            </div>

            {loadingDetail ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No deliveries recorded yet</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-700 font-medium">
                        {d.filledBottlesDelivered} delivered
                      </span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-500">{d.emptyBottlesCollected} empty</span>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{fmtDate(d.deliveryDate)}</span>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          name={client.name}
          onConfirm={handleDeactivate}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
