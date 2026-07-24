import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { X, AlertTriangle, MapPin, Phone, User, Copy, CheckCircle2, KeyRound, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

function Field({ label, error, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
        focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition
        ${props['aria-invalid'] ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
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
            <p className="font-semibold text-slate-800">Deactivate Driver?</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {name} will be marked inactive and cannot log in.
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

function ResetPasswordForm({ driverId, onDone, onCancel }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!newPassword || !confirmPassword) {
      toast.error('Enter and confirm the new password');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/drivers/${driverId}/reset-password`, { newPassword, confirmPassword });
      toast.success('Password updated');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3 mt-3">
      <Field label="New Password">
        <Input
          type="password"
          placeholder="Min 6 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm Password">
        <Input
          type="password"
          placeholder="Re-enter password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </Field>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2 rounded-lg bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function EditDriverModal({ driver, onClose, onSaved }) {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [copiedLoginId, setCopiedLoginId] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm();

  useEffect(() => {
    reset({
      name: driver.user.name,
      mobile: driver.user.mobile,
      vehicleNumber: driver.vehicleNumber,
      vehicleType: driver.vehicleType,
      route: driver.route,
    });

    api.get(`/api/drivers/${driver.id}`)
      .then((res) => setClients(res.data.clients ?? []))
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, [driver, reset]);

  async function onSubmit(data) {
    try {
      await api.put(`/api/drivers/${driver.id}`, {
        name: data.name,
        mobile: data.mobile,
        vehicleNumber: data.vehicleNumber.toUpperCase(),
        vehicleType: data.vehicleType,
        route: data.route,
      });
      toast.success('Driver updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to update driver');
    }
  }

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      await api.delete(`/api/drivers/${driver.id}`);
      toast.success('Driver deactivated');
      setShowConfirm(false);
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to deactivate driver');
    } finally {
      setDeactivating(false);
    }
  }

  async function copyLoginId() {
    await navigator.clipboard.writeText(driver.user.loginId);
    setCopiedLoginId(true);
    setTimeout(() => setCopiedLoginId(false), 2000);
  }

  function handleEditClient(clientId) {
    onClose();
    navigate(`/admin/clients?edit=${clientId}`);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg my-auto">
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold">
                {driver.user.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-slate-800">{driver.user.name}</p>
                <p className="text-xs text-slate-400">ID: {driver.user.loginId}</p>
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
            {/* Personal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name" error={errors.name?.message}>
                <Input
                  placeholder="Driver name"
                  aria-invalid={!!errors.name}
                  {...register('name', { required: 'Name is required' })}
                />
              </Field>
              <Field label="Mobile" error={errors.mobile?.message}>
                <Input
                  placeholder="10-digit mobile"
                  type="tel"
                  maxLength={10}
                  aria-invalid={!!errors.mobile}
                  {...register('mobile', {
                    required: 'Mobile is required',
                    pattern: { value: /^[6-9]\d{9}$/, message: 'Invalid mobile number' },
                  })}
                />
              </Field>
            </div>

            {/* Vehicle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Vehicle Number" error={errors.vehicleNumber?.message}>
                <Input
                  placeholder="e.g. MH12AB1234"
                  aria-invalid={!!errors.vehicleNumber}
                  {...register('vehicleNumber', {
                    required: 'Vehicle number is required',
                    pattern: { value: /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/i, message: 'Invalid vehicle number' },
                  })}
                />
              </Field>
              <Field label="Vehicle Type" error={errors.vehicleType?.message}>
                <select
                  {...register('vehicleType', { required: true })}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white"
                >
                  <option value="Tempo">Tempo</option>
                  <option value="Auto">Auto</option>
                  <option value="Bike">Bike</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Route" error={errors.route?.message}>
                <Input
                  placeholder="e.g. 1, Route A"
                  aria-invalid={!!errors.route}
                  {...register('route', { required: 'Route is required' })}
                />
              </Field>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              {driver.isActive && (
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
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </form>

          {/* Login Credentials */}
          <div className="border-t border-slate-100 px-6 py-5">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">Login Credentials</h3>

            <div className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 mb-0.5">Login ID</p>
                <p className="text-sm font-mono font-medium text-slate-800 truncate">{driver.user.loginId}</p>
              </div>
              <button
                onClick={copyLoginId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-white transition-colors shrink-0"
              >
                {copiedLoginId ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                {copiedLoginId ? 'Copied!' : 'Copy Login ID'}
              </button>
            </div>

            {!showResetPassword ? (
              <button
                type="button"
                onClick={() => setShowResetPassword(true)}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
              >
                <KeyRound size={15} /> Reset Password
              </button>
            ) : (
              <ResetPasswordForm
                driverId={driver.id}
                onDone={() => setShowResetPassword(false)}
                onCancel={() => setShowResetPassword(false)}
              />
            )}
          </div>

          {/* Assigned clients */}
          <div className="border-t border-slate-100 px-6 py-5">
            <h3 className="text-sm font-semibold text-slate-600 mb-3">
              Assigned Clients
              {!loadingClients && (
                <span className="ml-2 text-xs font-normal text-slate-400">({clients.length})</span>
              )}
            </h3>

            {loadingClients ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : clients.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No clients assigned</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {clients.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5"
                  >
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400 truncate">{c.address}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Phone size={9} /> {c.mobile}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                      <MapPin size={10} /> {c.route}
                    </span>
                    <button
                      onClick={() => handleEditClient(c.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
                      title="Edit client"
                    >
                      <Pencil size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Confirm deactivate dialog */}
      {showConfirm && (
        <ConfirmDialog
          name={driver.user.name}
          onConfirm={handleDeactivate}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
