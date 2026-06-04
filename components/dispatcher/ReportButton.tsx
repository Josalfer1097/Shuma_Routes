'use client';

import type { Route } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';
import type { WeatherData } from '@/lib/weather';

interface Props {
  routes: Route[];
  weather?: WeatherData | null;
}

export default function ReportButton({ routes, weather }: Props) {
  if (routes.length === 0) return null;

  const handleGeneratePDF = async () => {
    // Dynamic import to avoid SSR issues
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const now = new Date();
    const currentYear = now.getFullYear();

    const dateStr = now.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const dateStrFormatted = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    const generationDateTime = `${dateStrFormatted}, ${timeStr}`;

    // ─── PÁGINA 1: PORTADA EJECUTIVA ───

    // Header Logo "SHUMA RUTAS"
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138); // navy #1E3A8A
    doc.text('SHUMA RUTAS', 20, 30);

    // Línea divisoria del Header
    doc.setDrawColor(30, 58, 138); // navy #1E3A8A
    doc.setLineWidth(0.8);
    doc.line(20, 34, 190, 34);

    // Título del reporte
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('Reporte de Rutas de Entrega', 20, 48);

    // Fecha y hora de generación
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`Generado: ${generationDateTime}`, 20, 55);

    // Totales para el Resumen General
    const totalDrivers = routes.length;
    const totalStops = routes.reduce((acc, r) => acc + r.stops.length, 0);
    const totalDistanceMeters = routes.reduce((acc, r) => acc + (r.totalDistance || 0), 0);
    const totalDistanceKm = (totalDistanceMeters / 1000).toFixed(1);
    const totalDurationSeconds = routes.reduce((acc, r) => acc + (r.totalDuration || 0), 0);
    const totalDurationStr = formatDuration(totalDurationSeconds);

    // RESUMEN GENERAL en tabla
    autoTable(doc, {
      startY: 64,
      head: [['Total de Choferes', 'Total de Paradas', 'Distancia Combinada', 'Tiempo Estimado Total']],
      body: [[totalDrivers.toString(), totalStops.toString(), `${totalDistanceKm} km`, totalDurationStr]],
      margin: { left: 20, right: 20 },
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138], // navy #1E3A8A
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 9,
      },
      bodyStyles: {
        halign: 'center',
        fontSize: 11,
        fontStyle: 'bold',
        textColor: [30, 41, 59], // slate-800
        cellPadding: 4,
      },
      styles: {
        font: 'helvetica',
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.1,
      },
    });

    let currentY = (doc as any).lastAutoTable.finalY;

    // Sección: Resumen por Chofer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text('Resumen de Rutas por Chofer', 20, currentY + 12);

    // TABLA RESUMEN POR CHOFER
    const driverRows = routes.map((route) => [
      route.driverName,
      route.matricula || '—',
      route.depot.name,
      route.endDepot?.name || route.depot.name,
      route.stops.length.toString(),
      route.totalDistance ? formatDistance(route.totalDistance) : '—',
      route.totalDuration ? formatDuration(route.totalDuration) : '—',
    ]);

    autoTable(doc, {
      startY: currentY + 16,
      head: [['Chofer', 'Matrícula', 'Bodega Salida', 'Bodega Regreso', 'Paradas', 'Distancia', 'Tiempo Estimado']],
      body: driverRows,
      margin: { left: 20, right: 20 },
      theme: 'striped',
      headStyles: {
        fillColor: [30, 58, 138], // navy #1E3A8A
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50 #F8FAFC
      },
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 2.5,
        lineColor: [226, 232, 240], // slate-200
        lineWidth: 0.1,
        textColor: [51, 65, 85], // slate-700
      },
      columnStyles: {
        4: { halign: 'center' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });

    // ─── PÁGINAS SIGUIENTES: UNA POR CHOFER ───
    routes.forEach((route) => {
      doc.addPage();

      // Header: Nombre de chofer y matrícula
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 58, 138); // navy #1E3A8A
      doc.text('SHUMA RUTAS', 20, 25);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text(`${route.driverName}  ·  Matrícula: ${route.matricula || '—'}`, 190, 25, { align: 'right' });

      // Línea divisoria
      doc.setDrawColor(30, 58, 138); // navy #1E3A8A
      doc.setLineWidth(0.5);
      doc.line(20, 28, 190, 28);

      // Calcular hora estimada de regreso
      let etaReturn = '—';
      if (route.totalDuration) {
        const returnDate = new Date(now.getTime() + route.totalDuration * 1000);
        etaReturn = returnDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      }

      // Datos del viaje: caja slate-50
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.rect(20, 34, 170, 24, 'FD');

      // Etiquetas
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 58, 138); // navy #1E3A8A
      doc.text('Bodega Salida:', 24, 40);
      doc.text('Bodega Regreso:', 24, 45);
      doc.text('Distancia Total:', 24, 50);

      doc.text('Tiempo Estimado:', 110, 40);
      doc.text('Hora Est. Regreso:', 110, 45);

      // Valores
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(route.depot.name, 49, 40);
      doc.text(route.endDepot?.name || route.depot.name, 51, 45);
      doc.text(route.totalDistance ? formatDistance(route.totalDistance) : '—', 49, 50);

      doc.text(route.totalDuration ? formatDuration(route.totalDuration) : '—', 138, 40);
      doc.text(etaReturn, 139, 45);

      // TABLA DE PARADAS
      let accumulated = 0;
      const stopRows = route.stops.map((stop) => {
        if (stop.distance != null) {
          accumulated = stop.distance;
        }
        return [
          stop.sequence.toString(),
          stop.address.name,
          stop.address.raw,
          accumulated > 0 ? formatDistance(accumulated) : '—',
          stop.eta != null ? formatDuration(stop.eta) : '—',
        ];
      });

      autoTable(doc, {
        startY: 64,
        head: [['#', 'Cliente', 'Dirección completa', 'Dist. acum. (km)', 'ETA estimada']],
        body: stopRows,
        margin: { left: 20, right: 20 },
        theme: 'striped',
        headStyles: {
          fillColor: [30, 58, 138], // navy #1E3A8A
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252], // slate-50
        },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 3,
          lineColor: [226, 232, 240], // slate-200
          lineWidth: 0.1,
          textColor: [51, 65, 85], // slate-700
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { cellWidth: 35 },
          2: { cellWidth: 75 },
          3: { halign: 'right', cellWidth: 25 },
          4: { halign: 'right', cellWidth: 25 },
        },
      });

      let finalY = (doc as any).lastAutoTable.finalY || 64;

      // Sección "Consideraciones"
      // Verificar si cabe en la página actual o agregamos página (necesitamos ~35mm de margen)
      if (finalY + 35 > pageH - 20) {
        doc.addPage();
        finalY = 25; // Resetear Y para consideraciones en nueva página
      }

      const boxY = finalY + 8;

      // Clima CDMX text
      let weatherText = 'Clima CDMX actual: No disponible';
      if (weather) {
        const desc = weather.description.charAt(0).toUpperCase() + weather.description.slice(1);
        weatherText = `Clima CDMX actual: ${weather.temp}°C - ${desc}`;
      }

      // Preparar facturas text y envoltura
      const invoicesText = route.invoices ? route.invoices : 'Ninguna';
      const fullInvoicesText = `• Llevar documentación de facturas: ${invoicesText}`;
      const wrappedInvoices = doc.splitTextToSize(fullInvoicesText, 160);
      const invoicesLinesCount = wrappedInvoices.length;

      // Calcular altura del recuadro
      const boxHeight = 16 + (invoicesLinesCount * 4);

      // Dibujar caja
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.rect(20, boxY, 170, boxHeight, 'FD');

      // Título Sección
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(30, 58, 138); // navy #1E3A8A
      doc.text('Consideraciones de la Ruta', 24, boxY + 6);

      // Contenido
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85); // slate-700
      doc.text(`• ${weatherText}`, 24, boxY + 11);
      doc.text('• Verificar condiciones de tráfico antes de salir.', 24, boxY + 16);

      // Imprimir facturas envueltas
      wrappedInvoices.forEach((line: string, idx: number) => {
        doc.text(line, 24, boxY + 21 + (idx * 4));
      });
    });

    // ─── POST-PROCESAMIENTO: FOOTERS EN TODAS LAS PÁGINAS ───
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // Línea sutil de pie de página
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.2);
      doc.line(20, pageH - 20, pageW - 20, pageH - 20);

      // Contenido
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139); // slate-500

      if (i === 1) {
        // Portada
        const footerText = `Grupo Shuma © ${currentYear} — Documento confidencial`;
        doc.text(footerText, pageW / 2, pageH - 14, { align: 'center' });
      } else {
        // Páginas siguientes
        doc.text(`Grupo Shuma © ${currentYear} — Documento confidencial`, 20, pageH - 14);
        doc.text(`Página ${i} de ${totalPages}`, pageW - 20, pageH - 14, { align: 'right' });
      }
    }

    doc.save(`reporte-rutas-shuma-${now.toISOString().slice(0, 10)}.pdf`);
  };

  return (
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
      Descargar reporte PDF
    </button>
  );
}
