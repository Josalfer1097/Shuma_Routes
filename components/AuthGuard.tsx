"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ['/', '/admin-login', '/driver-login'];

const LOCAL_SESSION_KEYS = ['shuma_auth', 'shuma_role', 'shuma_user', 'shuma_name'];

/**
 * La sesión real vive en la cookie httpOnly `shuma_session`; sessionStorage solo
 * guarda datos de pantalla. Si el servidor responde 401 (cookie vencida, secreto
 * rotado, cookie borrada), la pantalla seguía "con sesión" pero sin datos.
 * Este interceptor detecta el primer 401 de la API y manda al login con aviso.
 */
function installSessionExpiryHandler(): void {
  const w = window as Window & { __shumaSessionHandler?: boolean };
  if (w.__shumaSessionHandler) return;
  w.__shumaSessionHandler = true;

  const originalFetch = window.fetch.bind(window);
  let redirecting = false;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    if ((res.status !== 401 && res.status !== 403) || redirecting) return res;

    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try {
      url = new URL(rawUrl, window.location.origin);
    } catch {
      return res;
    }

    const isOwnApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');
    const isAuthEndpoint = url.pathname.startsWith('/api/auth/');
    const hadLocalSession = sessionStorage.getItem('shuma_auth') === '1';

    if (!isOwnApi || isAuthEndpoint || !hadLocalSession) return res;

    if (res.status === 401) {
      redirecting = true;
      LOCAL_SESSION_KEYS.forEach(k => sessionStorage.removeItem(k));
      window.location.replace('/?sesion=expirada');
      return res;
    }

    // 403 con otro rol activo en el navegador: se inició sesión con otra cuenta en otra pestaña.
    // Un 403 normal (acción no permitida para este rol) se deja pasar.
    if (hasSessionConflict()) {
      redirecting = true;
      LOCAL_SESSION_KEYS.forEach(k => sessionStorage.removeItem(k));
      window.location.replace('/?sesion=otra-cuenta');
    }
    return res;
  };
}

/** Rol dueño de la cookie de sesión; lo escribe LoginScreen solo al iniciar sesión. */
const SESSION_ROLE_KEY = 'shuma_session_role';

/** El navegador tiene una sola cookie de sesión: el último inicio de sesión gana en todas las pestañas. */
function hasSessionConflict(): boolean {
  const thisTabRole = sessionStorage.getItem('shuma_role');
  const browserRole = localStorage.getItem(SESSION_ROLE_KEY);
  return Boolean(thisTabRole && browserRole && thisTabRole !== browserRole);
}

/**
 * Avisa en cuanto otra pestaña inicia sesión con otro rol (por ejemplo, chofer mientras
 * esta pestaña es de administrador). Antes la pestaña seguía abierta y todo fallaba con 403.
 */
function installSessionConflictWatcher(): void {
  const w = window as Window & { __shumaConflictWatcher?: boolean };
  if (w.__shumaConflictWatcher) return;
  w.__shumaConflictWatcher = true;

  window.addEventListener('storage', e => {
    if (e.key !== SESSION_ROLE_KEY || !e.newValue) return;
    if (sessionStorage.getItem('shuma_auth') !== '1') return;
    if (!hasSessionConflict()) return;
    LOCAL_SESSION_KEYS.forEach(k => sessionStorage.removeItem(k));
    window.location.replace('/?sesion=otra-cuenta');
  });
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    installSessionExpiryHandler();
    installSessionConflictWatcher();
  }, []);

  useEffect(() => {
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (isPublic) {
      setChecked(true);
      return;
    }

    const auth = sessionStorage.getItem('shuma_auth');
    const role = sessionStorage.getItem('shuma_role');

    if (auth !== '1') {
      router.replace('/');
      return;
    }

    // Verificar que el rol tenga acceso a la ruta
    if (pathname.startsWith('/dispatcher') && role === 'driver') {
      router.replace('/driver');
      return;
    }

    if (pathname.startsWith('/driver') && role !== 'driver') {
      router.replace('/dispatcher');
      return;
    }

    setChecked(true);
  }, [pathname, router]);

  if (!checked) return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#050C1A',
      zIndex: 99999
    }} />
  );

  return <>{children}</>;
}
