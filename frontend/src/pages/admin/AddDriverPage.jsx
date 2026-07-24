import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

function Field({ label, error, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Input({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 text-sm border rounded-xl text-slate-800 placeholder-slate-400
        focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition
        ${props['aria-invalid'] ? 'border-red-300 bg-red-50' : 'border-slate-200'}
        ${className}`}
    />
  );
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '');
}

export default function AddDriverPage() {
  const navigate = useNavigate();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [created, setCreated] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      vehicleType: 'Tempo',
    },
  });

  const nameValue = watch('name', '');
  const passwordValue = watch('password', '');

  function handleNameBlur(e) {
    const slug = slugify(e.target.value);
    if (slug) setValue('loginId', slug, { shouldValidate: false });
  }

  async function onSubmit(data) {
    if (data.password !== data.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    try {
      const res = await api.post('/api/drivers', {
        name: data.name,
        mobile: data.mobile,
        vehicleNumber: data.vehicleNumber.toUpperCase(),
        vehicleType: data.vehicleType,
        route: data.route,
        loginId: data.loginId,
        password: data.password,
      });
      setCreated({ loginId: res.data.user.loginId, name: res.data.user.name, password: data.password });
      toast.success(`Driver created! Login ID: ${res.data.user.loginId}`);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Failed to create driver');
    }
  }

  async function copyField(field, value) {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }

  if (created) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <button
          onClick={() => navigate('/admin/drivers')}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Drivers
        </button>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-5">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Driver Created!</h2>
            <p className="text-slate-500 text-sm mt-1">Share these credentials with {created.name}</p>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 text-left space-y-4">
            <p className="text-sm font-semibold text-blue-900">Share these credentials with the driver:</p>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Login ID</p>
                <p className="text-lg font-bold text-blue-900 font-mono mt-0.5">{created.loginId}</p>
              </div>
              <button
                onClick={() => copyField('loginId', created.loginId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
              >
                {copiedField === 'loginId' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copiedField === 'loginId' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Password</p>
                <p className="text-lg font-bold text-blue-900 font-mono mt-0.5">{created.password}</p>
              </div>
              <button
                onClick={() => copyField('password', created.password)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
              >
                {copiedField === 'password' ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copiedField === 'password' ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="pt-2 border-t border-blue-100">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">App</p>
              <p className="text-sm text-blue-800 mt-0.5">AquaERP Driver App</p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setCreated(null)}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Add Another
            </button>
            <button
              onClick={() => navigate('/admin/drivers')}
              className="flex-1 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-sm font-semibold text-white transition-colors"
            >
              View All Drivers
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
          onClick={() => navigate('/admin/drivers')}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Add New Driver</h1>
          <p className="text-slate-500 text-sm">Create login credentials and vehicle info</p>
        </div>
      </div>

      {/* Form card */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 space-y-6">

        {/* Section: Personal */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Personal Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Driver Name *" error={errors.name?.message}>
              <Input
                placeholder="e.g. Ramesh Kumar"
                aria-invalid={!!errors.name}
                {...register('name', { required: 'Name is required' })}
                onBlur={handleNameBlur}
              />
            </Field>
            <Field label="Mobile Number *" error={errors.mobile?.message}>
              <Input
                placeholder="10-digit mobile"
                type="tel"
                maxLength={10}
                aria-invalid={!!errors.mobile}
                {...register('mobile', {
                  required: 'Mobile number is required',
                  pattern: { value: /^[6-9]\d{9}$/, message: 'Enter a valid 10-digit mobile number' },
                })}
              />
            </Field>
          </div>
        </div>

        {/* Section: Vehicle */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Vehicle Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Vehicle Number *" error={errors.vehicleNumber?.message}>
              <Input
                placeholder="e.g. MH12AB1234"
                aria-invalid={!!errors.vehicleNumber}
                {...register('vehicleNumber', {
                  required: 'Vehicle number is required',
                  pattern: { value: /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/i, message: 'Enter a valid vehicle number (e.g. MH12AB1234)' },
                })}
              />
            </Field>
            <Field label="Vehicle Type *" error={errors.vehicleType?.message}>
              <select
                aria-invalid={!!errors.vehicleType}
                {...register('vehicleType', { required: 'Select a vehicle type' })}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent bg-white"
              >
                <option value="Tempo">Tempo</option>
                <option value="Auto">Auto</option>
                <option value="Bike">Bike</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Route *" error={errors.route?.message}>
              <Input
                placeholder="e.g. 1, 2, Route A"
                aria-invalid={!!errors.route}
                {...register('route', { required: 'Route is required' })}
              />
            </Field>
          </div>
        </div>

        {/* Section: Login */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">Login Credentials</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Login ID *"
              error={errors.loginId?.message}
            >
              <Input
                placeholder="auto-generated from name"
                aria-invalid={!!errors.loginId}
                {...register('loginId', {
                  required: 'Login ID is required',
                  minLength: { value: 3, message: 'At least 3 characters' },
                  pattern: { value: /^[a-z0-9._]+$/, message: 'Only lowercase letters, numbers, dots, underscores' },
                })}
              />
            </Field>

            <div /> {/* spacer */}

            <Field label="Password *" error={errors.password?.message}>
              <div className="relative">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  className="pr-10"
                  aria-invalid={!!errors.password}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: { value: 6, message: 'At least 6 characters' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Field label="Confirm Password *" error={errors.confirmPassword?.message}>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  className="pr-10"
                  aria-invalid={!!errors.confirmPassword}
                  {...register('confirmPassword', {
                    required: 'Please confirm the password',
                    validate: (v) => v === passwordValue || 'Passwords do not match',
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => navigate('/admin/drivers')}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
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
                Creating…
              </>
            ) : (
              'Create Driver'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
