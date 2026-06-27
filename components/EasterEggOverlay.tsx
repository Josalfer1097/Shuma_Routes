"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface FallingItem {
  id: number;
  emoji: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRotation: number;
  size: number;
  grabbed: boolean;
}

interface EasterEggOverlayProps {
  onClose: () => void;
  duration?: number;
}

const EMOJIS = ['💀', '🚛', '💀', '🚚', '☠️', '🚛', '👻', '🚐', '💀', '🚛'];
const GRAVITY = 0.55;
const BOUNCE_DAMPING = 0.68;
const FRICTION = 0.985;
const LAUNCH_THRESHOLD = 6; // velocidad mínima para contar como "lanzamiento"

export default function EasterEggOverlay({ onClose, duration = 16 }: EasterEggOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemsRef = useRef<FallingItem[]>([]);
  const animationRef = useRef<number>(0);
  const grabbedIdRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0 });
  const [countdown, setCountdown] = useState(duration);
  const [exiting, setExiting] = useState(false);
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [launchCount, setLaunchCount] = useState(0);

  // Inicializar items
  useEffect(() => {
    const items: FallingItem[] = EMOJIS.map((emoji, i) => ({
      id: i,
      emoji,
      x: Math.random() * (window.innerWidth - 100) + 50,
      y: -Math.random() * 500 - 50,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * 2 + 2,
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 16,
      size: 38 + Math.random() * 28,
      grabbed: false,
    }));
    itemsRef.current = items;
  }, []);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(onClose, 700);
  }, [onClose]);

  // Detección de colisión círculo-círculo
  const resolveCollisions = (items: FallingItem[]) => {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.grabbed || b.grabbed) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = (a.size + b.size) / 2;
        if (dist < minDist && dist > 0) {
          // Separar
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          // Intercambiar componentes de velocidad en el eje de colisión
          const relVx = b.vx - a.vx;
          const relVy = b.vy - a.vy;
          const dot = relVx * nx + relVy * ny;
          if (dot < 0) {
            const impulse = dot * 0.75; // restitución
            a.vx += impulse * nx;
            a.vy += impulse * ny;
            b.vx -= impulse * nx;
            b.vy -= impulse * ny;
            // Añadir rotación al impacto
            a.vRotation += (Math.random() - 0.5) * 12;
            b.vRotation += (Math.random() - 0.5) * 12;
          }
        }
      }
    }
  };

  // Loop física + render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const items = itemsRef.current;

      for (const item of items) {
        if (item.grabbed) {
          item.vx = mouseRef.current.x - mouseRef.current.prevX;
          item.vy = mouseRef.current.y - mouseRef.current.prevY;
          item.x = mouseRef.current.x;
          item.y = mouseRef.current.y;
        } else {
          // Física
          item.vy += GRAVITY;
          item.vx *= FRICTION;
          item.x += item.vx;
          item.y += item.vy;
          item.rotation += item.vRotation;
          item.vRotation *= 0.93;

          // Rebote suelo
          const floor = canvas.height - item.size / 2;
          if (item.y > floor) {
            item.y = floor;
            item.vy *= -BOUNCE_DAMPING;
            item.vx *= 0.82;
            item.vRotation *= 0.55;
            if (Math.abs(item.vy) < 1.2) item.vy = 0;
          }
          // Rebote paredes
          if (item.x < item.size / 2) {
            item.x = item.size / 2;
            item.vx *= -BOUNCE_DAMPING;
          }
          if (item.x > canvas.width - item.size / 2) {
            item.x = canvas.width - item.size / 2;
            item.vx *= -BOUNCE_DAMPING;
          }
        }

        // Render emoji principal
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.font = `${item.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = item.grabbed ? 'rgba(220,38,38,1)' : 'rgba(220,38,38,0.7)';
        ctx.shadowBlur = item.grabbed ? 32 : 10;
        // Escalar ligeramente si está agarrado
        if (item.grabbed) ctx.scale(1.12, 1.12);
        ctx.fillText(item.emoji, 0, 0);
        ctx.restore();
      }

      resolveCollisions(items);

      mouseRef.current.prevX = mouseRef.current.x;
      mouseRef.current.prevY = mouseRef.current.y;
      animationRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Pointer handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    mouseRef.current = { x, y, prevX: x, prevY: y };
    let closest: FallingItem | null = null;
    let closestDist = Infinity;
    for (const item of itemsRef.current) {
      const dist = Math.hypot(item.x - x, item.y - y);
      if (dist < item.size && dist < closestDist) {
        closest = item;
        closestDist = dist;
      }
    }
    if (closest) {
      closest.grabbed = true;
      grabbedIdRef.current = closest.id;
      setIsGrabbing(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handlePointerUp = () => {
    if (grabbedIdRef.current !== null) {
      const item = itemsRef.current.find(i => i.id === grabbedIdRef.current);
      if (item) {
        item.grabbed = false;
        // Contar como lanzamiento si tiene velocidad alta
        const speed = Math.hypot(item.vx, item.vy);
        if (speed > LAUNCH_THRESHOLD) {
          setLaunchCount(prev => prev + 1);
        }
      }
      grabbedIdRef.current = null;
    }
    setIsGrabbing(false);
  };

  const isUrgent = countdown <= 3;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        // Fondo con doble viñeta para profundidad
        background: `
          radial-gradient(ellipse at center, #1a0000 0%, #050000 60%, #000000 100%)
        `,
        animation: exiting
          ? 'eggGlitchOut 0.7s steps(3) forwards'
          : 'eggFadeIn 0.5s ease forwards',
        overflow: 'hidden',
        cursor: isGrabbing ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap');

        @keyframes eggFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes eggGlitchOut {
          0%   { opacity: 1; transform: translate(0,0) scale(1); filter: none; }
          15%  { transform: translate(-8px, 3px) scale(1.01); filter: hue-rotate(90deg) saturate(4); }
          30%  { transform: translate(8px, -3px) scale(0.99); filter: hue-rotate(-90deg) brightness(1.5); }
          50%  { transform: translate(-5px, 0) scale(1.02); filter: none; }
          70%  { transform: translate(5px, 3px) scale(0.98); filter: brightness(2) hue-rotate(180deg); }
          90%  { opacity: 0.3; transform: translate(0,0) scale(1.05); }
          100% { opacity: 0; transform: translate(0,0) scale(1); filter: none; }
        }
        @keyframes eggGrid {
          0%   { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }
        @keyframes eggLogoPulse {
          0%, 100% {
            filter: drop-shadow(0 0 20px rgba(220,38,38,0.9)) brightness(0.85);
            transform: scale(1);
          }
          50% {
            filter: drop-shadow(0 0 48px rgba(220,38,38,1)) brightness(1.25);
            transform: scale(1.05);
          }
        }
        @keyframes eggTextGlitch {
          0%, 85%, 100% { text-shadow: 2px 0 #dc2626, -2px 0 #00ffff; opacity: 1; }
          87%            { text-shadow: -3px 0 #dc2626, 3px 0 #00ffff; opacity: 0.9; transform: translateX(-2px); }
          90%            { text-shadow: 3px 0 #ff00ff, -3px 0 #dc2626; opacity: 1; transform: translateX(2px); }
          93%            { text-shadow: -2px 0 #00ffff, 2px 0 #ff00ff; opacity: 0.8; transform: translateX(0); }
        }
        @keyframes eggFlame {
          0%, 100% { transform: scaleY(1) rotate(-3deg); opacity: 0.85; }
          50%      { transform: scaleY(1.2) rotate(3deg); opacity: 1; }
        }
        @keyframes eggUrgentPulse {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); box-shadow: 0 0 12px rgba(220,38,38,0.4); }
          50%      { opacity: 0.7; transform: translateX(-50%) scale(1.06); box-shadow: 0 0 24px rgba(220,38,38,0.9); }
        }
        @keyframes eggLaunchPop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes eggVignette {
          0%, 100% { opacity: 0.7; }
          50%      { opacity: 0.9; }
        }
      `}</style>

      {/* Viñeta exterior oscura pulsante */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.85) 100%)',
        animation: 'eggVignette 1.8s ease-in-out infinite',
      }} />

      {/* Grid gótico tenue */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(220,38,38,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(220,38,38,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        animation: 'eggGrid 2s linear infinite',
      }} />

      {/* Velas — tamaños y delays distintos para romper simetría */}
      {[
        { top: 16,  left: 18,  size: 44, delay: 0    },
        { top: 14,  right: 22, size: 36, delay: 0.3  },
        { bottom: 18, left: 22,  size: 40, delay: 0.15 },
        { bottom: 14, right: 18, size: 48, delay: 0.45 },
      ].map((c, i) => {
        const { size, delay, ...pos } = c;
        return (
          <div key={i} style={{
            position: 'absolute', ...pos,
            fontSize: size,
            pointerEvents: 'none',
            animation: `eggFlame ${0.45 + i * 0.1}s ease-in-out ${delay}s infinite`,
          }}>
            🕯️
          </div>
        );
      })}

      {/* Countdown — esquina superior derecha */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 10,
          background: isUrgent ? 'rgba(220,38,38,0.2)' : 'rgba(220,38,38,0.08)',
          border: `1px solid ${isUrgent ? 'rgba(220,38,38,0.8)' : 'rgba(220,38,38,0.35)'}`,
          borderRadius: 99,
          color: isUrgent ? '#ff4444' : '#dc2626',
          fontFamily: "'Cinzel', serif",
          fontSize: isUrgent ? 15 : 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          padding: '6px 16px',
          cursor: 'pointer',
          pointerEvents: 'auto',
          transition: 'all 0.3s ease',
          animation: isUrgent ? 'eggUrgentPulse 0.3s ease-in-out infinite' : 'none',
          transform: 'none', // el keyframe maneja el transform
        }}
      >
        {countdown}s ✕
      </button>

      {/* Contador de lanzamientos — esquina inferior izquierda */}
      {launchCount > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: 24,
          zIndex: 10,
          fontFamily: "'Cinzel', serif",
          fontSize: 13,
          color: '#7f1d1d',
          letterSpacing: '0.08em',
          pointerEvents: 'none',
          animation: 'eggLaunchPop 0.3s ease',
        }}>
          💀 ×{launchCount} {launchCount === 1 ? 'alma lanzada' : 'almas lanzadas'}
        </div>
      )}

      {/* Contenido central con backdrop sutil */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        pointerEvents: 'none', textAlign: 'center', zIndex: 5,
        // Backdrop sutil para separarse de los emojis
        background: 'radial-gradient(ellipse at center, rgba(10,0,0,0.65) 0%, transparent 70%)',
        padding: '32px 48px',
        borderRadius: 24,
      }}>
        <img
          src="/shuma_logo.png"
          alt="Shuma"
          style={{
            height: 86,
            width: 'auto',
            marginBottom: 18,
            animation: 'eggLogoPulse 1s ease-in-out infinite',
          }}
        />
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontWeight: 900,
          fontSize: 'clamp(18px, 3.5vw, 36px)',
          color: '#dc2626',
          letterSpacing: '0.18em',
          margin: 0,
          animation: 'eggTextGlitch 1.5s steps(4) infinite',
        }}>
          SHUMA SISTEMAS IT
        </h1>
        <p style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(10px, 1.8vw, 14px)',
          color: '#7f1d1d',
          letterSpacing: '0.35em',
          marginTop: 10,
          marginBottom: 0,
          textTransform: 'uppercase',
        }}>
          Est. en las Sombras
        </p>
        <p style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          color: '#6b7280',
          letterSpacing: '0.08em',
          marginTop: 20,
          marginBottom: 0,
        }}>
          Arrastra las almas errantes · Escape para salir
        </p>
      </div>

      {/* Canvas física */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, zIndex: 3 }}
      />
    </div>
  );
}
