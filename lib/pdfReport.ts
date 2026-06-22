import type { Route, GlobalConfig } from '@/types';
import type { WeatherData } from '@/lib/weather';

export async function generatePDFReport(
  routes: any[], 
  globalConfig?: GlobalConfig | null, 
  weather?: WeatherData | null,
  fileNamePrefix: string = 'reporte-rutas-shuma'
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const now    = new Date();
  const year   = now.getFullYear();

  const NAVY   = [30, 58, 138]  as [number,number,number];
  const SLATE8 = [30, 41, 59]   as [number,number,number];
  const SLATE6 = [71, 85, 105]  as [number,number,number];
  const SLATE5 = [100,116,139]  as [number,number,number];
  const SLATE2 = [226,232,240]  as [number,number,number];
  const SLATE0 = [248,250,252]  as [number,number,number];
  const GREEN  = [16, 185, 129] as [number,number,number];
  const AMBER  = [217,119,6]    as [number,number,number];
  const RED    = [220,38,38]    as [number,number,number];
  const WHITE  = [255,255,255]  as [number,number,number];
  const GOLD   = [180,135,40]   as [number,number,number];

  const LUNCH_MINS = 60;

  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Mexico_City'
  });
  const dateFormatted   = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const timeStr         = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Mexico_City' });
  const generationStamp = `${dateFormatted}, ${timeStr} hrs`;

  const fmtMins = (mins: number) => {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
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

  const routeMetrics = routes.map(route => {
    const stops = route.stops || route.deliveries || [];
    const depStr   = route.departureTime || route.departure_time || globalConfig?.departureTime || '08:00';
    const [rH, rM] = depStr.split(':').map(Number);
    const depMins  = (rH || 0) * 60 + (rM || 0);

    const unloadPerStop = getUnloadMins(route.vehicleType || route.vehicle_type);
    const transitMins   = Math.round((route.totalDuration || route.total_minutes * 60 || 0) / 60);
    const unloadMins    = stops.length * unloadPerStop;
    const totalMins     = transitMins + unloadMins + LUNCH_MINS;
    const returnMins    = depMins + totalMins;

    const retH    = Math.floor(returnMins / 60) % 24;
    const retM    = returnMins % 60;
    const etaRet  = `${retH.toString().padStart(2,'0')}:${Math.round(retM).toString().padStart(2,'0')}`;

    const status  = returnMins > deadlineMins ? 'FUERA'
                  : returnMins > deadlineMins - 30 ? 'RIESGO'
                  : 'OK';

    const totalValor = stops.reduce((acc: number, s: any) => acc + ((s.address as any).merchandiseValue || 0), 0);

    return {
      route, stops, depStr, depMins,
      transitMins, unloadMins, totalMins, returnMins,
      etaRet, status, totalValor,
      unloadPerStop,
    };
  });

  const totalStops    = routeMetrics.reduce((a, r) => a + r.stops.length, 0);
  const totalDistM    = routes.reduce((a, r) => a + (r.totalDistance || r.total_km * 1000 || 0), 0);
  const totalTransit  = routeMetrics.reduce((a, m) => a + m.transitMins, 0);
  const totalUnload   = routeMetrics.reduce((a, m) => a + m.unloadMins, 0);
  const totalLunch    = routes.length * LUNCH_MINS;
  const grandTotal    = totalTransit + totalUnload + totalLunch;

  // ════════════════════════════════════════════════════════════════
  // PÁGINA 1 — PORTADA EJECUTIVA
  // ════════════════════════════════════════════════════════════════
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 42, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...WHITE);
  doc.text('SHUMA RUTAS', 20, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(147, 197, 253);
  doc.text('Sistema de Optimización de Entregas · Grupo Shuma', 20, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text('REPORTE DE RUTAS DE ENTREGA', 20, 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(147, 197, 253);
  doc.text(`Generado: ${generationStamp}`, pageW - 20, 35, { align: 'right' });

  const kpiY  = 52;
  const kpiW  = 40;
  const kpiGap = 4.5;
  const cards = [
    { label: 'CHOFERES',     value: routes.length.toString(),     color: NAVY },
    { label: 'ENTREGAS',     value: totalStops.toString(),         color: GREEN },
    { label: 'DISTANCIA',    value: fmtKm(totalDistM),             color: [124,58,237] as [number,number,number] },
    { label: 'TIEMPO TOTAL', value: fmtMins(grandTotal),           color: AMBER },
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

  const breakY = kpiY + 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE8);
  doc.text('Desglose de Tiempo Total de la Flota', 20, breakY);

  autoTable(doc, {
    startY: breakY + 4,
    head: [['Concepto', 'Tiempo', '% del Total']],
    body: [
      ['🚗 Tránsito en ruta (conducción)', fmtMins(totalTransit), `${Math.round(totalTransit/Math.max(1,grandTotal)*100)}%`],
      ['📦 Tiempo de descarga en paradas', fmtMins(totalUnload),  `${Math.round(totalUnload/Math.max(1,grandTotal)*100)}%`],
      ['🍽️ Hora de comida (todos los choferes)', fmtMins(totalLunch), `${Math.round(totalLunch/Math.max(1,grandTotal)*100)}%`],
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
        data.cell.styles.fillColor = [219, 234, 254];
        data.cell.styles.textColor = NAVY;
      }
    },
  });

  const summaryY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE8);
  doc.text('Resumen de Rutas por Chofer', 20, summaryY);

  const summaryRows = routeMetrics.map(m => {
    const statusIcon = m.status === 'OK' ? '✓ En tiempo' : m.status === 'RIESGO' ? '⚠ Riesgo' : '✗ Excede límite';
    const valorStr = m.totalValor > 0 ? `$${m.totalValor.toLocaleString('es-MX')}` : '—';
    return [
      m.route.driverName || m.route.driver_name || 'Sin nombre',
      m.route.matricula || '—',
      m.stops.length.toString(),
      fmtKm(m.route.totalDistance || m.route.total_km * 1000 || 0),
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
      weather ? `• Clima CDMX: ${weather.temp}°C — ${weather.description} · Humedad: ${weather.humidity}% · Viento: ${weather.windSpeed} km/h` : '• Clima CDMX: No disponible',
    ];
    considerations.forEach((line, i) => doc.text(line, 24, noteY + 13 + i * 4));
  }

  // ════════════════════════════════════════════════════════════════
  // PÁGINAS SIGUIENTES — UNA POR CHOFER
  // ════════════════════════════════════════════════════════════════
  routeMetrics.forEach(({ route, stops, depStr, transitMins, unloadMins, etaRet, status, totalValor, unloadPerStop }) => {
    doc.addPage();
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(route.driverName || route.driver_name || 'Sin nombre', 20, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(147, 197, 253);
    doc.text(`${route.vehicleType || route.vehicle_type || 'Vehículo'}  ·  Matrícula: ${route.matricula || '—'}`, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(`Salida: ${depStr}`, pageW - 20, 13, { align: 'right' });
    doc.setTextColor(147, 197, 253);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Regreso est.: ${etaRet}`, pageW - 20, 20, { align: 'right' });

    const cY = 34;
    const cW = 40; const cG = 4.5;
    const chCards = [
      { label: 'ENTREGAS',      value: stops.length.toString(),         color: GREEN },
      { label: 'DISTANCIA',     value: fmtKm(route.totalDistance || route.total_km * 1000 || 0), color: [124,58,237] as [number,number,number] },
      { label: 'TRÁNSITO',      value: fmtMins(transitMins),                   color: NAVY },
      { label: 'TOTAL + PAUSA', value: fmtMins(transitMins + unloadMins + LUNCH_MINS), color: AMBER },
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
      route.depot?.name || 'San Pablo',
      route.endDepot?.name || route.depot?.name || 'San Pablo',
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

    const tableY = infoY + 36;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...SLATE8);
    doc.text('Detalle de Paradas', 20, tableY);

    let accumulated = 0;
    const stopRows = stops.map((stop: any, idx: number) => {
      if (stop.distance != null) accumulated = stop.distance;
      const valor = (stop.address as any).merchandiseValue;
      const valorStr = valor && valor > 0 ? `$${Number(valor).toLocaleString('es-MX')}` : '—';
      const etaMin = stop.eta != null ? Math.round(stop.eta / 60) : null;
      const etaStr = etaMin != null ? fmtMins(etaMin) : '—';
      const invStr = stop.address.invoice || '—';
      const clientStr = stop.address.clientName || stop.address.name || '—';
      return [
        (stop.sequence || idx + 1).toString(),
        clientStr,
        invStr,
        stop.address.raw || stop.address.label || '—',
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

      const invoices = route.invoices || stops.map((s: any) => s.address.invoice).filter(Boolean).join(', ') || 'Ver tabla';
      const considerations2 = [
        `• Tiempo de descarga: ${unloadPerStop} min por parada · ${stops.length} paradas = ${fmtMins(stops.length * unloadPerStop)} total`,
        `• Hora de comida: ${LUNCH_MINS} min incluidos en el cálculo de regreso`,
        weather ? `• Clima: ${weather.temp}°C — ${weather.description} · ${weather.alerts?.length > 0 ? '⚠ ' + weather.alerts[0] : 'Sin alertas'}` : '',
        totalValor > 0 ? `• Valor total de mercancía en esta ruta: $${totalValor.toLocaleString('es-MX')} MXN` : '',
      ].filter(Boolean);

      considerations2.forEach((line, i) => doc.text(line, 24, consY + 13 + i * 4));
    }
  });

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
    doc.setFillColor(...NAVY);
    doc.rect(0, pageH - 5, pageW, 5, 'F');
  }

  doc.save(`${fileNamePrefix}-${now.toISOString().slice(0, 10)}.pdf`);
}
