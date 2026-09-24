/**
 * Importación del Excel de embarques del ERP (DETALLE_EMBARQUE_ARTICULOS).
 *
 * Reglas de negocio (acordadas con logística):
 * - Solo se procesan documentos de las localizaciones permitidas (SAN PABLO).
 * - El Excel trae una fila por artículo; el monto es el total del documento
 *   repetido en cada fila → se toma UNA vez por documento, nunca se suma.
 * - Ubicación: primero lat/lng del ERP; si no hay, la dirección en texto.
 * - Direcciones vacías, "SIN DIRECCION" o que no parecen dirección → "Por revisar".
 * - Una parada por cliente + ubicación (misma dirección o coordenadas a ≤25 m).
 * - Destinos fuera del Valle de México → "Fuera de zona", excluidos por defecto.
 *
 * Todo es puro (sin React ni red) para poder probarlo aislado.
 */

export const ALLOWED_LOCATIONS = ['SAN PABLO'];

/** Radio para considerar dos coordenadas del mismo cliente como la misma parada. */
const SAME_STOP_METERS = 25;

/** Caja aproximada del Valle de México (CDMX + zona conurbada del Edo. Méx.). */
export const VALLEY_BOUNDS = { south: 18.9, north: 20.1, west: -99.6, east: -98.6 };

/** Caja amplia de México, para descartar coordenadas basura (0,0, invertidas, etc.). */
const MEXICO_BOUNDS = { south: 14.0, north: 33.0, west: -118.5, east: -86.0 };

const IN_ZONE_STATES = ['CIUDAD DE MEXICO', 'CDMX', 'DISTRITO FEDERAL', 'ESTADO DE MEXICO', 'EDO DE MEXICO', 'EDO MEX', 'MEXICO'];

const OTHER_STATES = [
  'AGUASCALIENTES', 'BAJA CALIFORNIA SUR', 'BAJA CALIFORNIA', 'CAMPECHE', 'CHIAPAS', 'CHIHUAHUA',
  'COAHUILA', 'COLIMA', 'DURANGO', 'GUANAJUATO', 'GUERRERO', 'HIDALGO', 'JALISCO', 'MICHOACAN',
  'MORELOS', 'NAYARIT', 'NUEVO LEON', 'OAXACA', 'PUEBLA', 'QUERETARO', 'QUINTANA ROO',
  'SAN LUIS POTOSI', 'SINALOA', 'SONORA', 'TABASCO', 'TAMAULIPAS', 'TLAXCALA', 'VERACRUZ',
  'YUCATAN', 'ZACATECAS',
];

/** Partidas que no son mercancía física: se conservan, pero no cuentan como piezas. */
const NON_MERCHANDISE = /\b(COCHE SEGURO|FLETE|MANIOBRA|SERVICIO|SEGURO DE ENVIO|CARGO POR)\b/;

// ─── Tipos ───────────────────────────────────────────────────

export interface ErpItem {
  code: string;
  description: string;
  quantity: number;
  /** true si la partida no es mercancía (ej. "COCHE SEGURO"). */
  nonMerchandise: boolean;
}

export interface ErpInvoice {
  invoice: string;
  date: string | null;
  amount: number | null;
  /** true si las partidas del documento traían montos distintos (no debería pasar). */
  amountMismatch: boolean;
  clientNumber: string;
  clientName: string;
  location: string;
  addressText: string;
  lat: number | null;
  lng: number | null;
  items: ErpItem[];
  pieces: number;
}

export type StopStatus = 'listo' | 'geocodificar' | 'revisar' | 'fuera_zona';

export interface ErpStop {
  id: string;
  clientNumber: string;
  clientName: string;
  addressText: string;
  lat: number | null;
  lng: number | null;
  source: 'erp' | 'texto' | 'manual';
  status: StopStatus;
  reasons: string[];
  invoices: ErpInvoice[];
  pieces: number;
  amount: number;
}

export interface ErpImportResult {
  stops: ErpStop[];
  stats: {
    totalRows: number;
    rowsInLocation: number;
    invoices: number;
    stops: number;
    ignoredLocations: Record<string, number>;
    repairedTexts: number;
  };
  errors: string[];
}

// ─── Utilidades de texto ─────────────────────────────────────

/** Mapa inverso de Windows-1252 (0x80–0x9F) para reconstruir bytes originales. */
const CP1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/**
 * Repara texto UTF-8 que fue leído como Latin-1/Windows-1252 ("mojibake"):
 * "JESÃ\x9aS" → "JESÚS". Si el texto no está dañado o no se puede reparar
 * con certeza, se devuelve igual (nunca inventa caracteres).
 */
export function fixMojibake(text: string): { value: string; repaired: boolean } {
  if (!/[ÃÂ]/.test(text)) return { value: text, repaired: false };
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) as number;
    if (code <= 0xff) bytes.push(code);
    else if (CP1252_REVERSE[code] !== undefined) bytes.push(CP1252_REVERSE[code]);
    else return { value: text, repaired: false };
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return decoded === text ? { value: text, repaired: false } : { value: decoded, repaired: true };
  } catch {
    return { value: text, repaired: false };
  }
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza una dirección para comparar si dos textos son la misma. */
export function normalizeAddress(s: string): string {
  return stripAccents(s.toUpperCase()).replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** true si el texto no sirve como dirección de entrega. */
export function isInvalidAddress(raw: string): boolean {
  const s = normalizeAddress(raw);
  if (s.length < 10) return true;
  if (/^(SIN DIRECCION|SIN DOMICILIO|NO APLICA|N A|NA|CONOCIDO|DOMICILIO CONOCIDO|NINGUNA|PENDIENTE)$/.test(s)) return true;
  if ((s.match(/[A-Z]/g) || []).length < 5) return true;
  // Una dirección real trae número o al menos una separación por comas
  if (!/\d/.test(raw) && !raw.includes(',')) return true;
  return false;
}

/**
 * Estado de la república según el texto. El formato del ERP es
 * "..., MUNICIPIO, ESTADO, C.P. 12345", así que se busca en el segmento
 * previo al código postal (no en toda la cadena: "AV. HIDALGO" o la
 * alcaldía "MIGUEL HIDALGO" no deben confundirse con el estado).
 */
export function detectState(raw: string): { state: string | null; inZone: boolean | null } {
  const segments = raw
    .split(',')
    .map(p => normalizeAddress(p))
    .filter(p => p.length > 0 && !/^C ?P\b/.test(p) && !/^\d{5}$/.test(p));
  const candidate = segments[segments.length - 1];
  if (!candidate || segments.length < 2) return { state: null, inZone: null };

  if (IN_ZONE_STATES.includes(candidate)) return { state: candidate, inZone: true };
  const other = OTHER_STATES.find(st => candidate === st);
  if (other) return { state: other, inZone: false };
  return { state: null, inZone: null };
}

function inBounds(lat: number, lng: number, b: { south: number; north: number; west: number; east: number }): boolean {
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
}

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[$,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s === '-' ? '' : s;
}

/** Acepta "19.35, -99.09" escrito a mano. Devuelve null si no parece coordenada. */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return inBounds(lat, lng, MEXICO_BOUNDS) ? { lat, lng } : null;
}

// ─── Encabezados ─────────────────────────────────────────────

type Field =
  | 'location' | 'invoice' | 'date' | 'amount' | 'clientNumber' | 'clientName' | 'zone'
  | 'address' | 'lat' | 'lng' | 'itemCode' | 'itemDescription' | 'quantity';

/**
 * Se mapea por la ÚLTIMA parte del nombre técnico del ERP
 * ("logistica.rutas.embdet.c.documento" → "documento"), para que un cambio
 * de prefijo en el ERP no rompa la carga.
 */
const HEADER_ALIASES: Record<Field, string[]> = {
  location: ['localizacion', 'localización'],
  invoice: ['documento'],
  date: ['fecha_documento'],
  amount: ['monto_documento'],
  clientNumber: ['#', 'numero_cliente', 'cliente_id'],
  clientName: ['cliente'],
  zone: ['zona'],
  address: ['direccion_texto'],
  lat: ['latitud_entrega'],
  lng: ['longitud_entrega'],
  itemCode: ['codigo_articulo'],
  itemDescription: ['descripcion_articulo'],
  quantity: ['cantidad'],
};

const REQUIRED_FIELDS: Field[] = ['location', 'invoice', 'amount', 'clientName', 'address', 'itemCode', 'quantity'];

function mapHeaders(headerRow: unknown[]): { map: Partial<Record<Field, number>>; missing: Field[] } {
  const map: Partial<Record<Field, number>> = {};
  headerRow.forEach((h, idx) => {
    const key = stripAccents(String(h ?? '').trim().toLowerCase()).split('.').pop() || '';
    (Object.keys(HEADER_ALIASES) as Field[]).forEach(field => {
      if (map[field] === undefined && HEADER_ALIASES[field].map(a => stripAccents(a)).includes(key)) {
        map[field] = idx;
      }
    });
  });
  const missing = REQUIRED_FIELDS.filter(f => map[f] === undefined);
  return { map, missing };
}

const FIELD_LABELS: Record<Field, string> = {
  location: 'Localizacion', invoice: 'documento', date: 'fecha_documento', amount: 'monto_documento',
  clientNumber: '#', clientName: 'Cliente', zone: 'Zona', address: 'direccion_texto',
  lat: 'latitud_entrega', lng: 'longitud_entrega', itemCode: 'codigo_articulo',
  itemDescription: 'descripcion_articulo', quantity: 'cantidad',
};

// ─── Clasificación de una parada ─────────────────────────────

/**
 * Decide el estado de una parada a partir de su texto y coordenadas.
 * Se exporta para reutilizarla cuando el admin corrige una dirección.
 */
export function classifyStop(addressText: string, lat: number | null, lng: number | null, source: ErpStop['source']): {
  status: StopStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  const hasCoords = lat !== null && lng !== null && inBounds(lat, lng, MEXICO_BOUNDS);
  const textInvalid = isInvalidAddress(addressText);
  const { state, inZone: textInZone } = textInvalid ? { state: null, inZone: null } : detectState(addressText);

  if (lat !== null && lng !== null && !hasCoords) {
    reasons.push('La coordenada del ERP no es válida (fuera de México)');
  }

  if (hasCoords) {
    const coordsInZone = inBounds(lat as number, lng as number, VALLEY_BOUNDS);

    if (textInZone === true && !coordsInZone) {
      return { status: 'revisar', reasons: [...reasons, 'La coordenada cae fuera del Valle de México, pero la dirección dice ' + state] };
    }
    if (textInZone === false && coordsInZone) {
      return { status: 'revisar', reasons: [...reasons, `La dirección dice ${state}, pero la coordenada cae en el Valle de México`] };
    }
    if (!coordsInZone) {
      return { status: 'fuera_zona', reasons: [...reasons, state ? `Destino en ${state}` : 'Coordenada fuera del Valle de México'] };
    }
    if (textInvalid) reasons.push('Sin dirección en texto; se usa la coordenada');
    return { status: 'listo', reasons };
  }

  if (textInvalid) {
    return { status: 'revisar', reasons: [...reasons, addressText.trim() ? 'El texto no parece una dirección' : 'Sin dirección'] };
  }
  if (textInZone === false) {
    return { status: 'fuera_zona', reasons: [...reasons, `Destino en ${state}`] };
  }
  if (textInZone === null) reasons.push('La dirección no indica estado; se buscará en el Valle de México');
  if (source === 'manual') reasons.push('Dirección capturada a mano');
  return { status: 'geocodificar', reasons };
}

// ─── Proceso principal ───────────────────────────────────────

let stopCounter = 0;
function newStopId(): string {
  stopCounter += 1;
  return `erp-${Date.now().toString(36)}-${stopCounter}`;
}

/**
 * Procesa las filas crudas de la primera hoja (arreglo de arreglos,
 * fila 0 = encabezados) y devuelve paradas agrupadas y clasificadas.
 */
export function processErpRows(rows: unknown[][]): ErpImportResult {
  const errors: string[] = [];
  const empty: ErpImportResult = {
    stops: [],
    stats: { totalRows: 0, rowsInLocation: 0, invoices: 0, stops: 0, ignoredLocations: {}, repairedTexts: 0 },
    errors,
  };

  if (!rows || rows.length < 2) {
    errors.push('El archivo no tiene filas de datos.');
    return empty;
  }

  const { map, missing } = mapHeaders(rows[0]);
  if (missing.length > 0) {
    errors.push(`Faltan columnas en el archivo: ${missing.map(f => FIELD_LABELS[f]).join(', ')}.`);
    return empty;
  }

  const get = (row: unknown[], f: Field): unknown => (map[f] === undefined ? undefined : row[map[f] as number]);
  const allowed = ALLOWED_LOCATIONS.map(normalizeAddress);

  let repairedTexts = 0;
  const repair = (s: string): string => {
    const r = fixMojibake(s);
    if (r.repaired) repairedTexts += 1;
    return r.value;
  };

  const invoicesById = new Map<string, ErpInvoice>();
  const ignoredLocations: Record<string, number> = {};
  let totalRows = 0;
  let rowsInLocation = 0;

  for (const row of rows.slice(1)) {
    const invoiceId = cellText(get(row, 'invoice'));
    // Fila separadora de guiones o fila vacía al final del reporte
    if (!invoiceId) continue;
    totalRows += 1;

    const location = cellText(get(row, 'location'));
    if (!allowed.includes(normalizeAddress(location))) {
      const key = location || '(sin localización)';
      ignoredLocations[key] = (ignoredLocations[key] || 0) + 1;
      continue;
    }
    rowsInLocation += 1;

    const description = repair(cellText(get(row, 'itemDescription')));
    const quantity = parseNumber(get(row, 'quantity')) ?? 0;
    const item: ErpItem = {
      code: cellText(get(row, 'itemCode')),
      description,
      quantity,
      nonMerchandise: NON_MERCHANDISE.test(normalizeAddress(description)),
    };

    const amount = parseNumber(get(row, 'amount'));
    const existing = invoicesById.get(invoiceId);

    if (existing) {
      existing.items.push(item);
      if (!item.nonMerchandise) existing.pieces += quantity;
      // Regla: el monto es el total del documento repetido en cada partida → se toma una vez
      if (existing.amount !== amount) existing.amountMismatch = true;
      continue;
    }

    const lat = parseNumber(get(row, 'lat'));
    const lng = parseNumber(get(row, 'lng'));

    invoicesById.set(invoiceId, {
      invoice: invoiceId,
      date: cellText(get(row, 'date')) || null,
      amount,
      amountMismatch: false,
      clientNumber: cellText(get(row, 'clientNumber')),
      clientName: repair(cellText(get(row, 'clientName'))) || 'Cliente sin nombre',
      location,
      addressText: repair(cellText(get(row, 'address'))),
      lat,
      lng,
      items: [item],
      pieces: item.nonMerchandise ? 0 : quantity,
    });
  }

  if (invoicesById.size === 0) {
    errors.push(`No hay documentos de ${ALLOWED_LOCATIONS.join(', ')} en el archivo.`);
    return { ...empty, stats: { ...empty.stats, totalRows, ignoredLocations, repairedTexts } };
  }

  // ── Agrupar facturas en paradas: mismo cliente + misma ubicación ──
  const stops: ErpStop[] = [];
  const stopsByClient = new Map<string, ErpStop[]>();

  for (const inv of Array.from(invoicesById.values())) {
    const clientKey = inv.clientNumber || normalizeAddress(inv.clientName);
    const clientStops = stopsByClient.get(clientKey) || [];
    const invHasCoords = inv.lat !== null && inv.lng !== null;
    const invNorm = normalizeAddress(inv.addressText);

    const match = clientStops.find(s => {
      if (invHasCoords && s.lat !== null && s.lng !== null) {
        return metersBetween(inv.lat as number, inv.lng as number, s.lat, s.lng) <= SAME_STOP_METERS;
      }
      return invNorm.length > 0 && s.invoices.some(i => normalizeAddress(i.addressText) === invNorm);
    });

    if (match) {
      match.invoices.push(inv);
      match.pieces += inv.pieces;
      match.amount += inv.amount ?? 0;
      // Si la parada no tenía coordenadas y esta factura sí, se adoptan
      if (match.lat === null && invHasCoords) {
        match.lat = inv.lat;
        match.lng = inv.lng;
        match.source = 'erp';
      }
      if (isInvalidAddress(match.addressText) && !isInvalidAddress(inv.addressText)) {
        match.addressText = inv.addressText;
      }
      continue;
    }

    const stop: ErpStop = {
      id: newStopId(),
      clientNumber: inv.clientNumber,
      clientName: inv.clientName,
      addressText: inv.addressText,
      lat: invHasCoords ? inv.lat : null,
      lng: invHasCoords ? inv.lng : null,
      source: invHasCoords ? 'erp' : 'texto',
      status: 'geocodificar',
      reasons: [],
      invoices: [inv],
      pieces: inv.pieces,
      amount: inv.amount ?? 0,
    };
    clientStops.push(stop);
    stopsByClient.set(clientKey, clientStops);
    stops.push(stop);
  }

  for (const stop of stops) {
    const c = classifyStop(stop.addressText, stop.lat, stop.lng, stop.source);
    stop.status = c.status;
    stop.reasons = c.reasons;
    if (stop.invoices.some(i => i.amountMismatch)) {
      stop.reasons.push('Un documento trae montos distintos entre sus partidas; se tomó el primero');
    }
  }

  // Orden útil para revisar: primero lo que requiere atención
  const order: Record<StopStatus, number> = { revisar: 0, fuera_zona: 1, geocodificar: 2, listo: 3 };
  stops.sort((a, b) => order[a.status] - order[b.status] || a.clientName.localeCompare(b.clientName, 'es'));

  return {
    stops,
    stats: {
      totalRows,
      rowsInLocation,
      invoices: invoicesById.size,
      stops: stops.length,
      ignoredLocations,
      repairedTexts,
    },
    errors,
  };
}
