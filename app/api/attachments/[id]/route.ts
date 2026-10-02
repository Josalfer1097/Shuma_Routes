import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

/**
 * PATCH /api/attachments/:id  body: { reason }
 * Archiva un adjunto: deja de mostrarse, pero se conserva (es evidencia).
 * La base no permite borrar adjuntos; esto es lo único que se puede hacer.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth(req, ['admin', 'logistics']);
    if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: session.status });

    const { reason } = await req.json();
    const why = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
    if (why.length < 5) return NextResponse.json({ ok: false, error: 'Escribe el motivo (al menos 5 caracteres)' }, { status: 400 });

    const userName = session.user.fullName || session.user.username;
    const { data: updated, error } = await supabaseAdmin
      .from('attachments')
      .update({ archived_at: new Date().toISOString(), archived_by_name: userName, archive_reason: why })
      .eq('id', params.id)
      .is('archived_at', null)
      .select('id, file_name, invoice, delivery_id, route_id');
    if (error) throw new Error('No se pudo archivar: ' + error.message);
    if (!updated || updated.length === 0) return NextResponse.json({ ok: false, error: 'El archivo no existe o ya estaba archivado' }, { status: 409 });

    const a = updated[0];
    const { error: auditErr } = await supabaseAdmin.from('audit_log').insert({
      action: 'Archivo archivado',
      entity: a.delivery_id ? 'entrega' : 'ruta',
      entity_id: a.delivery_id || a.route_id,
      user_name: userName,
      user_role: session.user.role,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
      module: 'Expediente',
      metadata: { archivo: a.file_name, factura: a.invoice, motivo: why },
      created_at: new Date().toISOString(),
    });
    if (auditErr) console.error('[attachments archive] Error registrando bitácora:', auditErr);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[attachments archive]', err);
    return NextResponse.json({ ok: false, error: 'No se pudo archivar el archivo' }, { status: 500 });
  }
}
