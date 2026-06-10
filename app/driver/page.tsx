'use client';

import Link from 'next/link';

export default function DriverIndexPage() {
  const handleLogout = () => {
    sessionStorage.removeItem('shuma_auth');
    sessionStorage.removeItem('shuma_role');
    sessionStorage.removeItem('shuma_user');
    sessionStorage.removeItem('shuma_name');
    sessionStorage.removeItem('shuma_driver_id');
    window.location.href = '/';
  };

  const name = typeof window !== 'undefined' ? sessionStorage.getItem('shuma_name') || 'Chofer' : 'Chofer';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0F172A] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Bienvenido, {name}</h2>
      <p className="text-sm text-slate-400 max-w-xs mb-6">
        Tu ruta será asignada pronto.
      </p>
      <button
        onClick={handleLogout}
        className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700
                   text-white text-sm font-medium transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
