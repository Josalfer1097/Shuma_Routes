'use client';

import { useState, useEffect } from 'react';
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

export default function NotificationBell({ targetRole }: { targetRole: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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

    const channel = supabase
      .channel(`notifications_${targetRole}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `target_role=eq.${targetRole}` }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) markAsRead();
        }}
        className="relative p-2 text-shuma-muted hover:text-white transition-colors"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-shuma-surface animate-pulse" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-shuma-surface border border-shuma-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="p-3 border-b border-shuma-border flex justify-between items-center">
            <h3 className="font-bold text-white text-sm">Notificaciones</h3>
            {unreadCount > 0 && (
              <span className="text-xs text-shuma-muted">{unreadCount} nuevas</span>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-shuma-muted text-sm">No hay notificaciones</p>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className={`p-3 text-sm border-b border-shuma-border last:border-0 ${!notif.read ? 'bg-blue-500/5' : ''}`}>
                  <p className="font-bold text-white">{notif.title}</p>
                  <p className="text-shuma-muted text-xs mt-0.5 mb-2">{notif.body}</p>
                  
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
