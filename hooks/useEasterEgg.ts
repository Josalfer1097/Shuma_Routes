import { useState, useCallback, useRef } from 'react';

const CLICKS_REQUIRED = 10;
const CLICK_TIMEOUT_MS = 3000; // si pasan 3s entre clicks, se reinicia el conteo

/**
 * Hook para activar el easter egg "Modo Caos Gótico".
 * Retorna:
 *  - registerClick: handler para el onClick del footer
 *  - isActive: si el overlay debe mostrarse
 *  - deactivate: cierra el overlay manualmente
 */
export function useEasterEgg() {
  const [isActive, setIsActive] = useState(false);
  const clickCount = useRef(0);
  const lastClickTime = useRef(0);

  const registerClick = useCallback(() => {
    const now = Date.now();
    // Reiniciar si pasó demasiado tiempo desde el último click
    if (now - lastClickTime.current > CLICK_TIMEOUT_MS) {
      clickCount.current = 0;
    }
    lastClickTime.current = now;
    clickCount.current += 1;

    if (clickCount.current >= CLICKS_REQUIRED) {
      clickCount.current = 0;
      setIsActive(true);
    }
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
  }, []);

  return { registerClick, isActive, deactivate };
}
