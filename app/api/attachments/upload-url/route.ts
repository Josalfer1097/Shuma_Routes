import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import {
  ALLOWED_MIME, ATTACHMENTS_BUCKET, safeSegment, signUploadIntent, validateDeclared,
  type AttachmentCategory,
} from '@/lib/attachments';

/**
 * POST /api/attachments/upload-url
 * body: { routeId?, deliveryId?, fileName, mimeType, size, category, description? }
 * Devuelve una liga firmada para subir directo a Supabase y un permiso de registro.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: session.status });

    const body = await req.json();
    const routeId: string | null = typeof body?.routeId === 'string' && body.routeId ? body.routeId : null;
    const deliveryId: string | null = typeof body?.deliveryId === 'string' && body.deliveryId ? body.deliveryId : null;
    const fileName = String(body?.fileName || '').slice(0, 200) || 'archivo';
    const mimeType = String(body?.mimeType || '');
    const size = Number(body?.size);
    const category: AttachmentCategory = body?.category === 'foto' ? 'foto' : 'documento';
    const description = typeof body?.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 300) : null;

    if (!routeId && !deliveryId) return NextResponse.json({ ok: false, error: 'Indica la ruta o la entrega' }, { status: 400 });
    const invalid = validateDeclared(mimeType, size);
    if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });

    // El destino se valida contra la base: no se confía en lo que manda el navegador
    let resolvedRouteId = routeId;
    let invoice: string | null = null;
    let folder = '';
    if (deliveryId) {
      const { data: d } = await supabaseAdmin.from('deliveries').select('id, route_id, invoice').eq('id', deliveryId).single();
      if (!d) return NextResponse.json({ ok: false, error: 'Entrega no encontrada' }, { status: 404 });
      resolvedRouteId = d.route_id;
      invoice = d.invoice;
      folder = safeSegment(d.invoice || deliveryId);
    } else {
      const { data: r } = await supabaseAdmin.from('routes').select('id, route_code').eq('id', routeId as string).single();
      if (!r) return NextResponse.json({ ok: false, error: 'Ruta no encontrada' }, { status: 404 });
      folder = safeSegment(r.route_code || r.id);
    }

    const path = 'documentos/' + folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ALLOWED_MIME[mimeType];
    const { data: signed, error } = await supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw new Error('No se pudo preparar la subida: ' + (error?.message || 'sin respuesta'));

    const intent = await signUploadIntent({
      path, routeId: resolvedRouteId, deliveryId, invoice, fileName, mimeType, size, category, description, uid: session.user.sub,
    });

    return NextResponse.json({ ok: true, signedUrl: signed.signedUrl, intent });
  } catch (err) {
    console.error('[attachments upload-url]', err);
    return NextResponse.json({ ok: false, error: 'No se pudo preparar la subida' }, { status: 500 });
  }
}
