import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .select('invoice, status, stop_order, route_id')
      .in('status', ['completed', 'delivered', 'partial', 'failed'])
      .order('id', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convert to dictionary: invoice -> status
    const statuses: Record<string, string> = {};
    if (data) {
      data.forEach(d => {
        if (d.invoice && !statuses[d.invoice]) {
          statuses[d.invoice] = d.status;
        }
      });
    }

    return NextResponse.json({ ok: true, statuses });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
