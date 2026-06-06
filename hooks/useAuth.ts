import { useState, useEffect } from 'react';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = localStorage.getItem('shuma_auth');
      setIsAuthenticated(auth === '1');
    }
  }, []);

  const login = (user: string, pass: string) => {
    if (user === 'root' && pass === '1649') {
      localStorage.setItem('shuma_auth', '1');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('shuma_auth');
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
}
