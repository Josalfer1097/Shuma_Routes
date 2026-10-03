import type { Route } from '@/types';

/**
 * Excel de asignaciones v2.
 *
 * Hojas:
 *  1. "Resumen"  → una fila por ruta y totales del día. Los totales son FÓRMULAS que leen
 *     cada hoja de ruta: si alguien corrige un monto, el resumen se actualiza solo.
 *     Cada código de ruta es un enlace a su hoja.
 *  2. Una hoja por ruta ("RT-… Chofer") → hoja de ruta IMPRIMIBLE para entregar al chofer:
 *     encabezado con datos de la ruta, paradas en orden con hora estimada de llegada,
 *     facturas de cada parada agrupadas y una columna "Recibió" para nombre y firma.
 *  3. "Datos" → una fila por factura, sin celdas combinadas, para filtrar y hacer tablas.
 *
 * ExcelJS se carga solo al exportar (import dinámico).
 */

export interface AcceptedRouteCode {
  vehicleId: string;
  routeCode: string | null;
}

const FONT = 'Arial';
const BRAND = 'FF0047AB';
const DARK = 'FF0A1628';
const LIGHT = 'FFDCE8F7';
const ZEBRA = 'FFF4F7FB';
const BORDER = 'FFC9D6E6';
const MUTED = 'FF4A5D78';
const MONEY = '"$"#,##0.00';
const ROUTE_HEADERS = ['Parada', 'Llegada', 'Cliente', 'Dirección', 'Factura', 'Monto', 'Piezas', 'Recibió (nombre y firma)'];

interface InvoiceRow {
  invoice: string;
  amount: number | null;
  pieces: number | null;
}

function invoicesOfStop(route: Route, s: number): InvoiceRow[] {
  const addr = route.stops[s].address;
  if (Array.isArray(addr.invoices) && addr.invoices.length > 0) {
    return addr.invoices.map(i => ({ invoice: i.invoice, amount: i.amount, pieces: i.pieces }));
  }
  return [{ invoice: addr.invoice || 'SIN-FACTURA', amount: addr.merchandiseValue ?? null, pieces: null }];
}

function routeTotal(route: Route, field: 'amount' | 'pieces'): number {
  return route.stops.reduce((n, _s, i) => n + invoicesOfStop(route, i).reduce((m, inv) => m + (inv[field] ?? 0), 0), 0);
}

/** "HH:MM" a minutos del día; acepta también una fecha ISO (en horario de CDMX). */
function toMinutes(value: string | undefined | null, fallback: string): number {
  const v = value || fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(v);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    const hhmm = d.toLocaleTimeString('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
    return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  }
  return 8 * 60;
}

/** Renglones que ocupa un texto en una columna (aprox. 1.15 caracteres por unidad de ancho en Arial 10). */
function linesFor(text: string, colWidth: number): number {
  const perLine = Math.max(8, Math.floor(colWidth * 1.05));
  return Math.max(1, Math.ceil((text || '').length / perLine));
}

function clock(min: number): string {
  const m = Math.round(min);
  const hh = Math.floor(m / 60) % 24;
  return String(hh).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') + (m >= 24 * 60 ? ' (+1 día)' : '');
}

/** Nombre de hoja válido para Excel: máx. 31 caracteres y sin \ / ? * [ ] : */
function sheetName(base: string, used: Set<string>): string {
  let name = base.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Ruta';
  let n = 2;
  while (used.has(name)) {
    const suffix = ' ' + n++;
    name = name.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

/** Referencia a una celda de otra hoja (el nombre va entre comillas simples por los espacios). */
function ref(sheet: string, cell: string): string {
  return "'" + sheet.replace(/'/g, "''") + "'!" + cell;
}

export async function downloadAssignmentsExcel(
  routes: Route[],
  codes: AcceptedRouteCode[],
  generatedBy: string,
  opts: { globalDepartureTime?: string | null } = {}
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  type Cell = import('exceljs').Cell;
  type Font = import('exceljs').Font;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shuma Rutas';
  wb.created = new Date();

  const thin = { style: 'thin' as const, color: { argb: BORDER } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const font = (extra: Partial<Font> = {}): Partial<Font> => ({ name: FONT, size: 10, ...extra });
  const solid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
  const styleHeader = (c: Cell) => {
    c.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
    c.fill = solid(DARK);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = box;
  };

  const codeByVehicle = new Map(codes.map(c => [c.vehicleId, c.routeCode]));
  const now = new Date();
  const dateLong = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const stamp = now.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });
  const used = new Set<string>(['Resumen', 'Datos']);

  // El Resumen va primero en el libro: se crea ahora y se llena al final
  const rs = wb.addWorksheet('Resumen', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const routeSheets: Array<{ name: string; code: string; route: Route; totalRow: number; invoicesCount: number }> = [];
  const flat: Array<Record<string, string | number | null>> = [];

  // ─────────────────────── Una hoja imprimible por ruta ───────────────────────
  routes.forEach(route => {
    const code = codeByVehicle.get(route.vehicleId) || 'Sin código';
    const name = sheetName(code + ' ' + route.driverName, used);
    const ws = wb.addWorksheet(name, {
      views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }],
      pageSetup: {
        paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
        printTitlesRow: '7:7',
      },
      headerFooter: { oddFooter: '&L&8Shuma Rutas · ' + code + '&R&8Página &P de &N' },
    });
    ws.columns = [{ width: 7 }, { width: 9 }, { width: 28 }, { width: 38 }, { width: 17 }, { width: 13 }, { width: 8 }, { width: 24 }];

    ws.mergeCells('A1:H1');
    const title = ws.getCell('A1');
    title.value = 'Hoja de ruta ' + code;
    title.font = font({ bold: true, size: 15, color: { argb: 'FFFFFFFF' } });
    title.fill = solid(BRAND);
    title.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 28;

    const departure = toMinutes(route.departureTime, opts.globalDepartureTime || '08:00');
    const info: Array<[string, string]> = [
      ['Chofer', route.driverName],
      ['Vehículo', (route.matricula || '—') + (route.vehicleType ? ' · ' + route.vehicleType : '')],
      ['Salida', clock(departure) + ' · ' + (route.depot?.name || 'Bodega')],
      ['Recorrido', (Math.round(((route.totalDistance || 0) / 1000) * 10) / 10) + ' km · ' + Math.round((route.totalDuration || 0) / 60) + ' min estimados'],
    ];
    info.forEach(([label, value], i) => {
      const row = 2 + Math.floor(i / 2);
      const col = (i % 2) * 4 + 1;
      ws.getCell(row, col).value = label;
      ws.getCell(row, col).font = font({ bold: true, color: { argb: MUTED } });
      ws.mergeCells(row, col + 1, row, col + 3);
      ws.getCell(row, col + 1).value = value;
      ws.getCell(row, col + 1).font = font({ bold: true });
    });
    ws.mergeCells('A5:H5');
    ws.getCell('A5').value = dateLong + ' · generado ' + stamp + ' por ' + generatedBy;
    ws.getCell('A5').font = font({ italic: true, size: 9, color: { argb: MUTED } });

    ROUTE_HEADERS.forEach((h, i) => {
      const c = ws.getCell(7, i + 1);
      c.value = h;
      styleHeader(c);
    });
    ws.getRow(7).height = 22;

    let r = 8;
    let invoicesCount = 0;
    route.stops.forEach((stop, s) => {
      const invs = invoicesOfStop(route, s);
      const first = r;
      const eta = clock(departure + (stop.eta || 0) / 60);
      const client = (stop.address.clientCode ? stop.address.clientCode + ' · ' : '') + (stop.address.clientName || stop.address.name || '');
      invs.forEach(inv => {
        const row = ws.getRow(r);
        row.values = [s + 1, eta, client, stop.address.raw || '', inv.invoice, inv.amount ?? null, inv.pieces ?? null, ''];
        for (let col = 1; col <= 8; col++) {
          const c = row.getCell(col);
          c.font = font();
          c.border = box;
          c.alignment = { vertical: 'middle', wrapText: col === 3 || col === 4, horizontal: col <= 2 || col === 7 ? 'center' : undefined };
          if (s % 2 === 1) c.fill = solid(ZEBRA);
        }
        row.getCell(6).numFmt = MONEY;
        // Alto suficiente para la dirección y el cliente completos (antes se salían del renglón)
        const neededLines = Math.max(linesFor(stop.address.raw || '', 38), linesFor(client, 28));
        const neededHeight = neededLines * 14 + 8;
        row.height = Math.max(18, Math.ceil(neededHeight / invs.length));
        flat.push({
          code, driver: route.driverName, vehicle: route.matricula || '', stop: s + 1, eta,
          clientCode: stop.address.clientCode || '', client: stop.address.clientName || stop.address.name || '',
          address: stop.address.raw || '', invoice: inv.invoice, amount: inv.amount ?? null, pieces: inv.pieces ?? null,
        });
        r += 1;
      });
      invoicesCount += invs.length;
      // Varias facturas en la misma parada: una sola parada visual, con una sola firma
      if (invs.length > 1) {
        for (const col of [1, 2, 3, 4, 8]) ws.mergeCells(first, col, r - 1, col);
      }
    });

    // Totales con fórmulas: se recalculan si alguien corrige un monto o las piezas
    const totalRow = r;
    const lastData = Math.max(totalRow - 1, 8);
    ws.mergeCells(totalRow, 1, totalRow, 5);
    ws.getCell(totalRow, 1).value = 'Total: ' + route.stops.length + ' paradas · ' + invoicesCount + ' facturas';
    ws.getCell(totalRow, 6).value = { formula: 'SUM(F8:F' + lastData + ')', result: routeTotal(route, 'amount') };
    ws.getCell(totalRow, 7).value = { formula: 'SUM(G8:G' + lastData + ')', result: routeTotal(route, 'pieces') };
    ws.getCell(totalRow, 6).numFmt = MONEY;
    ws.getCell(totalRow, 7).numFmt = '#,##0';
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(totalRow, c);
      cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' } });
      cell.fill = solid(BRAND);
      cell.border = box;
      cell.alignment = { vertical: 'middle', horizontal: c === 7 ? 'center' : undefined, indent: c === 1 ? 1 : undefined };
    }
    ws.getRow(totalRow).height = 22;

    routeSheets.push({ name, code, route, totalRow, invoicesCount });
  });

  // ─────────────────────── Resumen (primera hoja) ───────────────────────
  rs.columns = [{ width: 18 }, { width: 20 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 10 }, { width: 13 }];
  rs.mergeCells('A1:I1');
  rs.getCell('A1').value = 'Asignaciones de rutas — ' + dateLong;
  rs.getCell('A1').font = font({ bold: true, size: 15, color: { argb: 'FFFFFFFF' } });
  rs.getCell('A1').fill = solid(BRAND);
  rs.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
  rs.getRow(1).height = 30;
  rs.mergeCells('A2:I2');
  rs.getCell('A2').value = 'Generado ' + stamp + ' por ' + generatedBy;
  rs.getCell('A2').font = font({ italic: true, color: { argb: MUTED } });

  ['Ruta', 'Chofer', 'Vehículo', 'Paradas', 'Facturas', 'Piezas', 'Monto', 'Km', 'Tiempo (min)'].forEach((h, i) => {
    const c = rs.getCell(4, i + 1);
    c.value = h;
    styleHeader(c);
  });
  rs.getRow(4).height = 22;

  routeSheets.forEach((rsh, i) => {
    const row = 5 + i;
    rs.getCell(row, 1).value = { text: rsh.code, hyperlink: '#' + ref(rsh.name, 'A1') };
    rs.getCell(row, 2).value = rsh.route.driverName;
    rs.getCell(row, 3).value = rsh.route.matricula || '';
    rs.getCell(row, 4).value = rsh.route.stops.length;
    rs.getCell(row, 5).value = rsh.invoicesCount;
    rs.getCell(row, 6).value = { formula: ref(rsh.name, 'G' + rsh.totalRow), result: routeTotal(rsh.route, 'pieces') };
    rs.getCell(row, 7).value = { formula: ref(rsh.name, 'F' + rsh.totalRow), result: routeTotal(rsh.route, 'amount') };
    rs.getCell(row, 8).value = Math.round(((rsh.route.totalDistance || 0) / 1000) * 10) / 10;
    rs.getCell(row, 9).value = Math.round((rsh.route.totalDuration || 0) / 60);
    for (let c = 1; c <= 9; c++) {
      const cell = rs.getCell(row, c);
      cell.font = c === 1 ? font({ color: { argb: BRAND }, underline: true }) : font();
      cell.border = box;
      if (i % 2 === 1) cell.fill = solid(ZEBRA);
    }
    rs.getCell(row, 7).numFmt = MONEY;
    rs.getCell(row, 6).numFmt = '#,##0';
  });

  const tr = 5 + routeSheets.length;
  const lastRow = Math.max(tr - 1, 5);
  rs.getCell(tr, 1).value = 'Total';
  const totals: Record<number, number> = {
    4: routeSheets.reduce((n, x) => n + x.route.stops.length, 0),
    5: routeSheets.reduce((n, x) => n + x.invoicesCount, 0),
    6: routeSheets.reduce((n, x) => n + routeTotal(x.route, 'pieces'), 0),
    7: routeSheets.reduce((n, x) => n + routeTotal(x.route, 'amount'), 0),
    8: routeSheets.reduce((n, x) => n + Math.round(((x.route.totalDistance || 0) / 1000) * 10) / 10, 0),
    9: routeSheets.reduce((n, x) => n + Math.round((x.route.totalDuration || 0) / 60), 0),
  };
  [4, 5, 6, 7, 8, 9].forEach(c => {
    const col = String.fromCharCode(64 + c);
    rs.getCell(tr, c).value = { formula: 'SUM(' + col + '5:' + col + lastRow + ')', result: totals[c] };
  });
  rs.getCell(tr, 7).numFmt = MONEY;
  rs.getCell(tr, 6).numFmt = '#,##0';
  for (let c = 1; c <= 9; c++) {
    const cell = rs.getCell(tr, c);
    cell.font = font({ bold: true });
    cell.fill = solid(LIGHT);
    cell.border = box;
  }
  rs.mergeCells(tr + 2, 1, tr + 2, 9);
  rs.getCell(tr + 2, 1).value = 'Cada código de ruta abre su hoja de ruta imprimible. La hoja "Datos" tiene una fila por factura para filtrar.';
  rs.getCell(tr + 2, 1).font = font({ italic: true, size: 9, color: { argb: MUTED } });

  // ─────────────────────── Datos (para filtrar) ───────────────────────
  const ds = wb.addWorksheet('Datos', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' },
  });
  ds.columns = [
    { header: 'Ruta', key: 'code', width: 17 }, { header: 'Chofer', key: 'driver', width: 16 },
    { header: 'Vehículo', key: 'vehicle', width: 11 }, { header: 'Parada', key: 'stop', width: 8 },
    { header: 'Llegada', key: 'eta', width: 9 }, { header: 'Cód. cliente', key: 'clientCode', width: 12 },
    { header: 'Cliente', key: 'client', width: 28 }, { header: 'Dirección', key: 'address', width: 50 },
    { header: 'Factura', key: 'invoice', width: 17 }, { header: 'Monto', key: 'amount', width: 13 },
    { header: 'Piezas', key: 'pieces', width: 8 },
  ];
  ds.getRow(1).eachCell(c => styleHeader(c));
  flat.forEach(f => {
    const row = ds.addRow(f);
    for (let c = 1; c <= 11; c++) {
      row.getCell(c).font = font();
      row.getCell(c).border = box;
    }
    row.getCell('amount').numFmt = MONEY;
  });
  ds.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(flat.length + 1, 1), column: 11 } };

  // ─────────────────────── Descarga ───────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'asignaciones_' + now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) + '.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}
