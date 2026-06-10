'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Calendar, ChevronRight } from 'lucide-react';

export default function HistoryPage() {
  const router = useRouter();
  const [routesDB, setRoutesDB] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const role = sessionStorage.getItem('shuma_role');
    if (!role || role === 'driver') {
      router.push('/');
      return;
    }

    async function loadHistory() {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .eq('is_latest', true)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!error && data) {
        setRoutesDB(data);
      }
      setLoading(false);
    }
    loadHistory();
  }, [router]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-shuma-bg p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.back()}
            className="p-2 bg-shuma-surface border border-shuma-border rounded-xl hover:bg-shuma-blue/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Histórico de Rutas</h1>
            <p className="text-sm text-shuma-muted">Consulta de rutas optimizadas anteriores</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-shuma-muted">Cargando histórico...</div>
        ) : (
          <div className="bg-shuma-surface rounded-xl border border-shuma-border overflow-hidden">
            <div className="p-4 border-b border-shuma-border flex justify-between items-center">
              <h2 className="text-sm font-bold text-white">Últimas 50 Rutas</h2>
            </div>
            <div className="divide-y divide-shuma-border/50">
              {routesDB.map((r) => (
                <div key={r.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors cursor-pointer">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{new Date(r.created_at).toLocaleDateString()}</p>
                      <p className="text-xs text-shuma-muted">Creada por: {r.created_by || 'Sistema'} | Version: {r.version}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-200">{r.total_deliveries} Entregas</p>
                      <p className="text-xs text-shuma-muted">{r.total_drivers} Choferes</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-shuma-muted" />
                  </div>
                </div>
              ))}
              {routesDB.length === 0 && (
                <div className="p-8 text-center text-shuma-muted text-sm">
                  No hay rutas en el histórico.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
