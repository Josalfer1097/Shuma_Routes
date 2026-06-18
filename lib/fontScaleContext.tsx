'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type FontScale = 1 | 1.15 | 1.3 | 1.5;

interface FontScaleContextType {
  scale: FontScale;
  setScale: (s: FontScale) => void;
}

const FontScaleContext = createContext<FontScaleContextType>({
  scale: 1,
  setScale: () => {},
});

function applyScale(s: FontScale) {
  // zoom escala absolutamente todo: px, rem, em, imágenes, etc.
  // Es la única forma de escalar una app con fontSize px hardcodeados
  document.body.style.zoom = s === 1 ? '' : s.toString();
  // También actualizar la CSS var para los text-scale-* que sí la usan
  document.documentElement.style.setProperty('--font-scale', s.toString());
}

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<FontScale>(1);

  useEffect(() => {
    const saved = localStorage.getItem('shuma-rutas-font-scale');
    if (saved) {
      const parsed = parseFloat(saved) as FontScale;
      if (([1, 1.15, 1.3, 1.5] as number[]).includes(parsed)) {
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
