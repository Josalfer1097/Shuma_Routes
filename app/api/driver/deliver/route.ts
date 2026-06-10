import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { driverName, stopIndex, status, notes } = await req.json();

    const { error } = await supabaseAdmin.from('audit_log').insert({
      action: status === 'completed' ? 'delivery_completed' : 'delivery_failed',
      entity: 'delivery',
      entity_id: stopIndex.toString(),
      user_name: driverName,
      user_role: 'driver',
      metadata: { notes, stopIndex }
    });

    if (error) {
      console.error('Error in driver/deliver audit log:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error in driver/deliver:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
