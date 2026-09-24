'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { loadPlacesLibrary } from '@/lib/googleMaps';
import { VALLEY_BOUNDS, parseLatLng } from '@/lib/erpImport';

export interface PickedPlace {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** El usuario eligió una sugerencia: trae coordenada exacta. */
  onPick: (place: PickedPlace) => void;
  /** Enter sin sugerencia elegida: aplicar el texto o las coordenadas escritas. */
  onSubmitText: () => void;
  onCancel: () => void;
  placeholder?: string;
}

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

/**
 * Buscador de direcciones con Places API (New).
 *
 * Costo: todas las búsquedas mientras se escribe comparten un token de sesión,
 * que se cierra al elegir un resultado pidiendo solo ubicación y dirección
 * (campos Essentials). Se espera a 3 letras y a una pausa de 300 ms para no
 * consultar en cada tecla.
 */
export default function AddressAutocomplete({ value, onChange, onPick, onSubmitText, onCancel, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const libRef = useRef<google.maps.PlacesLibrary | null>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const requestIdRef = useRef(0);
  const listboxId = useId();

  useEffect(() => {
    const query = value.trim();
    // Coordenadas escritas a mano o texto muy corto: no se consulta a Google
    if (query.length < MIN_CHARS || parseLatLng(query)) {
      requestIdRef.current += 1;
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const lib = libRef.current ?? (libRef.current = await loadPlacesLibrary());
        if (!tokenRef.current) tokenRef.current = new lib.AutocompleteSessionToken();

        const { suggestions: result } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: tokenRef.current,
          includedRegionCodes: ['mx'],
          language: 'es',
          locationBias: VALLEY_BOUNDS,
        });

        if (requestId !== requestIdRef.current) return; // llegó una búsqueda más nueva
        setSuggestions(
          result
            .map(s => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => p !== null)
        );
        setActiveIndex(-1);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error('[AddressAutocomplete] Error buscando sugerencias:', err);
        setSuggestions([]);
        setError('El buscador no respondió. Puedes escribir la dirección completa o pegar coordenadas.');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  const pick = async (prediction: google.maps.places.PlacePrediction) => {
    setLoading(true);
    setError(null);
    try {
      // toPlace() conserva el token: esta consulta cierra la sesión de búsqueda
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'formattedAddress'] });
      tokenRef.current = null; // la siguiente búsqueda abre una sesión nueva

      if (!place.location) throw new Error('El lugar no trae ubicación');
      setSuggestions([]);
      onPick({
        lat: place.location.lat(),
        lng: place.location.lng(),
        formattedAddress: place.formattedAddress || prediction.text.toString(),
      });
    } catch (err) {
      console.error('[AddressAutocomplete] Error obteniendo el lugar:', err);
      setError('No se pudo obtener la ubicación de esa sugerencia. Intenta con otra.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) void pick(suggestions[activeIndex]);
      else onSubmitText();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className="w-full px-2 py-1.5 bg-slate-900 border border-shuma-border rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-blue-500"
      />
      {loading && (
        <span className="absolute right-2 top-1.5 text-[10px] text-shuma-muted">Buscando…</span>
      )}

      {suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 rounded-lg border border-shuma-border bg-slate-900 shadow-xl overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()} // no perder el foco antes del clic
                onClick={() => void pick(s)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full text-left px-2.5 py-1.5 ${i === activeIndex ? 'bg-blue-600/20' : 'hover:bg-slate-800'}`}
              >
                <p className="text-[11px] text-slate-100 truncate">{s.mainText?.toString() || s.text.toString()}</p>
                {s.secondaryText && (
                  <p className="text-[10px] text-shuma-muted truncate">{s.secondaryText.toString()}</p>
                )}
              </button>
            </li>
          ))}
          <li className="px-2.5 py-1 text-right text-[9px] text-slate-500 border-t border-shuma-border">
            Resultados de Google
          </li>
        </ul>
      )}

      {error && <p className="mt-1 text-[10px] text-amber-300">{error}</p>}
    </div>
  );
}
