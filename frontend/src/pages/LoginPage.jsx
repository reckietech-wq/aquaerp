import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ loginId: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Already logged in — redirect in effect (not during render)
  useEffect(() => {
    if (user) {
      navigate(user.role === 'ADMIN' ? '/admin/dashboard' : '/driver/dashboard', { replace: true });
    }
  }, [user, navigate]);

  if (isLoading) return null;

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.loginId || !form.password) {
      toast.error('Please enter your login ID and password');
      return;
    }
    setLoading(true);
    try {
      const loggedUser = await login(form.loginId, form.password);
      toast.success(`Welcome, ${loggedUser.name}!`);
      navigate(loggedUser.role === 'ADMIN' ? '/admin/dashboard' : '/driver/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur mb-4">
            <span className="text-3xl">💧</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">AquaERP</h1>
          <p className="text-blue-300 text-sm mt-1">Water Can Delivery Management</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="loginId" className="block text-sm font-medium text-slate-700 mb-1">
                Login ID
              </label>
              <input
                id="loginId"
                name="loginId"
                type="text"
                autoComplete="username"
                autoFocus
                value={form.loginId}
                onChange={handleChange}
                placeholder="Enter your login ID"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="w-full px-3.5 py-2.5 pr-16 rounded-lg border border-slate-200 text-slate-800 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-blue-900 hover:text-blue-700"
                  tabIndex={-1}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-900 hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-blue-400 text-xs mt-6">
          © {new Date().getFullYear()} AquaERP · All rights reserved
        </p>
      </div>
    </div>
  );
}
