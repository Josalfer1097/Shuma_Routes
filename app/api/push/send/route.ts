import { NextRequest, NextResponse } from 'next/server';
import { requireAuthOrInternal } from '@/lib/auth';
import { sendPush } from '@/lib/push';

export async function POST(req: NextRequest) {
  try {
    // Acepta sesión de usuario O llamada interna del servidor (x-internal-secret)
    const auth = await requireAuthOrInternal(req, ['admin', 'logistics']);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { targetRole, targetUserIds, title, body, url, tag } = await req.json();

    if (!title || !body || (!targetRole && !(Array.isArray(targetUserIds) && targetUserIds.length > 0))) {
      return NextResponse.json({ ok: false, error: 'Faltan datos del envío' }, { status: 400 });
    }

    const result = await sendPush(
      { userIds: Array.isArray(targetUserIds) ? targetUserIds : undefined, role: targetRole },
      { title, body, url, tag }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('Push send error:', err);
    return NextResponse.json({ ok: false, error: 'Error enviando notificación' }, { status: 500 });
  }
}
