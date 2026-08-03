import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { List, ClipboardCheck, LogOut } from 'lucide-react';

const bottomNav = [
  { to: '/driver/dashboard', label: 'My Clients', icon: List },
  { to: '/driver/summary',   label: 'Summary',    icon: ClipboardCheck },
];

export default function DriverLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {/* ── Top header ───────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-blue-900 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">💧</span>
          <div>
            <p className="font-bold text-base leading-tight">Gajanan Aqua</p>
            <p className="text-blue-300 text-xs leading-tight">Driver Panel</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold leading-tight">{user?.name}</p>
            <p className="text-blue-300 text-xs leading-tight">Driver</p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Sign out"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      {/* ── Bottom nav ───────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex">
        {bottomNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                isActive ? 'text-blue-900' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
