import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { ATTACHMENTS_BUCKET, MAX_ATTACHMENT_BYTES, verifyUploadIntent } from '@/lib/attachments';

/**
 * POST /api/attachments/confirm  body: { intent }
 * Registra en el Expediente un archivo ya subido con la liga firmada.
 * Verifica el permiso firmado, que sea del mismo usuario y que el archivo exista.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: session.status });

    const { intent: token } = await req.json();
    const intent = typeof token === 'string' ? await verifyUploadIntent(token) : null;
    if (!intent) return NextResponse.json({ ok: false, error: 'El permiso de subida no es válido o ya caducó. Vuelve a subir el archivo.' }, { status: 400 });
    if (intent.uid !== session.user.sub) return NextResponse.json({ ok: false, error: 'El permiso de subida es de otro usuario' }, { status: 403 });

    // El archivo debe existir realmente en el almacenamiento
    const dir = intent.path.slice(0, intent.path.lastIndexOf('/'));
    const name = intent.path.slice(intent.path.lastIndexOf('/') + 1);
    const { data: listed, error: listErr } = await supabaseAdmin.storage.from(ATTACHMENTS_BUCKET).list(dir, { search: name, limit: 5 });
    if (listErr) throw new Error('No se pudo verificar el archivo: ' + listErr.message);
    const obj = (listed || []).find(o => o.name === name);
    if (!obj) return NextResponse.json({ ok: false, error: 'El archivo no llegó al almacenamiento. Intenta de nuevo.' }, { status: 400 });
    const realSize = Number((obj.metadata as { size?: number } | null)?.size) || intent.size;
    if (realSize > MAX_ATTACHMENT_BYTES) return NextResponse.json({ ok: false, error: 'El archivo pesa más de 10 MB.' }, { status: 400 });

    const userName = session.user.fullName || session.user.username;
    const { data: att, error } = await supabaseAdmin
      .from('attachments')
      .insert({
        route_id: intent.routeId,
        delivery_id: intent.deliveryId,
        invoice: intent.invoice,
        storage_path: intent.path,
        file_name: intent.fileName,
        mime_type: intent.mimeType,
        size_bytes: realSize,
        category: intent.category,
        description: intent.description,
        uploaded_by: session.user.sub,
        uploaded_by_name: userName,
        uploaded_by_role: session.user.role,
      })
      .select('id')
      .single();
    if (error || !att) {
      // storage_path es único: un segundo intento con el mismo permiso no duplica
      if (error?.code === '23505') return NextResponse.json({ ok: false, error: 'Este archivo ya estaba registrado.' }, { status: 409 });
      throw new Error('No se pudo registrar el archivo: ' + (error?.message || 'sin respuesta'));
    }

    const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
      action: 'Archivo adjuntado',
      entity: intent.deliveryId ? 'entrega' : 'ruta',
      entity_id: intent.deliveryId || intent.routeId,
      user_name: userName,
      user_role: session.user.role,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module: 'Expediente',
      metadata: { archivo: intent.fileName, factura: intent.invoice, tipo: intent.category, descripcion: intent.description },
      created_at: new Date().toISOString(),
    });
    if (auditErr) console.error('[attachments confirm] Error registrando bitácora:', auditErr);

    return NextResponse.json({ ok: true, id: att.id });
  } catch (err) {
    console.error('[attachments confirm]', err);
    return NextResponse.json({ ok: false, error: 'No se pudo registrar el archivo' }, { status: 500 });
  }
}
