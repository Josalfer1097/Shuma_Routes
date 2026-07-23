import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req, ['driver']);
    if (!session.ok) {
      return NextResponse.json({ ok: false, error: session.error }, { status: session.status });
    }

    const formData   = await req.formData();
    const file       = formData.get('file') as File;
    const deliveryId = formData.get('deliveryId') as string;
    const invoiceRaw = formData.get('invoice') as string | null;

    if (!file || !deliveryId) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    // Verificar pertenencia de la entrega antes de aceptar la foto
    const { data: delivery } = await supabaseAdmin
      .from('deliveries')
      .select('route_driver_id')
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

    // Usar el código corto (factura) para nombrar la carpeta en vez
    // del UUID crudo — más legible al navegar el bucket manualmente.
    // Sanitizar por si la factura trae espacios/caracteres raros.
    const folderCode = (invoiceRaw || deliveryId)
      .replace(/[^a-zA-Z0-9-_]/g, '')
      .slice(0, 40) || deliveryId;

    const bytes    = await file.arrayBuffer();
    const buffer   = Buffer.from(bytes);
    const ext      = file.name.split('.').pop() || 'jpg';
    const fileName = `deliveries/${folderCode}/${Date.now()}.${ext}`;

    const { data, error } = await supabaseAdmin.storage
      .from('delivery-photos')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabaseAdmin.storage
      .from('delivery-photos')
      .getPublicUrl(fileName);

    return NextResponse.json({ ok: true, url: urlData.publicUrl });
  } catch (err) {
    console.error('[upload-photo] Error:', err);
    return NextResponse.json({ ok: false, error: 'Error al subir foto' }, { status: 500 });
  }
}
