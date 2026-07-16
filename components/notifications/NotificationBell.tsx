'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import { Bell, CheckCircle, XCircle } from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationBell({
  targetRole,
  onNavigateToRoute,
}: {
  targetRole: string;
  onNavigateToRoute?: (entityId: string) => void;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [isReminderPulse, setIsReminderPulse] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  // Notificaciones que requieren acción del admin (aprobar/rechazar) — no se limpian solo por abrir el panel
  const pendingActionCount = notifications.filter(
    n => n.type === 'route_closure_requested' || n.type === 'reopen_requested'
  ).length;

  // Recordatorio: cada 5 min, si sigue habiendo algo pendiente de acción, pulsa la campana
  useEffect(() => {
    if (pendingActionCount === 0) return;
    const reminderInterval = setInterval(() => {
      setIsReminderPulse(true);
      setTimeout(() => setIsReminderPulse(false), 1500);
    }, 5 * 60 * 1000);
    return () => clearInterval(reminderInterval);
  }, [pendingActionCount]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/notifications?target_role=${targetRole}`);
      const json = await res.json();
      if (json.ok) {
        setNotifications(json.notifications || []);
        setUnreadCount((json.notifications || []).filter((n: Notification) => !n.read).length);
      }
    } catch (e) {
      console.error('Error fetching notifications', e);
    }
  };

  useEffect(() => {
    if (!targetRole) return;
    fetchNotifications();
    // Polling: Realtime sobre 'notifications' no funciona con anon key (RLS activo)
    const notifPolling = setInterval(fetchNotifications, 30000);

    const channel = supabase
      .channel(`notifications_${targetRole}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `target_role=eq.${targetRole}` }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => {
      clearInterval(notifPolling);
      supabase.removeChannel(channel);
    };
  }, [targetRole]);

  const markAsRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unread }),
    });
  };

  const markOneAsRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
  };

  const filteredNotifs = notifications.filter(n => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'read')   return n.read;
    return true;
  });

  const handleAction = async (action: 'approve_close' | 'reject_close' | 'approve_reopen' | 'reject_reopen', entityId: string | null) => {
    if (!entityId) return;
    const adminName = sessionStorage.getItem('shuma_name') || 'Admin';

    let endpoint = '';
    let body: any = { adminName };

    if (action === 'approve_close') {
      endpoint = '/api/routes/close/approve';
      body.routeId = entityId;
    } else if (action === 'reject_close') {
      const reason = prompt('Motivo del rechazo:');
      if (!reason) return;
      endpoint = '/api/routes/close/reject';
      body.routeId = entityId;
      body.reason = reason;
    } else if (action === 'approve_reopen') {
      endpoint = '/api/routes/reopen/approve';
      body.requestId = entityId;
    } else if (action === 'reject_reopen') {
      endpoint = '/api/routes/reopen/reject';
      body.requestId = entityId;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Error en la acción');
      fetchNotifications();
    } catch (e) {
      console.error('Error in action:', e);
    }
  };

  return (
    <div ref={bellRef} className="relative">
      <button
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) markAsRead();
        }}
        className="relative p-2 text-shuma-muted hover:text-white transition-colors"
      >
        <Bell size={20} className={isReminderPulse ? 'animate-bounce' : ''} />
        {pendingActionCount > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full border border-shuma-surface animate-pulse">
            {pendingActionCount}
          </span>
        ) : unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-shuma-surface animate-pulse" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-shuma-surface border border-shuma-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-3 border-b border-shuma-border space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Notificaciones</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAsRead}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Marcar todas leídas
                </button>
              )}
            </div>
            {/* Filtros */}
            <div className="flex gap-1">
              {(['all', 'unread', 'read'] as const).map(f => {
                const labels = { all: 'Todas', unread: 'Nuevas', read: 'Leídas' };
                const counts = {
                  all:    notifications.length,
                  unread: notifications.filter(n => !n.read).length,
                  read:   notifications.filter(n => n.read).length,
                };
                return (
                  <button
                    key={f}
                    onClick={() => setNotifFilter(f)}
                    className={`flex-1 text-[10px] font-semibold py-1 rounded-lg transition-colors ${
                      notifFilter === f
                        ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                        : 'text-shuma-muted hover:text-white hover:bg-shuma-border'
                    }`}
                  >
                    {labels[f]} {counts[f] > 0 && `(${counts[f]})`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {filteredNotifs.length === 0 ? (
              <p className="p-6 text-center text-shuma-muted text-sm">
                {notifFilter === 'unread' ? 'No hay notificaciones nuevas'
                 : notifFilter === 'read'  ? 'No hay notificaciones leídas'
                 : 'No hay notificaciones'}
              </p>
            ) : (
              filteredNotifs.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => {
                    if (
                      notif.entity_id &&
                      onNavigateToRoute &&
                      (notif.type === 'route_closure_resolved' || notif.type === 'reopen_resolved')
                    ) {
                      onNavigateToRoute(notif.entity_id);
                      setIsOpen(false);
                    }
                  }}
                  className={`p-3 text-sm border-b border-shuma-border last:border-0 ${
                    !notif.read ? 'bg-blue-500/5 border-l-2 border-l-blue-500/40' : ''
                  } ${
                    (notif.type === 'route_closure_resolved' || notif.type === 'reopen_resolved') && notif.entity_id
                      ? 'cursor-pointer hover:bg-shuma-border/30 transition-colors'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-xs">{notif.title}</p>
                      <p className="text-shuma-muted text-xs mt-0.5 mb-2">{notif.body}</p>
                    </div>
                    {!notif.read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markOneAsRead(notif.id); }}
                        className="shrink-0 w-5 h-5 rounded-full bg-blue-500/20 hover:bg-blue-500/40 border border-blue-500/30 flex items-center justify-center transition-colors mt-0.5"
                        title="Marcar como leída"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      </button>
                    )}
                  </div>
                  
                  {targetRole === 'admin' && (notif.type === 'route_closure_requested' || notif.type === 'reopen_requested') && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(notif.type === 'route_closure_requested' ? 'approve_close' : 'approve_reopen', notif.entity_id); }}
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 text-xs hover:bg-emerald-500/20"
                      >
                        <CheckCircle size={12} /> Aprobar
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAction(notif.type === 'route_closure_requested' ? 'reject_close' : 'reject_reopen', notif.entity_id); }}
                        className="flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded-lg border border-red-500/20 text-xs hover:bg-red-500/20"
                      >
                        <XCircle size={12} /> Rechazar
                      </button>
                    </div>
                  )}
                  {targetRole === 'admin' && (notif.type === 'route_closure_resolved' || notif.type === 'reopen_resolved') && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-shuma-border text-shuma-muted">
                      ✓ Resuelto
                    </div>
                  )}
                  <p className="text-[10px] text-shuma-muted opacity-50 mt-1.5">
                    {new Date(notif.created_at).toLocaleString('es-MX')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
