import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const cookieHeader = req.headers.get('cookie') || '';
  const cookieFromApi = req.cookies.get('shuma_session')?.value;

  // Extraer manualmente del header, por si req.cookies falla
  const manualMatch = cookieHeader.match(/shuma_session=([^;]+)/);
  const cookieManual = manualMatch ? manualMatch[1] : null;

  const secretRaw = process.env.SESSION_JWT_SECRET || '';

  let verifyResult: any = 'no se intentó';
  const tokenToTry = cookieFromApi || cookieManual;
  if (tokenToTry) {
    try {
      const payload = await verifySession(tokenToTry);
      verifyResult = payload ? { ok: true, payload } : { ok: false, motivo: 'verifySession devolvió null' };
    } catch (err: any) {
      verifyResult = { ok: false, error: err?.message || String(err) };
    }
  }

  return NextResponse.json({
    diagnostico: {
      // ¿Llega el header de cookies?
      hayHeaderCookie: cookieHeader.length > 0,
      nombresDeCookiesRecibidas: cookieHeader.split(';').map(c => c.trim().split('=')[0]).filter(Boolean),

      // ¿req.cookies la encuentra?
      reqCookiesLaEncuentra: !!cookieFromApi,
      longitudTokenViaApi: cookieFromApi?.length || 0,

      // ¿Se encuentra manualmente en el header?
      seEncuentraManualmente: !!cookieManual,
      longitudTokenManual: cookieManual?.length || 0,

      // ¿Coinciden ambos métodos?
      ambosMetodosCoinciden: cookieFromApi === cookieManual,

      // Estado del secreto (nunca imprime el valor)
      secretoPresente: !!secretRaw,
      secretoLongitud: secretRaw.length,
      secretoPrimeros4: secretRaw.substring(0, 4),
      secretoUltimos4: secretRaw.substring(secretRaw.length - 4),

      // Resultado de la verificación
      verificacion: verifyResult,

      host: req.headers.get('host'),
    },
  });
}
