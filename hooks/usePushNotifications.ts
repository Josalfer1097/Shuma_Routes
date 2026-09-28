'use client';
import { useEffect, useState } from 'react';

/** Registra en el servidor la suscripción de este dispositivo. Falla ruidosamente. */
async function registerOnServer(sub: PushSubscription): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  // Antes no se revisaba la respuesta: los rechazos del servidor (403) pasaban en silencio
  if (!res.ok) throw new Error(`El servidor rechazó la suscripción (${res.status})`);
}

async function getOrCreateSubscription(): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const current = Notification.permission;
    setPermission(current);

    // Si el permiso ya estaba concedido, antes nunca se volvía a registrar el dispositivo.
    // Ahora se asegura el registro en cada carga (el servidor hace upsert, es idempotente).
    if (current === 'granted' && 'serviceWorker' in navigator) {
      getOrCreateSubscription()
        .then(registerOnServer)
        .then(() => setSubscribed(true))
        .catch(err => console.error('Push: no se pudo registrar este dispositivo:', err));
    }
  }, []);

  const subscribe = async () => {
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;
      const sub = await getOrCreateSubscription();
      await registerOnServer(sub);
      setSubscribed(true);
    } catch (err) {
      console.error('Push subscribe error:', err);
    }
  };

  return { permission, subscribed, subscribe };
}
