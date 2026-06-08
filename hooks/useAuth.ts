import { useState, useEffect } from 'react';

function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = getCookie('shuma_auth');
      setIsAuthenticated(auth === '1');
    }
  }, []);

  const login = (user: string, pass: string) => {
    if (user === 'root' && pass === '1649') {
      setCookie('shuma_auth', '1');
      localStorage.setItem('shuma_auth', '1');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    deleteCookie('shuma_auth');
    localStorage.removeItem('shuma_auth');
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
}
