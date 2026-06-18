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

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [scale, setScaleState] = useState<FontScale>(1);

  useEffect(() => {
    const saved = localStorage.getItem('shuma-rutas-font-scale');
    if (saved) {
      const parsed = parseFloat(saved) as FontScale;
      if ([1, 1.15, 1.3, 1.5].includes(parsed)) {
        setScaleState(parsed);
        document.documentElement.style.setProperty('--font-scale', parsed.toString());
      }
    }
  }, []);

  const setScale = (s: FontScale) => {
    setScaleState(s);
    localStorage.setItem('shuma-rutas-font-scale', s.toString());
    document.documentElement.style.setProperty('--font-scale', s.toString());
  };

  return (
    <FontScaleContext.Provider value={{ scale, setScale }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export const useFontScale = () => useContext(FontScaleContext);
