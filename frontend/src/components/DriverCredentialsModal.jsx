import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Copy, CheckCircle2, Eye, EyeOff, MapPin, Phone, Smartphone } from 'lucide-react';
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

function Input({ hasError, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
        focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition
        ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'} ${className}`}
    />
  );
}

export default function DriverCredentialsModal({ driver, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [clients, setClients] = useState([]);
  const [copiedLoginId, setCopiedLoginId] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [editingLoginId, setEditingLoginId] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [deactivating, setDeactivating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm();

  const loginIdValue = watch('loginId', '');
  const newPasswordValue = watch('newPassword', '');
  const confirmPasswordValue = watch('confirmPassword', '');

  useEffect(() => {
    Promise.all([
      api.get(`/api/drivers/${driver.id}/credentials`),
      api.get(`/api/drivers/${driver.id}`),
    ])
      .then(([credRes, detailRes]) => {
        setData(credRes.data);
        setClients(detailRes.data.clients ?? []);
        setIsActive(credRes.data.isActive);
        reset({
          name: credRes.data.name,
          mobile: credRes.data.mobile,
          vehicleNumber: credRes.data.vehicleNumber,
          vehicleType: credRes.data.vehicleType,
          route: credRes.data.route,
          loginId: credRes.data.user.loginId,
          newPassword: '',
          confirmPassword: '',
        });
      })
      .catch(() => toast.error('Failed to load driver credentials'))
      .finally(() => setLoading(false));
  }, [driver.id, reset]);

  async function handleDeactivate() {
    if (!confirm(`Deactivate ${driver.user.name}? They will no longer be able to log in.`)) return;
    setDeactivating(true);
    try {
      await api.delete(`/api/drivers/${driver.id}`);
      toast.success('Driver deactivated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to deactivate driver');
    } finally {
      setDeactivating(false);
    }
  }

  async function copyText(text, setFlag) {
    await navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  }

  async function onSubmit(formData) {
    if (changePassword) {
      if (!formData.newPassword || !formData.confirmPassword) {
        toast.error('Enter and confirm the new password');
        return;
      }
      if (formData.newPassword !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (formData.newPassword.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
    }

    const loginIdChanged = formData.loginId !== data.user.loginId;
    const passwordChanged = changePassword && !!formData.newPassword;

    try {
      const updated = await api.put(`/api/drivers/${driver.id}/credentials`, {
        name: formData.name,
        mobile: formData.mobile,
        vehicleNumber: formData.vehicleNumber.toUpperCase(),
        vehicleType: formData.vehicleType,
        route: formData.route,
        isActive,
        loginId: formData.loginId,
        ...(passwordChanged && { newPassword: formData.newPassword }),
      });

      toast.success('Driver details updated successfully');
      if (loginIdChanged || passwordChanged) {
        toast('Share new credentials with the driver', { icon: '📱' });
      }
      onSaved(updated.data);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to update driver');
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[780px] my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-900 flex items-center justify-center text-white font-bold">
              {driver.user.name[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-800">Manage Driver</p>
              <p className="text-xs text-slate-400">{driver.user.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading || !data ? (
          <div className="p-10 flex justify-center">
            <span className="w-6 h-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* LEFT: Driver Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Driver Details</h3>

                <Field label="Full Name" error={errors.name?.message}>
                  <Input hasError={!!errors.name} {...register('name', { required: 'Required' })} />
                </Field>
                <Field label="Mobile Number" error={errors.mobile?.message}>
                  <Input
                    type="tel"
                    maxLength={10}
                    hasError={!!errors.mobile}
                    {...register('mobile', {
                      required: 'Required',
                      pattern: { value: /^[6-9]\d{9}$/, message: 'Invalid mobile number' },
                    })}
                  />
                </Field>
                <Field label="Vehicle Number" error={errors.vehicleNumber?.message}>
                  <Input
                    hasError={!!errors.vehicleNumber}
                    {...register('vehicleNumber', {
                      required: 'Required',
                      pattern: { value: /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/i, message: 'Invalid vehicle number' },
                    })}
                  />
                </Field>
                <Field label="Vehicle Type">
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
                  <Input hasError={!!errors.route} {...register('route', { required: 'Required' })} />
                </Field>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-medium text-slate-700">Active Status</span>
                  <button
                    type="button"
                    onClick={() => setIsActive((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-slate-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        isActive ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {isActive && (
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={deactivating}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
                  >
                    {deactivating ? 'Deactivating…' : 'Deactivate Driver'}
                  </button>
                )}
              </div>

              {/* RIGHT: Login Credentials */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Login Credentials</h3>

                {/* Login ID box */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Login ID</label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly={!editingLoginId}
                      hasError={!!errors.loginId}
                      className={!editingLoginId ? 'bg-slate-100 text-slate-500 cursor-default' : ''}
                      {...register('loginId', {
                        required: 'Login ID is required',
                        minLength: { value: 3, message: 'At least 3 characters' },
                        pattern: { value: /^[a-zA-Z0-9._@-]+$/, message: 'Invalid characters' },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => copyText(loginIdValue || data.user.loginId, setCopiedLoginId)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                    >
                      {copiedLoginId ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                  {errors.loginId && <p className="text-xs text-red-500">{errors.loginId.message}</p>}

                  {!editingLoginId ? (
                    <button
                      type="button"
                      onClick={() => setEditingLoginId(true)}
                      className="text-xs font-medium text-blue-700 hover:text-blue-900 transition-colors"
                    >
                      Change Login ID
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        Driver must use new Login ID immediately
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingLoginId(false);
                          reset((prev) => ({ ...prev, loginId: data.user.loginId }));
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Password box */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Password</label>
                  <Input readOnly value="••••••••" className="bg-slate-100 text-slate-500 cursor-default tracking-widest" />

                  {!changePassword ? (
                    <button
                      type="button"
                      onClick={() => setChangePassword(true)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                    >
                      Reset Password
                    </button>
                  ) : (
                    <div className="space-y-3 bg-slate-50 rounded-xl p-3.5">
                      <Field label="New Password">
                        <div className="relative">
                          <Input
                            type={showNewPass ? 'text' : 'password'}
                            placeholder="Min 6 characters"
                            className="pr-10"
                            {...register('newPassword', { minLength: { value: 6, message: 'At least 6 characters' } })}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPass((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </Field>
                      <Field
                        label="Confirm Password"
                        error={
                          confirmPasswordValue && confirmPasswordValue !== newPasswordValue
                            ? 'Passwords do not match'
                            : undefined
                        }
                      >
                        <div className="relative">
                          <Input
                            type={showConfirmPass ? 'text' : 'password'}
                            placeholder="Re-enter password"
                            className="pr-10"
                            hasError={confirmPasswordValue && confirmPasswordValue !== newPasswordValue}
                            {...register('confirmPassword')}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPass((s) => !s)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </Field>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!newPasswordValue || !confirmPasswordValue) {
                              toast.error('Enter and confirm the new password');
                              return;
                            }
                            if (newPasswordValue !== confirmPasswordValue) {
                              toast.error('Passwords do not match');
                              return;
                            }
                            if (newPasswordValue.length < 6) {
                              toast.error('Password must be at least 6 characters');
                              return;
                            }
                            toast.success('Password will be updated when you save changes');
                          }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                        >
                          Update Password
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setChangePassword(false);
                            reset((prev) => ({ ...prev, newPassword: '', confirmPassword: '' }));
                          }}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">Password change is applied when you click Save Changes below.</p>
                    </div>
                  )}
                </div>

                {/* Share card */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                    <Smartphone size={14} /> Share with Driver
                  </p>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>App: <span className="font-medium">AquaERP Driver App</span></p>
                    <div className="flex items-center gap-2">
                      <span>Login ID: <span className="font-mono font-medium">{loginIdValue || data.user.loginId}</span></span>
                      <button
                        type="button"
                        onClick={() => copyText(loginIdValue || data.user.loginId, setCopiedCard)}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                      >
                        {copiedCard ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                        {copiedCard ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p>
                      Password:{' '}
                      <span className="font-mono font-medium">
                        {changePassword && newPasswordValue ? newPasswordValue : '(set new to share)'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Assigned Clients */}
            <div className="border-t border-slate-100 px-6 py-5">
              <h3 className="text-sm font-semibold text-slate-600 mb-3">
                Assigned Clients
                <span className="ml-2 text-xs font-normal text-slate-400">({clients.length} clients assigned)</span>
              </h3>
              {clients.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No clients assigned</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {clients.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.address}</p>
                      </div>
                      <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                        <MapPin size={10} /> {c.route}
                      </span>
                      <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                        <Phone size={10} /> {c.mobile}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
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
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 disabled:opacity-60 text-sm font-semibold text-white transition-colors flex items-center gap-2"
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
        )}
      </div>
    </div>
  );
}
