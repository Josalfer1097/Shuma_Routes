"use client";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_PATHS = ['/', '/admin-login', '/driver-login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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
