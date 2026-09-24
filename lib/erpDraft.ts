import type { ErpImportResult, ErpStop } from '@/lib/erpImport';

/**
 * Borrador de la revisión del Excel del ERP.
 *
 * La vista previa vive en un componente que se desmonta al cambiar de pestaña
 * del despachador; sin esto, las correcciones y exclusiones se perdían.
 * Se guarda en sessionStorage: sobrevive a cambiar de pestaña y a recargar,
 * y se borra solo al cerrar la pestaña del navegador (los datos de clientes
 * no quedan guardados de forma permanente en el equipo).
 */
const KEY = 'shuma_erp_draft';
const VERSION = 1;

export interface ErpDraft {
  v: number;
  fileName: string;
  result: ErpImportResult;
  stops: ErpStop[];
  excluded: string[];
  includedOutside: string[];
}

export function loadErpDraft(): ErpDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ErpDraft;
    if (draft.v !== VERSION || !draft.result || !Array.isArray(draft.stops)) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveErpDraft(draft: Omit<ErpDraft, 'v'>): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...draft }));
  } catch (err) {
    // Cuota llena u otro error: la revisión sigue funcionando, solo no se guarda
    console.warn('[erp-draft] No se pudo guardar el borrador de la revisión:', err);
  }
}

export function clearErpDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}
