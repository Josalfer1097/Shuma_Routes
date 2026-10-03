import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/csp-report
 * Recibe los avisos del navegador cuando algo viola la política de seguridad de contenido
 * (en modo "solo reportar") y los deja en los logs de Vercel para revisarlos.
 * Es público a propósito: el navegador lo llama sin sesión. Solo registra; no guarda nada.
 */
export async function POST(req: NextRequest) {
  try {
    const text = (await req.text()).slice(0, 2000);
    let summary = text;
    try {
      const json = JSON.parse(text);
      const r = json['csp-report'] || json;
      summary = JSON.stringify({
        bloquearia: r['blocked-uri'] || r.blockedURL,
        directiva: r['violated-directive'] || r.effectiveDirective,
        pagina: r['document-uri'] || r.documentURL,
      });
    } catch {
      // Formato no JSON: se registra el texto recortado
    }
    console.warn('[csp-report]', summary);
  } catch (err) {
    console.error('[csp-report] Reporte ilegible:', err);
  }
  return new NextResponse(null, { status: 204 });
}
