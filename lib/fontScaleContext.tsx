'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type FontScale = 0.85 | 1 | 1.15 | 1.3 | 1.5 | 1.8;

interface FontScaleContextType {
  scale: FontScale;
  setScale: (s: FontScale) => void;
}

const FontScaleContext = createContext<FontScaleContextType>({
  scale: 1,
  setScale: () => {},
});

function applyScale(s: FontScale) {
  // SOLO escalar textos — NO zoom del body (afectaría el mapa)
  // Aplicar en el elemento raíz como CSS var
  document.documentElement.style.setProperty('--font-scale', s.toString());
  // También en el data-attribute para que el SlideOver y panels lo usen
  document.documentElement.setAttribute('data-font-scale', s.toString());
}

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<FontScale>(1);

  useEffect(() => {
    const saved = localStorage.getItem('shuma-rutas-font-scale');
    if (saved) {
      const parsed = parseFloat(saved) as FontScale;
      if (([0.85, 1, 1.15, 1.3, 1.5, 1.8] as number[]).includes(parsed)) {
        setScaleState(parsed as FontScale);
        applyScale(parsed as FontScale);
      }
    }
  }, []);

  const setScale = (s: FontScale) => {
    setScaleState(s);
    localStorage.setItem('shuma-rutas-font-scale', s.toString());
    applyScale(s);
  };

  return (
    <FontScaleContext.Provider value={{ scale, setScale }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export const useFontScale = () => useContext(FontScaleContext);

/**
 * Hook que retorna un multiplicador para usar en style={{ fontSize }} inline.
 * Uso: const fs = useFontSize(); style={{ fontSize: fs(11) }}
 */
export function useFontSize() {
  const { scale } = useFontScale();
  return (base: number) => Math.round(base * scale);
}
