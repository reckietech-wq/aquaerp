import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Truck,
  Users,
  FileText,
  Receipt,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Package,
  PackageCheck,
  Menu,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { to: '/admin/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/admin/drivers',    label: 'Drivers',    icon: Truck },
  { to: '/admin/clients',    label: 'Clients',    icon: Users },
  { to: '/admin/deliveries', label: 'Deliveries', icon: PackageCheck },
  { to: '/admin/invoices',   label: 'Invoices',   icon: FileText },
  { to: '/admin/billing',   label: 'Billing',   icon: Receipt   },
  { to: '/admin/inventory', label: 'Inventory', icon: Package   },
  { to: '/admin/reports',   label: 'Reports',   icon: BarChart3 },
];

function SidebarLink({ to, label, icon: Icon, collapsed, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/admin/dashboard'}
      title={collapsed ? label : undefined}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
          isActive
            ? 'bg-white/15 text-white'
            : 'text-blue-200 hover:bg-white/10 hover:text-white'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span>{label}</span>}
    </NavLink>
  );
}

// Shared sidebar content used by both the desktop rail and the mobile drawer.
function SidebarContent({ collapsed, user, onLogout, onNavigate, onCollapseToggle, showCollapseToggle }) {
  return (
    <>
      {/* Brand */}
      <div
        className={`flex items-center gap-3 px-4 py-4 border-b border-white/10 ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <img src="/logo.png" alt="Gajanan Aqua" className="h-10 w-10 rounded-lg object-cover shrink-0" />
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight">Gajanan Aqua</span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon }) => (
          <SidebarLink key={to} to={to} label={label} icon={icon} collapsed={collapsed} onClick={onNavigate} />
        ))}
      </nav>

      {/* User strip + collapse toggle */}
      <div className="px-2 py-4 border-t border-white/10 space-y-1 shrink-0">
        {!collapsed && (
          <div className="px-3 py-2">
            <p className="text-white text-sm font-medium truncate">{user?.name}</p>
            <p className="text-blue-300 text-xs">Administrator</p>
          </div>
        )}
        <button
          onClick={onLogout}
          title="Sign out"
          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-colors ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
        {showCollapseToggle && (
          <button
            onClick={onCollapseToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {collapsed ? (
              <ChevronRight size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                <span>Collapse</span>
              </>
            )}
          </button>
        )}
      </div>
    </>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer whenever the route changes (link click, back button, etc.)
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const activeLabel = navItems.find((n) =>
    n.to === '/admin/dashboard' ? location.pathname === n.to : location.pathname.startsWith(n.to)
  )?.label ?? 'Dashboard';

  return (
    <div className="flex h-screen bg-slate-50 overflow-x-hidden">

      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col bg-blue-900 shrink-0 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <SidebarContent
          collapsed={collapsed}
          user={user}
          onLogout={handleLogout}
          onCollapseToggle={() => setCollapsed((c) => !c)}
          showCollapseToggle
        />
      </aside>

      {/* ── Mobile off-canvas drawer ────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col bg-blue-900 shadow-2xl transform transition-transform duration-200 ease-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="flex items-center justify-end px-2 pt-2">
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <SidebarContent
          collapsed={false}
          user={user}
          onLogout={handleLogout}
          onNavigate={() => setMobileOpen(false)}
          showCollapseToggle={false}
        />
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top header */}
        <header className="flex items-center gap-3 px-4 md:px-6 py-3 bg-white border-b border-slate-200 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-2 md:hidden min-w-0">
            <img src="/logo.png" alt="Gajanan Aqua" className="h-8 w-8 rounded-lg object-cover shrink-0" />
            <span className="text-blue-900 font-bold text-base truncate">{activeLabel}</span>
          </div>
          <div className="hidden md:block flex-1" />

          <div className="flex items-center gap-3 ml-auto shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">Administrator</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-900 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
