import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData   = await req.formData();
    const file       = formData.get('file') as File;
    const deliveryId = formData.get('deliveryId') as string;
    const invoiceRaw = formData.get('invoice') as string | null;

    if (!file || !deliveryId) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
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
