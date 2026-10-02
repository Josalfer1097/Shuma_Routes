import type { Route } from '@/types';

/**
 * Excel de asignaciones (reemplaza al CSV básico).
 *
 * Hoja "Asignaciones": una fila por factura, agrupada por ruta y por parada.
 * Las columnas de la parada (No., cliente y dirección) se combinan cuando un cliente
 * tiene varias facturas en la misma dirección: se ven juntas, nunca revueltas.
 * Hoja "Resumen": totales por ruta.
 *
 * ExcelJS se carga solo al exportar (import dinámico) para no pesar en la pantalla.
 */

export interface AcceptedRouteCode {
  vehicleId: string;
  routeCode: string | null;
}

const BRAND = 'FF0047AB';       // azul Shuma
const DARK = 'FF0A1628';        // superficie oscura
const BAND = 'FFDCE8F7';        // banda de ruta
const ZEBRA = 'FFF4F7FB';       // parada alterna
const BORDER = 'FFC9D6E6';
const MONEY_FMT = '"$"#,##0.00';

const COLUMNS = [
  { header: 'Ruta', key: 'route', width: 18 },
  { header: 'Chofer', key: 'driver', width: 18 },
  { header: 'Vehículo', key: 'vehicle', width: 12 },
  { header: 'Parada', key: 'stop', width: 8 },
  { header: 'Cód. cliente', key: 'clientCode', width: 12 },
  { header: 'Cliente', key: 'client', width: 30 },
  { header: 'Dirección', key: 'address', width: 55 },
  { header: 'Factura', key: 'invoice', width: 17 },
  { header: 'Monto', key: 'amount', width: 14 },
  { header: 'Piezas', key: 'pieces', width: 9 },
  { header: 'Estatus', key: 'status', width: 14 },
] as const;

interface InvoiceRow {
  invoice: string;
  amount: number | null;
  pieces: number | null;
}

function invoicesOf(route: Route, stopIndex: number): InvoiceRow[] {
  const addr = route.stops[stopIndex].address;
  if (Array.isArray(addr.invoices) && addr.invoices.length > 0) {
    return addr.invoices.map(i => ({ invoice: i.invoice, amount: i.amount, pieces: i.pieces }));
  }
  return [{ invoice: addr.invoice || 'SIN-FACTURA', amount: addr.merchandiseValue ?? null, pieces: null }];
}

export async function downloadAssignmentsExcel(
  routes: Route[],
  codes: AcceptedRouteCode[],
  generatedBy: string
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Shuma Rutas';
  wb.created = new Date();

  const codeByVehicle = new Map(codes.map(c => [c.vehicleId, c.routeCode]));
  const routeLabel = (r: Route) => codeByVehicle.get(r.vehicleId) || 'Sin código';
  const now = new Date();
  const dateLong = now.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const stamp = now.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' });

  const thin = { style: 'thin' as const, color: { argb: BORDER } };
  const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

  // ───────────────────────── Hoja Asignaciones ─────────────────────────
  const ws = wb.addWorksheet('Asignaciones', {
    views: [{ state: 'frozen', ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  ws.columns = COLUMNS.map(c => ({ key: c.key, width: c.width }));

  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const title = ws.getCell(1, 1);
  title.value = 'Asignaciones de rutas — ' + dateLong;
  title.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  title.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const sub = ws.getCell(2, 1);
  sub.value = 'Generado ' + stamp + ' por ' + generatedBy + ' · ' + routes.length + (routes.length === 1 ? ' ruta' : ' rutas');
  sub.font = { italic: true, size: 10, color: { argb: 'FF4A5D78' } };
  sub.alignment = { indent: 1 };

  const header = ws.getRow(4);
  COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = allBorders;
  });
  header.height = 22;

  let rowIdx = 5;
  let grandInvoices = 0;
  let grandAmount = 0;
  const summary: Array<{ code: string; driver: string; vehicle: string; stops: number; invoices: number; pieces: number; amount: number; km: number; minutes: number }> = [];

  routes.forEach(route => {
    const code = routeLabel(route);
    const routeInvoices = route.stops.map((_, i) => invoicesOf(route, i));
    const nInvoices = routeInvoices.reduce((n, inv) => n + inv.length, 0);
    const amount = routeInvoices.flat().reduce((n, i) => n + (i.amount ?? 0), 0);
    const pieces = routeInvoices.flat().reduce((n, i) => n + (i.pieces ?? 0), 0);

    // Banda de la ruta con sus totales
    ws.mergeCells(rowIdx, 1, rowIdx, COLUMNS.length);
    const band = ws.getCell(rowIdx, 1);
    band.value = code + '  ·  ' + route.driverName + (route.matricula ? ' (' + route.matricula + ')' : '') +
      '  ·  ' + route.stops.length + ' paradas  ·  ' + nInvoices + ' facturas  ·  $' +
      amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    band.font = { bold: true, size: 11, color: { argb: 'FF0A1628' } };
    band.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    band.alignment = { vertical: 'middle', indent: 1 };
    band.border = allBorders;
    ws.getRow(rowIdx).height = 20;
    rowIdx += 1;

    route.stops.forEach((stop, s) => {
      const invs = routeInvoices[s];
      const first = rowIdx;
      const fill = s % 2 === 1 ? { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: ZEBRA } } : undefined;

      invs.forEach(inv => {
        const row = ws.getRow(rowIdx);
        row.values = {
          route: code,
          driver: route.driverName,
          vehicle: route.matricula || '',
          stop: s + 1,
          clientCode: stop.address.clientCode || '',
          client: stop.address.clientName || stop.address.name || '',
          address: stop.address.raw || '',
          invoice: inv.invoice,
          amount: inv.amount ?? null,
          pieces: inv.pieces ?? null,
          status: 'Asignada',
        };
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          if (col > COLUMNS.length) return;
          cell.border = allBorders;
          cell.alignment = { vertical: 'middle', wrapText: col === 7, horizontal: col === 4 || col === 10 ? 'center' : undefined };
          if (fill) cell.fill = fill;
        });
        row.getCell('amount').numFmt = MONEY_FMT;
        rowIdx += 1;
      });

      // Varias facturas en la misma parada: se combinan las celdas de la parada
      if (invs.length > 1) {
        for (const col of [4, 5, 6, 7]) {
          ws.mergeCells(first, col, rowIdx - 1, col);
          ws.getCell(first, col).alignment = { vertical: 'middle', wrapText: col === 7, horizontal: col === 4 ? 'center' : undefined };
        }
      }
    });

    grandInvoices += nInvoices;
    grandAmount += amount;
    summary.push({
      code,
      driver: route.driverName,
      vehicle: route.matricula || '',
      stops: route.stops.length,
      invoices: nInvoices,
      pieces,
      amount,
      km: Math.round(((route.totalDistance || 0) / 1000) * 10) / 10,
      minutes: Math.round((route.totalDuration || 0) / 60),
    });
  });

  // Total general
  const total = ws.getRow(rowIdx + 1);
  ws.mergeCells(rowIdx + 1, 1, rowIdx + 1, 7);
  total.getCell(1).value = 'Total: ' + routes.length + ' rutas · ' + summary.reduce((n, r) => n + r.stops, 0) + ' paradas · ' + grandInvoices + ' facturas';
  total.getCell(9).value = grandAmount;
  total.getCell(9).numFmt = MONEY_FMT;
  [1, 9].forEach(c => {
    total.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    total.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(rowIdx - 1, 4), column: COLUMNS.length } };

  // ───────────────────────── Hoja Resumen ─────────────────────────
  const rs = wb.addWorksheet('Resumen');
  rs.columns = [
    { header: 'Ruta', key: 'code', width: 18 },
    { header: 'Chofer', key: 'driver', width: 20 },
    { header: 'Vehículo', key: 'vehicle', width: 12 },
    { header: 'Paradas', key: 'stops', width: 10 },
    { header: 'Facturas', key: 'invoices', width: 10 },
    { header: 'Piezas', key: 'pieces', width: 10 },
    { header: 'Monto', key: 'amount', width: 16 },
    { header: 'Km', key: 'km', width: 10 },
    { header: 'Tiempo (min)', key: 'minutes', width: 13 },
  ];
  rs.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = allBorders;
  });
  summary.forEach(r => {
    const row = rs.addRow(r);
    row.eachCell({ includeEmpty: true }, cell => { cell.border = allBorders; });
    row.getCell('amount').numFmt = MONEY_FMT;
  });
  rs.views = [{ state: 'frozen', ySplit: 1 }];

  // ───────────────────────── Descarga ─────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'asignaciones_' + now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) + '.xlsx';
  link.click();
  URL.revokeObjectURL(link.href);
}
