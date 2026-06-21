'use client';
import LoginScreen from '@/components/LoginScreen';

export default function DriverLoginPage() {
  return (
    <LoginScreen
      role="driver"
      authEndpoint="/api/auth/driver"
      redirectPath="/driver"
      accentColor="#F59E0B"
      accentColorRgb="245,158,11"
      title="Acceso Chofer"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      }
    />
  );
}
