'use client';

import { useState, useEffect } from 'react';
import LoginScreen from './LoginScreen';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setIsAuthenticated(localStorage.getItem('shuma_auth') === '1');
    setChecked(true);
  }, []);

  const handleLogin = (user: string, pass: string) => {
    if (user === 'root' && pass === '1649') {
      localStorage.setItem('shuma_auth', '1');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  if (!checked) return null; // evitar flash
  if (!isAuthenticated) return <LoginScreen onLogin={handleLogin} />;
  return <>{children}</>;
}
