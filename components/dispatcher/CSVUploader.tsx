'use client';

import { useCallback, useRef, useState } from 'react';
import Papa from 'papaparse';
import type { Address } from '@/types';
import { nanoid } from 'nanoid';

interface Props {
  onAddressesLoaded: (addresses: Address[]) => void;
  disabled?: boolean;
}

interface CSVRow {
  nombre?: string;
  name?: string;
  direccion?: string;
  address?: string;
  [key: string]: string | undefined;
}

export default function CSVUploader({ onAddressesLoaded, disabled }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<Address[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseCSV = useCallback(
    (file: File) => {
      setError(null);
      setFileName(file.name);

      Papa.parse<CSVRow>(file, {
        header: true,
        delimiter: ',',
        encoding: 'UTF-8',
        skipEmptyLines: true,
        complete: (result) => {
          if (result.errors.length > 0) {
            setError(`Error al parsear CSV: ${result.errors[0].message}`);
            return;
          }

          const addresses: Address[] = result.data
            .filter((row) => {
              const addr = row.direccion ?? row.address ?? '';
              return addr.trim().length > 0;
            })
            .map((row) => ({
              id: nanoid(),
              raw: row.direccion ?? row.address ?? '',
              name: row.nombre ?? row.name ?? 'Sin nombre',
              lat: null,
              lng: null,
              label: '',
              geocoded: false,
            }));

          if (addresses.length === 0) {
            setError(
              'No se encontraron filas válidas. El CSV debe tener columnas "nombre" y "direccion".'
            );
            return;
          }

          setPreview(addresses);
          onAddressesLoaded(addresses);
        },
        error: (err) => {
          setError(`Error al leer el archivo: ${err.message}`);
        },
      });
    },
    [onAddressesLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith('.csv')) {
        parseCSV(file);
      } else {
        setError('Por favor sube un archivo .csv');
      }
    },
    [parseCSV]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseCSV(file);
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if(!disabled) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => !disabled && handleDrop(e)}
        className={`
          relative flex flex-col items-center justify-center gap-2 cursor-pointer
          border-2 border-dashed rounded-xl p-6 transition-all duration-200
          ${isDragging
            ? 'border-blue-400 bg-blue-500/10'
            : disabled
              ? 'border-slate-700 opacity-50 cursor-not-allowed'
              : 'border-slate-600 hover:border-blue-500 hover:bg-slate-700/50'
          }
        `}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-700 mb-1">
          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-300">
          {fileName ? fileName : 'Arrastra tu CSV aquí'}
        </p>
        <p className="text-xs text-slate-500">o haz clic para seleccionar</p>
        <p className="text-xs text-slate-600 mt-1">Columnas: <code className="text-blue-400">nombre, direccion</code></p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileInput}
          disabled={disabled}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.25a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm0 6.75a.75.75 0 011.5 0v.5a.75.75 0 01-1.5 0v-.5z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-700/50">
            <span className="text-xs font-medium text-slate-300">
              {preview.length} direcciones cargadas
            </span>
            <span className="text-xs text-slate-500">Preview</span>
          </div>
          <ul className="divide-y divide-slate-700/50 max-h-40 overflow-y-auto">
            {preview.slice(0, 8).map((addr) => (
              <li key={addr.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-300 truncate">{addr.name}</p>
                  <p className="text-xs text-slate-500 truncate">{addr.raw}</p>
                </div>
              </li>
            ))}
            {preview.length > 8 && (
              <li className="px-3 py-2 text-center text-xs text-slate-500">
                +{preview.length - 8} más…
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
