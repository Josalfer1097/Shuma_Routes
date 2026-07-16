import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('driver_locations')
      .select('driver_id, lat, lng, updated_at');

    if (error) throw error;

    const locations: Record<string, { lat: number; lng: number; updated_at: string }> = {};
    (data || []).forEach(loc => {
      if (loc.driver_id && loc.lat != null && loc.lng != null) {
        locations[loc.driver_id] = { lat: loc.lat, lng: loc.lng, updated_at: loc.updated_at };
      }
    });

    return NextResponse.json({ ok: true, locations });
  } catch (err: any) {
    console.error('[api/driver/locations] error:', err);
    return NextResponse.json({ ok: false, locations: {} }, { status: 500 });
  }
}
