import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { ALLOWED_MIME, ATTACHMENTS_BUCKET, safeSegment } from '@/lib/attachments';

/**
 * POST /api/driver/copy-photo  body: { sourceAttachmentIds: string[], deliveryId }
 *
 * "Entregar todas": el chofer toma las fotos una vez (ligadas a la primera factura de la parada)
 * y aquí se COPIAN a otra factura de la misma parada. La copia ocurre dentro de Supabase
 * (el celular no vuelve a subir nada) y cada factura queda con su propia evidencia en el Expediente.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: session.status });

    const { sourceAttachmentIds, deliveryId } = await req.json();
    const ids: string[] = Array.isArray(sourceAttachmentIds) ? sourceAttachmentIds.filter((x: unknown) => typeof x === 'string').slice(0, 4) : [];
    if (!deliveryId || ids.length === 0) return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });

    // Factura destino: debe ser del chofer en sesión
    const { data: target } = await supabaseAdmin
      .from('deliveries').select('id, route_id, route_driver_id, invoice').eq('id', deliveryId).single();
    if (!target) return NextResponse.json({ ok: false, error: 'Entrega no encontrada' }, { status: 404 });
    const { data: rd } = await supabaseAdmin.from('route_drivers').select('driver_id').eq('id', target.route_driver_id).single();
    if (!rd || rd.driver_id !== session.user.driverId) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso sobre esta entrega' }, { status: 403 });
    }

    // Fotos de origen: evidencia de entregas de la MISMA asignación (misma ruta y chofer)
    const { data: sources, error: sErr } = await supabaseAdmin
      .from('attachments')
      .select('id, storage_path, mime_type, size_bytes, file_name, category, delivery_id')
      .in('id', ids);
    if (sErr) throw new Error('Error leyendo las fotos: ' + sErr.message);
    const srcDeliveryIds = Array.from(new Set((sources || []).map(s => s.delivery_id).filter(Boolean))) as string[];
    const { data: srcDeliveries } = await supabaseAdmin.from('deliveries').select('id, route_driver_id').in('id', srcDeliveryIds);
    const sameAssignment = (srcDeliveries || []).every(d => d.route_driver_id === target.route_driver_id);
    if (!sources || sources.length !== ids.length || !sameAssignment || sources.some(s => s.category !== 'evidencia_entrega')) {
      return NextResponse.json({ ok: false, error: 'Las fotos no corresponden a esta parada' }, { status: 403 });
    }

    const urls: string[] = [];
    for (const src of sources) {
      const ext = ALLOWED_MIME[src.mime_type] || 'jpg';
      const newPath = 'entregas/' + safeSegment(target.invoice || deliveryId) + '/' +
        Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      const { error: cpErr } = await supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).copy(src.storage_path, newPath);
      if (cpErr) throw new Error('No se pudo copiar la foto: ' + cpErr.message);

      const { data: att, error: attErr } = await supabaseAdmin
        .from('attachments')
        .insert({
          route_id: target.route_id,
          delivery_id: deliveryId,
          invoice: target.invoice,
          storage_path: newPath,
          file_name: src.file_name,
          mime_type: src.mime_type,
          size_bytes: src.size_bytes,
          category: 'evidencia_entrega',
          description: 'Evidencia compartida de la parada (entrega de varias facturas)',
          uploaded_by: session.user.sub,
          uploaded_by_name: session.user.fullName || session.user.username,
          uploaded_by_role: session.user.role,
        })
        .select('id')
        .single();
      if (attErr || !att) {
        console.error('[copy-photo] Foto copiada pero sin registro en el Expediente:', newPath, attErr);
        throw new Error('No se pudo registrar la foto copiada');
      }
      urls.push('attachment:' + att.id);
    }

    return NextResponse.json({ ok: true, urls });
  } catch (err) {
    console.error('[copy-photo]', err);
    return NextResponse.json({ ok: false, error: 'No se pudieron copiar las fotos' }, { status: 500 });
  }
}
