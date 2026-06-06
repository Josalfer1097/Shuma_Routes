'use client';

import { useState, useEffect } from 'react';
import { User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import Image from 'next/image';

interface LoginScreenProps {
  onLogin: (user: string, pass: string) => boolean;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    
    const success = onLogin(username, password);
    if (!success) {
      setError(true);
      // Removed error after animation to allow re-triggering shake
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div 
        className={`w-full max-w-[420px] p-10 md:p-12 rounded-[20px] transition-all duration-600 ease-out transform
          ${isMounted ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}
        `}
        style={{
          backgroundColor: 'rgba(10,22,40,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.06)'
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4">
            <Image 
              src="/shuma_logo.png" 
              alt="Shuma Logo" 
              width={160} 
              height={50}
              priority
              style={{ filter: 'drop-shadow(0 0 12px rgba(33,150,243,0.4))' }}
            />
          </div>
          <h2 className="font-exo text-[13px] tracking-[0.2em] text-shuma-muted uppercase">
            Acceso al sistema
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-shuma-muted group-focus-within:text-shuma-accent transition-colors">
              <User size={18} />
            </div>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#07111E] border border-shuma-border text-shuma-text text-sm rounded-lg pl-10 pr-4 py-3.5 focus:outline-none focus:border-shuma-accent focus:ring-1 focus:ring-shuma-accent transition-all placeholder-transparent peer"
              placeholder="Usuario"
              required
            />
            <label className="absolute left-10 -top-2.5 text-[11px] text-shuma-muted bg-[#07111E] px-1 transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:top-3.5 peer-focus:-top-2.5 peer-focus:text-[11px] peer-focus:text-shuma-accent">
              Usuario
            </label>
          </div>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-shuma-muted group-focus-within:text-shuma-accent transition-colors">
              <Lock size={18} />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#07111E] border border-shuma-border text-shuma-text text-sm rounded-lg pl-10 pr-10 py-3.5 focus:outline-none focus:border-shuma-accent focus:ring-1 focus:ring-shuma-accent transition-all placeholder-transparent peer"
              placeholder="Contraseña"
              required
            />
            <label className="absolute left-10 -top-2.5 text-[11px] text-shuma-muted bg-[#07111E] px-1 transition-all peer-placeholder-shown:text-sm peer-placeholder-shown:top-3.5 peer-focus:-top-2.5 peer-focus:text-[11px] peer-focus:text-shuma-accent">
              Contraseña
            </label>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-shuma-muted hover:text-shuma-text transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          <div className="h-6">
            {error && (
              <div 
                className="flex items-center gap-1.5 text-shuma-danger text-xs font-medium"
                style={{
                  animation: 'shake 400ms cubic-bezier(.36,.07,.19,.97) both'
                }}
              >
                <AlertCircle size={14} />
                <span>Credenciales incorrectas</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-shuma-blue hover:bg-shuma-blue-mid text-white font-exo font-bold tracking-wider py-3.5 rounded-lg transition-all duration-300 hover:shadow-[0_0_15px_rgba(33,150,243,0.4)]"
          >
            INGRESAR
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-[11px] text-shuma-muted">
            © 2025 Grupo Shuma — Todos los derechos reservados
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
      `}</style>
    </div>
  );
}
