'use client';

import type { Route } from '@/types';
import { formatDuration, formatDistance } from '@/lib/osrm';

interface Props {
  routes: Route[];
}

export default function ReportButton({ routes }: Props) {
  if (routes.length === 0) return null;

  const handleGeneratePDF = async () => {
    // Dynamic import to avoid SSR issues
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-MX', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    // ── Encabezado ──────────────────────────────────────────
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageW, 28, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text('Shuma Rutas', 14, 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Sistema de optimización de rutas de entrega', 14, 19);
    doc.text(`Generado: ${dateStr}, ${timeStr}`, 14, 24);

    // Resumen en el encabezado
    const totalStops = routes.reduce((a, r) => a + r.stops.length, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(96, 165, 250); // blue-400
    const summaryX = pageW - 14;
    doc.text(`${routes.length} rutas · ${totalStops} paradas`, summaryX, 13, { align: 'right' });

    let cursorY = 36;

    // ── Por cada chofer ──────────────────────────────────────
    routes.forEach((route, routeIdx) => {
      // Verificar espacio en página
      if (cursorY > 240) {
        doc.addPage();
        cursorY = 16;
      }

      // Color del chofer como acento
      const hex = route.color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      // Barra de color lateral
      doc.setFillColor(r, g, b);
      doc.rect(10, cursorY, 2, 26, 'F');

      // Header del chofer
      doc.setFillColor(30, 41, 59); // slate-800
      doc.rect(13, cursorY, pageW - 23, 26, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(r, g, b);
      doc.text(`${routeIdx + 1}. ${route.driverName}`, 17, cursorY + 7);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225); // slate-300

      const vehicleData = `Mat. ${route.matricula ?? '—'}`;
      doc.text(vehicleData, 17, cursorY + 13);
      doc.text(`Bodega: ${route.depot.name}`, 17, cursorY + 18);

      if (route.totalDuration || route.totalDistance) {
        const stats = [
          route.totalDistance ? formatDistance(route.totalDistance) : null,
          route.totalDuration ? formatDuration(route.totalDuration) : null,
        ].filter(Boolean).join(' · ');
        doc.text(stats, 17, cursorY + 23);
      }

      // Facturas
      const vehicleInvoices = route.invoices;
      if (vehicleInvoices) {
        doc.setTextColor(251, 191, 36); // amber-400
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(`Facturas: ${vehicleInvoices}`, pageW - 14, cursorY + 13, { align: 'right' });
        doc.setFont('helvetica', 'normal');
      }

      cursorY += 30;

      // Tabla de paradas con distancia acumulada real
      let accumulated = 0;
      const tableRows = route.stops.map((stop) => {
        // stop.distance viene de Vroom = distancia recorrida hasta esa parada desde el inicio
        // Si tiene valor, úsarlo directamente (ya es acumulado desde Vroom)
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
        startY: cursorY,
        head: [['#', 'Destinatario', 'Dirección', 'Dist. acum.', 'ETA']],
        body: tableRows,
        margin: { left: 13, right: 10 },
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [r, g, b],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        alternateRowStyles: {
          fillColor: [241, 245, 249], // slate-100
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { cellWidth: 40 },
          2: { cellWidth: 80 },
          3: { halign: 'right', cellWidth: 22 },
          4: { halign: 'right', cellWidth: 20 },
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cursorY = (doc as any).lastAutoTable.finalY + 10;
    });

    // ── Pie de página ─────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFillColor(15, 23, 42);
      doc.rect(0, pageH - 10, pageW, 10, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text('Generado por Shuma Rutas — Confidencial', 14, pageH - 4);
      doc.text(`Pág. ${i} / ${totalPages}`, pageW - 14, pageH - 4, { align: 'right' });
    }

    doc.save(`shuma-rutas-${now.toISOString().slice(0, 10)}.pdf`);
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
