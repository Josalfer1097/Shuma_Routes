"use client";
import { useState, useEffect } from "react";
import LoginScreen from "./LoginScreen";

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

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const val = getCookie('shuma_auth');
    setIsAuthenticated(val === '1');
    setChecked(true);
  }, []);

  const handleLogin = (user: string, pass: string): boolean => {
    if (user === 'root' && pass === '1649') {
      setCookie('shuma_auth', '1');
      localStorage.setItem('shuma_auth', '1');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    deleteCookie('shuma_auth');
    localStorage.removeItem('shuma_auth');
    setIsAuthenticated(false);
  };

  if (!checked) return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#050C1A',
      zIndex: 99999
    }} />
  );

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <>{children}</>;
}
