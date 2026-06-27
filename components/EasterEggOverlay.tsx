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
  duration?: number; // segundos
}

const EMOJIS = ['💀', '🚛', '💀', '🚚', '☠️', '🚛', '👻', '🚐'];
const GRAVITY = 0.4;
const BOUNCE_DAMPING = 0.65;
const FRICTION = 0.99;

export default function EasterEggOverlay({ onClose, duration = 8 }: EasterEggOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemsRef = useRef<FallingItem[]>([]);
  const animationRef = useRef<number>(0);
  const grabbedIdRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0 });
  const [countdown, setCountdown] = useState(duration);
  const [exiting, setExiting] = useState(false);

  // Inicializar items
  useEffect(() => {
    const count = 10;
    const items: FallingItem[] = [];
    for (let i = 0; i < count; i++) {
      items.push({
        id: i,
        emoji: EMOJIS[i % EMOJIS.length],
        x: Math.random() * (window.innerWidth - 100) + 50,
        y: -Math.random() * 400 - 50,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 2,
        rotation: Math.random() * 360,
        vRotation: (Math.random() - 0.5) * 8,
        size: 40 + Math.random() * 30,
        grabbed: false,
      });
    }
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

  // Escape para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(onClose, 600); // espera el fade-out glitch
  }, [onClose]);

  // Loop de física + render
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
          // Seguir el mouse
          item.x = mouseRef.current.x;
          item.y = mouseRef.current.y;
          // Guardar velocidad para "lanzarlo" al soltar
          item.vx = mouseRef.current.x - mouseRef.current.prevX;
          item.vy = mouseRef.current.y - mouseRef.current.prevY;
        } else {
          // Física
          item.vy += GRAVITY;
          item.vx *= FRICTION;
          item.x += item.vx;
          item.y += item.vy;
          item.rotation += item.vRotation;
          item.vRotation *= 0.98;

          // Rebote en el suelo
          const floor = canvas.height - item.size / 2;
          if (item.y > floor) {
            item.y = floor;
            item.vy *= -BOUNCE_DAMPING;
            item.vx *= 0.9;
            if (Math.abs(item.vy) < 1) item.vy = 0;
          }
          // Rebote en paredes
          if (item.x < item.size / 2) {
            item.x = item.size / 2;
            item.vx *= -BOUNCE_DAMPING;
          }
          if (item.x > canvas.width - item.size / 2) {
            item.x = canvas.width - item.size / 2;
            item.vx *= -BOUNCE_DAMPING;
          }
        }

        // Render emoji
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate((item.rotation * Math.PI) / 180);
        ctx.font = `${item.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(220,38,38,0.8)';
        ctx.shadowBlur = item.grabbed ? 25 : 12;
        ctx.fillText(item.emoji, 0, 0);
        ctx.restore();
      }

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

  // Mouse handlers para drag & drop
  const handlePointerDown = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    mouseRef.current = { x, y, prevX: x, prevY: y };
    // Buscar item bajo el cursor (el más cercano)
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
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    mouseRef.current.x = e.clientX;
    mouseRef.current.y = e.clientY;
  };

  const handlePointerUp = () => {
    if (grabbedIdRef.current !== null) {
      const item = itemsRef.current.find(i => i.id === grabbedIdRef.current);
      if (item) item.grabbed = false;
      grabbedIdRef.current = null;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'radial-gradient(ellipse at center, #1a0000 0%, #000000 80%)',
        animation: exiting
          ? 'eggGlitchOut 0.6s steps(2) forwards'
          : 'eggFadeIn 0.5s ease forwards',
        overflow: 'hidden',
        cursor: 'grab',
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
          0%   { opacity: 1; transform: translate(0,0); filter: none; }
          20%  { transform: translate(-6px, 2px); filter: hue-rotate(90deg) saturate(3); }
          40%  { transform: translate(6px, -2px); filter: hue-rotate(-90deg); }
          60%  { transform: translate(-4px, 0); filter: brightness(2); }
          80%  { transform: translate(4px, 2px); filter: invert(0.2); }
          100% { opacity: 0; transform: translate(0,0); filter: none; }
        }
        @keyframes eggGrid {
          0%   { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }
        @keyframes eggLogoPulse {
          0%, 100% { filter: drop-shadow(0 0 18px rgba(220,38,38,0.8)) brightness(0.9); transform: scale(1); }
          50%      { filter: drop-shadow(0 0 42px rgba(220,38,38,1)) brightness(1.2); transform: scale(1.04); }
        }
        @keyframes eggTextGlitch {
          0%, 100% { text-shadow: 2px 0 #dc2626, -2px 0 #00ffff; }
          25%      { text-shadow: -2px 0 #dc2626, 2px 0 #00ffff; }
          50%      { text-shadow: 2px 2px #dc2626, -2px -2px #ff00ff; }
          75%      { text-shadow: -2px 2px #00ffff, 2px -2px #dc2626; }
        }
        @keyframes eggFlame {
          0%, 100% { transform: scaleY(1) rotate(-2deg); opacity: 0.9; }
          50%      { transform: scaleY(1.15) rotate(2deg); opacity: 1; }
        }
      `}</style>

      {/* Grid gótico tenue */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(220,38,38,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(220,38,38,0.06) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        animation: 'eggGrid 4s linear infinite',
      }} />

      {/* Velas en las 4 esquinas */}
      {[
        { top: 20, left: 20 },
        { top: 20, right: 20 },
        { bottom: 20, left: 20 },
        { bottom: 20, right: 20 },
      ].map((pos, i) => (
        <div key={i} style={{ position: 'absolute', ...pos, fontSize: 40, pointerEvents: 'none', animation: `eggFlame ${1 + i * 0.2}s ease-in-out infinite` }}>
          🕯️
        </div>
      ))}

      {/* Contenido central */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        pointerEvents: 'none', textAlign: 'center', zIndex: 2,
      }}>
        <img
          src="/shuma_logo.png"
          alt="Shuma"
          style={{ height: 90, width: 'auto', marginBottom: 20, animation: 'eggLogoPulse 2s ease-in-out infinite' }}
        />
        <h1 style={{
          fontFamily: "'Cinzel', serif",
          fontWeight: 900,
          fontSize: 'clamp(20px, 4vw, 38px)',
          color: '#dc2626',
          letterSpacing: '0.15em',
          margin: 0,
          animation: 'eggTextGlitch 0.4s steps(2) infinite',
        }}>
          SHUMA SISTEMAS IT
        </h1>
        <p style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 'clamp(11px, 2vw, 15px)',
          color: '#7f1d1d',
          letterSpacing: '0.3em',
          marginTop: 10,
          textTransform: 'uppercase',
        }}>
          Est. en las Sombras
        </p>
        <p style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 11,
          color: '#525252',
          letterSpacing: '0.1em',
          marginTop: 24,
        }}>
          Arrastra las almas errantes 💀 · Escape para salir
        </p>
      </div>

      {/* Canvas de partículas (drag & drop) */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      />

      {/* Countdown — clickeable para cerrar */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute', top: 24, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 3,
          background: 'rgba(220,38,38,0.1)',
          border: '1px solid rgba(220,38,38,0.4)',
          borderRadius: 99,
          color: '#dc2626',
          fontFamily: "'Cinzel', serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.1em',
          padding: '6px 18px',
          cursor: 'pointer',
        }}
      >
        {countdown}s · Cerrar ✕
      </button>
    </div>
  );
}
