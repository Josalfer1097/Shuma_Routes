export async function logAction(
  action: string,
  entity: string,
  entityId: string | null,
  userName: string,
  userRole: string,
  module: string,
  metadata?: Record<string, any>
) {
  try {
    const ipAddress = await fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => d.ip)
      .catch(() => 'unknown');

    const { supabase } = await import('./supabase');
    
    await supabase.from('audit_log').insert({
      action,
      entity,
      entity_id: entityId,
      user_name: userName,
      user_role: userRole,
      ip_address: ipAddress,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      module,
      metadata,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
