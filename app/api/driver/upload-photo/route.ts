import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { ALLOWED_MIME, ATTACHMENTS_BUCKET, safeSegment, validateAttachment } from '@/lib/attachments';

/**
 * Foto de evidencia del chofer al marcar una entrega.
 *
 * Antes: se guardaba en un bucket PÚBLICO (cualquiera con la liga la veía, sin sesión)
 * y no se validaba tipo ni tamaño. Ahora: bucket privado del Expediente, solo fotos
 * de hasta 10 MB, y cada foto queda registrada como adjunto de la factura.
 *
 * Responde { ok, url } por compatibilidad con la app del chofer: "url" ya no es una
 * liga pública sino una referencia interna "attachment:<id>".
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const formData   = await req.formData();
    const file       = formData.get('file');
    const deliveryId = formData.get('deliveryId');

    if (!(file instanceof File) || typeof deliveryId !== 'string' || !deliveryId) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }
    // La evidencia de entrega es solo foto (el PDF se adjunta desde el Expediente)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'La evidencia debe ser una foto.' }, { status: 400 });
    }
    const invalid = validateAttachment(file);
    if (invalid) return NextResponse.json({ ok: false, error: invalid }, { status: 400 });

    // Verificar pertenencia de la entrega antes de aceptar la foto
    const { data: delivery } = await supabaseAdmin
      .from('deliveries')
      .select('route_driver_id, route_id, invoice')
      .eq('id', deliveryId)
      .single();

    if (!delivery) {
      return NextResponse.json({ ok: false, error: 'Entrega no encontrada' }, { status: 404 });
    }

    const { data: routeDriver } = await supabaseAdmin
      .from('route_drivers')
      .select('driver_id')
      .eq('id', delivery.route_driver_id)
      .single();

    if (!routeDriver || routeDriver.driver_id !== session.user.driverId) {
      return NextResponse.json({ ok: false, error: 'No tienes permiso sobre esta entrega' }, { status: 403 });
    }

    // La factura se toma de la base, no del formulario (no se confía en el cliente)
    const storagePath = 'entregas/' + safeSegment(delivery.invoice || deliveryId) + '/' +
      Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ALLOWED_MIME[file.type];

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (upErr) throw upErr;

    const { data: att, error: attErr } = await supabaseAdmin
      .from('attachments')
      .insert({
        route_id: delivery.route_id,
        delivery_id: deliveryId,
        invoice: delivery.invoice,
        storage_path: storagePath,
        file_name: file.name || 'foto.' + ALLOWED_MIME[file.type],
        mime_type: file.type,
        size_bytes: file.size,
        category: 'evidencia_entrega',
        uploaded_by: session.user.sub,
        uploaded_by_name: session.user.fullName || session.user.username,
        uploaded_by_role: session.user.role,
      })
      .select('id')
      .single();

    if (attErr || !att) {
      // El archivo subió pero no quedó registrado: se reporta fuerte (no se borra: es evidencia)
      console.error('[upload-photo] Foto guardada pero sin registro en el Expediente:', storagePath, attErr);
      return NextResponse.json({ ok: false, error: 'La foto se subió pero no se pudo registrar. Intenta de nuevo.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: 'attachment:' + att.id, attachmentId: att.id });
  } catch (err) {
    console.error('[upload-photo] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error al subir foto' }, { status: 500 });
  }
}
