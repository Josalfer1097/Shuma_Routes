"use client";

import { useState, useEffect } from "react";
import LoginScreen from "./LoginScreen";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const val = localStorage.getItem("shuma_auth");
    setIsAuthenticated(val === "1");
    setChecked(true);
  }, []);

  const handleLogin = (user: string, pass: string): boolean => {
    if (user === "root" && pass === "1649") {
      localStorage.setItem("shuma_auth", "1");
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem("shuma_auth");
    setIsAuthenticated(false);
  };

  if (!checked) return null;

  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <>{children}</>;
}
