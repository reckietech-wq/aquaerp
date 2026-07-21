import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

// Bypass login — auto-sign-in as admin on startup
const AUTO_LOGIN_ID = 'admin';
const AUTO_LOGIN_PW = 'admin123';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      // Validate existing token
      api.get('/api/auth/me')
        .then((res) => { setUser(res.data); setIsLoading(false); })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          autoLogin();
        });
    } else {
      autoLogin();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function autoLogin() {
    try {
      const res = await api.post('/api/auth/login', { loginId: AUTO_LOGIN_ID, password: AUTO_LOGIN_PW });
      const { token: newToken, user: newUser } = res.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } catch {
      // ignore — user will see login page if auto-login fails
    } finally {
      setIsLoading(false);
    }
  }

  async function login(loginId, password) {
    const res = await api.post('/api/auth/login', { loginId, password });
    const { token: newToken, user: newUser } = res.data;
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    // Re-auto-login after logout
    autoLogin();
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
