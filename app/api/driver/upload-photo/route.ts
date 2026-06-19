import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const formData   = await req.formData();
    const file       = formData.get('file') as File;
    const deliveryId = formData.get('deliveryId') as string;

    if (!file || !deliveryId) {
      return NextResponse.json({ ok: false, error: 'Faltan datos' }, { status: 400 });
    }

    const bytes    = await file.arrayBuffer();
    const buffer   = Buffer.from(bytes);
    const ext      = file.name.split('.').pop() || 'jpg';
    const fileName = `deliveries/${deliveryId}/${Date.now()}.${ext}`;

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
