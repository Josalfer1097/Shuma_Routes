'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Zap, Code2, Rocket } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  emoji: string;
}

export default function ConstructionPage({ title, description, emoji }: Props) {
  const [mounted, setMounted] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number }>>([]);

  useEffect(() => {
    setMounted(true);
    
    // Generar partículas flotantes
    const newParticles = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100
    }));
    setParticles(newParticles);
  }, []);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-shuma-bg via-slate-950 to-slate-900 overflow-hidden relative">
      {/* Animación de fondo */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Partículas */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute w-1 h-1 bg-blue-400 rounded-full opacity-30"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              animation: `float ${3 + Math.random() * 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Contenido */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; }
            50% { transform: translateY(-20px) translateX(10px); opacity: 0.6; }
          }

          @keyframes glitch {
            0% { clip-path: polygon(0 0, 100% 0, 100% 45%, 0 60%); }
            10% { clip-path: polygon(0 0, 100% 0, 100% 60%, 0 45%); }
            20% { clip-path: polygon(0 0, 100% 0, 100% 45%, 0 60%); }
            100% { clip-path: polygon(0 0, 100% 0, 100% 45%, 0 60%); }
          }

          .glitch-text {
            position: relative;
            animation: glitch 0.3s ease-in-out infinite;
          }

          @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(33, 150, 243, 0.3); }
            50% { box-shadow: 0 0 40px rgba(33, 150, 243, 0.6); }
          }

          .pulse-glow {
            animation: pulse-glow 2s ease-in-out infinite;
          }
        `}</style>

        <div className="text-center space-y-8 max-w-2xl">
          {/* Emoji animado */}
          <div className="text-8xl animate-bounce" style={{ animationDuration: '2s' }}>
            {emoji}
          </div>

          {/* Título */}
          <div>
            <h1 className="text-5xl sm:text-7xl font-black bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent mb-4 font-mono">
              {title}
            </h1>
            <p className="text-lg text-slate-400 font-light">
              {description}
            </p>
          </div>

          {/* Cards info */}
          <div className="grid grid-cols-2 gap-4 mt-12">
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-900/20 to-cyan-900/20 border border-blue-500/20 backdrop-blur-sm hover:border-blue-500/40 transition-all">
              <Code2 className="w-6 h-6 text-blue-400 mb-2 mx-auto" />
              <p className="text-xs text-slate-400">Diseño en progreso</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/20 backdrop-blur-sm hover:border-purple-500/40 transition-all">
              <Zap className="w-6 h-6 text-purple-400 mb-2 mx-auto" />
              <p className="text-xs text-slate-400">Optimizando datos</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border border-emerald-500/20 backdrop-blur-sm hover:border-emerald-500/40 transition-all">
              <Sparkles className="w-6 h-6 text-emerald-400 mb-2 mx-auto" />
              <p className="text-xs text-slate-400">Inteligencia IA</p>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-br from-orange-900/20 to-red-900/20 border border-orange-500/20 backdrop-blur-sm hover:border-orange-500/40 transition-all">
              <Rocket className="w-6 h-6 text-orange-400 mb-2 mx-auto" />
              <p className="text-xs text-slate-400">En deployment</p>
            </div>
          </div>

          {/* Mensaje */}
          <div className="pt-8 border-t border-slate-700/50">
            <p className="text-sm text-slate-500 font-mono">
              $ npm run deploy --{title.toLowerCase().replace(/\s+/g, '-')}
            </p>
            <div className="mt-3 inline-block px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold">
              Vuelve pronto
            </div>
          </div>

          {/* Footer graciosa */}
          <div className="pt-4">
            <p className="text-xs text-slate-600">
              Mientras tanto, optimiza tus rutas con <span className="text-blue-400 font-semibold">Shuma Rutas</span> 🚀
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
