"use client";

export default function UnderConstruction({ pageName, icon, eta }: {
  pageName: string; icon: string; eta?: string;
}) {
  return (
    <div style={{
      minHeight: '100vh', background: '#050C1A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'DM Sans', sans-serif", padding: '20px',
      backgroundImage: 'linear-gradient(rgba(17,32,64,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(17,32,64,0.5) 1px,transparent 1px)',
      backgroundSize: '40px 40px'
    }}>
      <div style={{
        background: 'rgba(10,22,40,0.88)',
        border: '1px solid rgba(33,150,243,0.15)',
        borderRadius: 16, padding: '48px 40px',
        maxWidth: 480, width: '100%', textAlign: 'center'
      }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>{icon}</div>

        <div style={{
          fontFamily: "'Exo 2', sans-serif",
          fontSize: 11, letterSpacing: '0.2em',
          color: 'rgba(33,150,243,0.5)', textTransform: 'uppercase',
          marginBottom: 12
        }}>
          Error 418 — I&apos;m a teapot
        </div>

        <h1 style={{
          fontFamily: "'Exo 2', sans-serif",
          fontSize: 22, fontWeight: 700,
          color: '#E8EFF8', marginBottom: 12
        }}>
          {pageName}
        </h1>

        <p style={{ fontSize: 14, color: '#5B7BA0', lineHeight: 1.6, marginBottom: 8 }}>
          Esta pantalla está siendo construida por el equipo de
          Sistemas IT mientras toma café y finge que entiende
          los requerimientos.
        </p>

        <p style={{ fontSize: 13, color: '#3a5a80', lineHeight: 1.6, marginBottom: 24 }}>
          {'//'} TODO: implementar antes del siguiente sprint<br/>
          {'//'} FIXME: el PM dice &quot;es fácil, solo es un CRUD&quot;<br/>
          {'//'} NOTE: llevamos 3 semanas en esto
        </p>

        {eta && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 20, padding: '4px 14px',
            fontSize: 11, color: '#10B981',
            fontFamily: "'Exo 2', sans-serif",
            letterSpacing: '0.1em', marginBottom: 24
          }}>
            ETA: {eta}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: eta ? 0 : 0 }}>
          <button
            onClick={() => window.history.back()}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid #112040',
              borderRadius: 8, color: '#5B7BA0',
              fontFamily: "'Exo 2', sans-serif",
              fontSize: 11, letterSpacing: '0.12em',
              textTransform: 'uppercase', cursor: 'pointer'
            }}
          >
            ← Volver
          </button>
          <button
            onClick={() => window.location.href = '/dispatcher'}
            style={{
              padding: '10px 20px',
              background: '#0047AB',
              border: 'none',
              borderRadius: 8, color: '#fff',
              fontFamily: "'Exo 2', sans-serif",
              fontSize: 11, letterSpacing: '0.12em',
              textTransform: 'uppercase', cursor: 'pointer'
            }}
          >
            Ir al dispatcher
          </button>
        </div>
      </div>

      <p style={{
        marginTop: 20, fontSize: 10, letterSpacing: '0.14em',
        textTransform: 'uppercase',
        background: 'linear-gradient(90deg,#ff0000,#ff6600,#ffff00,#00ff00,#00ffff,#0066ff,#cc00ff,#ff0000)',
        backgroundSize: '400% auto',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        animation: 'rgbRoll 5s linear infinite', opacity: 0.65
      }}>
        Design &amp; Developed by Shuma Sistemas IT
      </p>
      <style>{`@keyframes rgbRoll{from{background-position:0% center}to{background-position:400% center}}`}</style>
    </div>
  );
}
