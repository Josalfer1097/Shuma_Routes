'use client';

import { useState } from 'react';
import AcceptRouteModal from './AcceptRouteModal';
import type { Route, GlobalConfig } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';
import type { WeatherData } from '@/lib/weather';

interface Props {
  routes: Route[];
  weather?: WeatherData | null;
  globalConfig?: GlobalConfig | null;
  userName?: string;
  userRole?: string;
  onRouteAccepted?: () => void;
}

export default function ReportButton({ routes, weather, globalConfig, userName, userRole, onRouteAccepted }: Props) {
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const handleOpenAcceptModal = async () => {
    setIsChecking(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
      const res = await fetch(`/api/routes/active?date=${today}`);
      const json = await res.json();
      if (json.ok && json.routes) {
        const existingDrivers = [];
        for (const route of routes) {
          if (json.routes.some((active: any) => active.driver_name === route.driverName)) {
            existingDrivers.push(route.driverName);
          }
        }
        if (existingDrivers.length > 0) {
          setDuplicateWarning(`ATENCIÓN: ${existingDrivers.join(', ')} ya tiene(n) una ruta asignada para hoy. Si guardas, reemplazarás la ruta actual de este(os) chofer(es).`);
        } else {
          setDuplicateWarning(null);
        }
      }
    } catch (e) {
      console.error('Error verificando rutas activas', e);
      setDuplicateWarning(null);
    } finally {
      setIsChecking(false);
      setIsAcceptModalOpen(true);
    }
  };

  if (routes.length === 0) return null;

  const handleGeneratePDF = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    const now    = new Date();
    const year   = now.getFullYear();

    // ── Colores corporativos ──
    const NAVY   = [30, 58, 138]  as [number,number,number]; // #1E3A8A
    const SLATE8 = [30, 41, 59]   as [number,number,number]; // slate-800
    const SLATE6 = [71, 85, 105]  as [number,number,number]; // slate-600
    const SLATE5 = [100,116,139]  as [number,number,number]; // slate-500
    const SLATE2 = [226,232,240]  as [number,number,number]; // slate-200
    const SLATE0 = [248,250,252]  as [number,number,number]; // slate-50
    const GREEN  = [16, 185, 129] as [number,number,number]; // emerald-500
    const AMBER  = [217,119,6]    as [number,number,number]; // amber-600
    const RED    = [220,38,38]    as [number,number,number];  // red-600
    const WHITE  = [255,255,255]  as [number,number,number];
    const GOLD   = [180,135,40]   as [number,number,number];

    const LUNCH_MINS = 60; // Hora de comida fija

    const dateStr = now.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const dateFormatted   = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    const timeStr         = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    const generationStamp = `${dateFormatted}, ${timeStr} hrs`;

    // ── Helpers ──
    const fmtMins = (mins: number) => {
      if (mins <= 0) return '0m';
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };
    const fmtKm = (meters: number) => `${(meters / 1000).toFixed(1)} km`;

    const getUnloadMins = (vehicleType?: string) => {
      if (vehicleType === 'Camión grande') return globalConfig?.unloadConfig?.truckLarge ?? 20;
      if (vehicleType === 'Camión chico')  return globalConfig?.unloadConfig?.truckSmall ?? 18;
      return globalConfig?.unloadConfig?.van ?? 15;
    };

    const [dH, dM] = (globalConfig?.deadlineTime || '17:45').split(':').map(Number);
    const deadlineMins = dH * 60 + dM;

    // ── Calcular métricas por ruta ──
    const routeMetrics = routes.map(route => {
      const depStr   = route.departureTime || globalConfig?.departureTime || '08:00';
      const [rH, rM] = depStr.split(':').map(Number);
      const depMins  = (rH || 0) * 60 + (rM || 0);

      const unloadPerStop = getUnloadMins(route.vehicleType);
      const transitMins   = Math.round((route.totalDuration || 0) / 60);
      const unloadMins    = route.stops.length * unloadPerStop;
      const totalMins     = transitMins + unloadMins + LUNCH_MINS;
      const returnMins    = depMins + totalMins;

      const retH    = Math.floor(returnMins / 60) % 24;
      const retM    = returnMins % 60;
      const etaRet  = `${retH.toString().padStart(2,'0')}:${retM.toString().padStart(2,'0')}`;

      const status  = returnMins > deadlineMins ? 'FUERA'
                    : returnMins > deadlineMins - 30 ? 'RIESGO'
                    : 'OK';

      const totalValor = route.stops.reduce((acc, s) => acc + ((s.address as any).merchandiseValue || 0), 0);

      return {
        route, depStr, depMins,
        transitMins, unloadMins, totalMins, returnMins,
        etaRet, status, totalValor,
        unloadPerStop,
      };
    });

    // Totales globales
    const totalStops    = routes.reduce((a, r) => a + r.stops.length, 0);
    const totalDistM    = routes.reduce((a, r) => a + (r.totalDistance || 0), 0);
    const totalTransit  = routeMetrics.reduce((a, m) => a + m.transitMins, 0);
    const totalUnload   = routeMetrics.reduce((a, m) => a + m.unloadMins, 0);
    const totalLunch    = routes.length * LUNCH_MINS;
    const grandTotal    = totalTransit + totalUnload + totalLunch;
    const totalValorAll = routeMetrics.reduce((a, m) => a + m.totalValor, 0);

    // ════════════════════════════════════════════════════════════════
    // PÁGINA 1 — PORTADA EJECUTIVA
    // ════════════════════════════════════════════════════════════════

    // Franja superior navy
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 42, 'F');

    // Logo / Empresa
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...WHITE);
    doc.text('SHUMA RUTAS', 20, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(147, 197, 253); // blue-300
    doc.text('Sistema de Optimización de Entregas · Grupo Shuma', 20, 25);

    // Título del documento
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text('REPORTE DE RUTAS DE ENTREGA', 20, 35);

    // Fecha generación (derecha)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(147, 197, 253);
    doc.text(`Generado: ${generationStamp}`, pageW - 20, 35, { align: 'right' });

    // ── KPI Cards (4 tarjetas en fila) ──
    const kpiY  = 52;
    const kpiW  = 40;
    const kpiGap = 4.5;
    const cards = [
      { label: 'CHOFERES',     value: routes.length.toString(),     color: NAVY },
      { label: 'ENTREGAS',     value: totalStops.toString(),         color: [5,150,105] as [number,number,number] },
      { label: 'DISTANCIA',    value: fmtKm(totalDistM),             color: [124,58,237] as [number,number,number] },
      { label: 'TIEMPO TOTAL', value: fmtMins(grandTotal),           color: [217,119,6] as [number,number,number] },
    ];

    cards.forEach((card, i) => {
      const x = 20 + i * (kpiW + kpiGap);
      doc.setFillColor(...card.color);
      doc.roundedRect(x, kpiY, kpiW, 22, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...WHITE);
      doc.text(card.value, x + kpiW / 2, kpiY + 11, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(200, 220, 255);
      doc.text(card.label, x + kpiW / 2, kpiY + 17, { align: 'center' });
    });

    // ── Tabla resumen de tiempo (breakdown) ──
    const breakY = kpiY + 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE8);
    doc.text('Desglose de Tiempo Total de la Flota', 20, breakY);

    autoTable(doc, {
      startY: breakY + 4,
      head: [['Concepto', 'Tiempo', '% del Total']],
      body: [
        ['🚗 Tránsito en ruta (conducción)', fmtMins(totalTransit), `${Math.round(totalTransit/grandTotal*100)}%`],
        ['📦 Tiempo de descarga en paradas', fmtMins(totalUnload),  `${Math.round(totalUnload/grandTotal*100)}%`],
        ['🍽️ Hora de comida (todos los choferes)', fmtMins(totalLunch), `${Math.round(totalLunch/grandTotal*100)}%`],
        ['⏱️ TIEMPO OPERATIVO TOTAL', fmtMins(grandTotal), '100%'],
      ],
      margin: { left: 20, right: 20 },
      theme: 'striped',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8.5 },
      alternateRowStyles: { fillColor: SLATE0 },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: SLATE2, lineWidth: 0.1, textColor: SLATE6 },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === 3) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [219, 234, 254]; // blue-100
          data.cell.styles.textColor = NAVY;
        }
      },
    });

    // ── Tabla resumen por chofer ──
    const summaryY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE8);
    doc.text('Resumen de Rutas por Chofer', 20, summaryY);

    const summaryRows = routeMetrics.map(m => {
      const statusIcon = m.status === 'OK' ? '✓ En tiempo' : m.status === 'RIESGO' ? '⚠ Riesgo' : '✗ Excede límite';
      const valorStr = m.totalValor > 0 ? `$${m.totalValor.toLocaleString('es-MX')}` : '—';
      return [
        m.route.driverName,
        m.route.matricula || '—',
        m.route.stops.length.toString(),
        fmtKm(m.route.totalDistance || 0),
        m.depStr,
        m.etaRet,
        fmtMins(m.transitMins),
        fmtMins(m.unloadMins),
        valorStr,
        statusIcon,
      ];
    });

    autoTable(doc, {
      startY: summaryY + 4,
      head: [['Chofer','Matrícula','Entregas','Dist.','Salida','Regreso est.','Tránsito','Descarga','Valor ruta','Estado']],
      body: summaryRows,
      margin: { left: 20, right: 20 },
      theme: 'striped',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: SLATE0 },
      styles: { font: 'helvetica', fontSize: 7, cellPadding: 2, lineColor: SLATE2, lineWidth: 0.1, textColor: SLATE6 },
      columnStyles: {
        2: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' },
        6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'right' },
        9: { halign: 'center' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 9) {
          const v = data.cell.raw as string;
          if (v.includes('Excede')) data.cell.styles.textColor = RED;
          else if (v.includes('Riesgo')) data.cell.styles.textColor = AMBER;
          else data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.section === 'body' && data.column.index === 8 && data.cell.raw !== '—') {
          data.cell.styles.textColor = GOLD;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // ── Nota de condiciones ──
    const noteY = (doc as any).lastAutoTable.finalY + 8;
    if (noteY + 24 < pageH - 25) {
      doc.setFillColor(...SLATE0);
      doc.setDrawColor(...SLATE2);
      doc.roundedRect(20, noteY, pageW - 40, 22, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY);
      doc.text('Consideraciones Generales', 24, noteY + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE6);
      const considerations = [
        `• Hora de comida incluida: ${LUNCH_MINS} minutos por chofer`,
        `• Tiempo de descarga: ${getUnloadMins('Camión grande')}m camión grande · ${getUnloadMins('Camión chico')}m camión chico · ${getUnloadMins('Camioneta')}m camioneta`,
        weather ? `• Clima CDMX: ${weather.temp}°C — ${weather.description.charAt(0).toUpperCase() + weather.description.slice(1)} · Humedad: ${weather.humidity}% · Viento: ${weather.windSpeed} km/h` : '• Clima CDMX: No disponible',
      ];
      considerations.forEach((line, i) => doc.text(line, 24, noteY + 13 + i * 4));
    }

    // ════════════════════════════════════════════════════════════════
    // PÁGINAS SIGUIENTES — UNA POR CHOFER
    // ════════════════════════════════════════════════════════════════

    routeMetrics.forEach(({ route, depStr, transitMins, unloadMins, etaRet, status, totalValor, unloadPerStop }) => {
      doc.addPage();

      // ── Header franja navy ──
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, pageW, 28, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...WHITE);
      doc.text(route.driverName, 20, 13);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(147, 197, 253);
      doc.text(`${route.vehicleType || 'Vehículo'}  ·  Matrícula: ${route.matricula || '—'}`, 20, 20);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(`Salida: ${depStr}`, pageW - 20, 13, { align: 'right' });
      doc.setTextColor(147, 197, 253);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Regreso est.: ${etaRet}`, pageW - 20, 20, { align: 'right' });

      // ── 4 KPI cards del chofer ──
      const cY = 34;
      const cW = 40; const cG = 4.5;
      const chCards = [
        { label: 'ENTREGAS',      value: route.stops.length.toString(),         color: [5,150,105] as [number,number,number] },
        { label: 'DISTANCIA',     value: fmtKm(route.totalDistance || 0),        color: [124,58,237] as [number,number,number] },
        { label: 'TRÁNSITO',      value: fmtMins(transitMins),                   color: NAVY },
        { label: 'TOTAL + PAUSA', value: fmtMins(transitMins + unloadMins + LUNCH_MINS), color: [217,119,6] as [number,number,number] },
      ];
      chCards.forEach((card, i) => {
        const x = 20 + i * (cW + cG);
        doc.setFillColor(...card.color);
        doc.roundedRect(x, cY, cW, 18, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...WHITE);
        doc.text(card.value, x + cW / 2, cY + 8, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(200, 220, 255);
        doc.text(card.label, x + cW / 2, cY + 13, { align: 'center' });
      });

      // ── Info box: bodegas, tiempos, límite ──
      const infoY = cY + 24;
      doc.setFillColor(...SLATE0);
      doc.setDrawColor(...SLATE2);
      doc.roundedRect(20, infoY, pageW - 40, 30, 2, 2, 'FD');

      const col1x = 24; const col2x = pageW / 2 + 2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...NAVY);

      const labels1 = ['Bodega salida:', 'Bodega regreso:', 'Tiempo tránsito:'];
      const vals1 = [
        route.depot.name,
        route.endDepot?.name || route.depot.name,
        fmtMins(transitMins),
      ];
      const labels2 = ['Tiempo descarga:', 'Hora de comida:', 'Límite de regreso:'];
      const vals2 = [
        `${fmtMins(unloadMins)} (${unloadPerStop}m x parada)`,
        fmtMins(LUNCH_MINS),
        globalConfig?.deadlineTime || '17:45',
      ];

      labels1.forEach((lbl, i) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...NAVY);
        doc.text(lbl, col1x, infoY + 8 + i * 7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...SLATE6);
        doc.text(vals1[i], col1x + 28, infoY + 8 + i * 7);
      });
      labels2.forEach((lbl, i) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...NAVY);
        doc.text(lbl, col2x, infoY + 8 + i * 7);
        doc.setFont('helvetica', 'normal');
        if (i === 2) {
          doc.setTextColor(...(status === 'OK' ? GREEN : status === 'RIESGO' ? AMBER : RED));
          doc.setFont('helvetica', 'bold');
        } else {
          doc.setTextColor(...SLATE6);
        }
        doc.text(vals2[i], col2x + 30, infoY + 8 + i * 7);
      });

      // ── Tabla de paradas ──
      const tableY = infoY + 36;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...SLATE8);
      doc.text('Detalle de Paradas', 20, tableY);

      let accumulated = 0;
      const stopRows = route.stops.map((stop) => {
        if (stop.distance != null) accumulated = stop.distance;
        const valor = (stop.address as any).merchandiseValue;
        const valorStr = valor && valor > 0 ? `$${Number(valor).toLocaleString('es-MX')}` : '—';
        const etaMin = stop.eta != null ? Math.round(stop.eta / 60) : null;
        const etaStr = etaMin != null ? fmtMins(etaMin) : '—';
        const invStr = stop.address.invoice || '—';
        const clientStr = stop.address.clientName || stop.address.name || '—';
        return [
          stop.sequence.toString(),
          clientStr,
          invStr,
          stop.address.raw || '—',
          accumulated > 0 ? fmtKm(accumulated) : '—',
          etaStr,
          valorStr,
        ];
      });

      autoTable(doc, {
        startY: tableY + 4,
        head: [['#', 'Cliente', 'Factura', 'Dirección', 'Dist. acum.', 'ETA', 'Valor']],
        body: stopRows,
        margin: { left: 20, right: 20 },
        theme: 'striped',
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: SLATE0 },
        styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2.5, lineColor: SLATE2, lineWidth: 0.1, textColor: SLATE6 },
        columnStyles: {
          0: { halign: 'center', cellWidth: 8 },
          1: { cellWidth: 30 },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 60 },
          4: { halign: 'right', cellWidth: 18 },
          5: { halign: 'center', cellWidth: 18 },
          6: { halign: 'right', cellWidth: 18 },
        },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 6 && data.cell.raw !== '—') {
            const val = parseFloat(String(data.cell.raw).replace(/[$,]/g, ''));
            if (val >= 10000) {
              data.cell.styles.textColor = GOLD;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });

      // ── Caja de consideraciones específicas ──
      const consY = (doc as any).lastAutoTable.finalY + 6;
      if (consY + 28 < pageH - 22) {
        doc.setFillColor(...SLATE0);
        doc.setDrawColor(...SLATE2);
        doc.roundedRect(20, consY, pageW - 40, 28, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...NAVY);
        doc.text('Consideraciones de la Ruta', 24, consY + 7);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...SLATE6);

        const invoices = route.invoices || route.stops.map(s => s.address.invoice).filter(Boolean).join(', ') || 'Ver tabla';
        const considerations2 = [
          `• Tiempo de descarga: ${unloadPerStop} min por parada · ${route.stops.length} paradas = ${fmtMins(route.stops.length * unloadPerStop)} total`,
          `• Hora de comida: ${LUNCH_MINS} min incluidos en el cálculo de regreso`,
          weather ? `• Clima: ${weather.temp}°C — ${weather.description} · ${weather.alerts.length > 0 ? '⚠ ' + weather.alerts[0] : 'Sin alertas'}` : '',
          totalValor > 0 ? `• Valor total de mercancía en esta ruta: $${totalValor.toLocaleString('es-MX')} MXN` : '',
        ].filter(Boolean);

        considerations2.forEach((line, i) => {
          doc.text(line, 24, consY + 13 + i * 4);
        });
      }
    });

    // ════════════════════════════════════════════════════════════════
    // FOOTERS EN TODAS LAS PÁGINAS
    // ════════════════════════════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...SLATE2);
      doc.setLineWidth(0.2);
      doc.line(20, pageH - 18, pageW - 20, pageH - 18);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...SLATE5);
      doc.text(`Grupo Shuma © ${year} — Documento confidencial`, 20, pageH - 12);
      if (i > 1) {
        doc.text(`Página ${i} de ${totalPages}`, pageW - 20, pageH - 12, { align: 'right' });
      }
      // Franja navy sutil en footer
      doc.setFillColor(...NAVY);
      doc.rect(0, pageH - 5, pageW, 5, 'F');
    }

    doc.save(`reporte-rutas-shuma-${now.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-2.5">
      <button
        onClick={handleOpenAcceptModal}
        disabled={isChecking}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                   bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600
                   border border-green-500 hover:border-green-400
                   text-sm font-semibold text-white transition-all duration-200
                   shadow-lg shadow-green-900/30 hover:shadow-green-800/40 disabled:opacity-50"
      >
        {isChecking ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {isChecking ? 'Verificando...' : 'Aceptar Ruta'}
      </button>
      
      <button
        onClick={handleGeneratePDF}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                   bg-blue-600 hover:bg-blue-500 border border-blue-500 hover:border-blue-400
                   text-sm font-semibold text-white transition-all duration-200
                   shadow-lg shadow-blue-900/30 hover:shadow-blue-800/40"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Descargar PDF
      </button>

      <AcceptRouteModal
        isOpen={isAcceptModalOpen}
        onClose={() => setIsAcceptModalOpen(false)}
        routes={routes}
        userName={userName || 'admin'}
        userRole={userRole || 'admin'}
        onSuccess={onRouteAccepted}
        duplicateWarning={duplicateWarning}
      />
    </div>
  );
}
