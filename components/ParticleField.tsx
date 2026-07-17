'use client';
import { useEffect, useRef } from 'react';

export default function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const stage = canvas.parentElement!;

    function resize() {
      const rect = stage.getBoundingClientRect();
      canvas!.width = rect.width * devicePixelRatio;
      canvas!.height = rect.height * devicePixelRatio;
      canvas!.style.width = rect.width + 'px';
      canvas!.style.height = rect.height + 'px';
      ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      angle: number; baseRadius: number; speed: number;
      size: number; wobble: number; wobbleSpeed: number;
      opacity: number; length: number;
    }
    const particles: Particle[] = [];
    const N = 110; // menos que la demo (140) — más sutil para producción

    for (let i = 0; i < N; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.55) * 320;
      particles.push({
        angle, baseRadius: radius,
        speed: 0.0004 + Math.random() * 0.0008,
        size: 1 + Math.random() * 1.8,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.0006 + Math.random() * 0.001,
        opacity: 0.15 + Math.random() * 0.35, // más sutil que la demo
        length: 3 + Math.random() * 7,
      });
    }

    function draw() {
      const w = stage.clientWidth, h = stage.clientHeight;
      ctx!.clearRect(0, 0, w, h);
      const fx = w * 0.5, fy = h * 0.38; // centrado, detrás del logo/cards

      particles.forEach(p => {
        p.angle += p.speed;
        p.wobble += p.wobbleSpeed;
        const r = p.baseRadius + Math.sin(p.wobble) * 12;
        const x = fx + Math.cos(p.angle) * r;
        const y = fy + Math.sin(p.angle) * r * 0.75;
        const dx = Math.cos(p.angle + Math.PI / 2) * p.length;
        const dy = Math.sin(p.angle + Math.PI / 2) * p.length * 0.75;
        const fade = 1 - (r / 360);
        ctx!.strokeStyle = `rgba(99, 140, 255, ${Math.max(0, p.opacity * fade)})`;
        ctx!.lineWidth = p.size * 0.6;
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(x - dx / 2, y - dy / 2);
        ctx!.lineTo(x + dx / 2, y + dy / 2);
        ctx!.stroke();
      });
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
