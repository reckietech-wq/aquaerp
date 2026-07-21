import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-8 h-8 border-4 border-blue-900 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Forbidden() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
      <p className="text-6xl font-bold text-blue-900">403</p>
      <p className="text-slate-500 text-lg">You don't have permission to view this page.</p>
    </div>
  );
}

export default function ProtectedRoute({ children, role }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Forbidden />;

  return children;
}
