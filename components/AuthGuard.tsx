'use client';

import { useAuth } from '@/hooks/useAuth';
import LoginScreen from './LoginScreen';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, login } = useAuth();

  // Пока не знаем состояние (чтение localStorage), можно показать null или loader
  // pero como es rápido en cliente, null evita parpadeos incómodos
  if (isAuthenticated === null) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={login} />;
  }

  return <>{children}</>;
}
