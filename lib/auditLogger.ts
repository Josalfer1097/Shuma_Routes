export async function logAction(
  action: string,
  entity: string,
  entityId: string | null,
  userName: string,
  userRole: string,
  module: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    const isServer = typeof window === 'undefined';

    if (isServer) {
      // Server-side: importar supabaseAdmin directamente
      const { supabaseAdmin } = await import('./supabase');
      await supabaseAdmin.from('audit_log').insert({
        action,
        entity,
        entity_id: entityId,
        user_name: userName,
        user_role: userRole,
        ip_address: ipAddress || 'unknown',
        user_agent: userAgent || 'server',
        module: module || 'general',
        metadata,
        created_at: new Date().toISOString(),
      });
    } else {
      // Client-side: usar fetch al API route
      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          entity,
          entity_id: entityId,
          user_name: userName,
          user_role: userRole,
          module,
          metadata,
        }),
      });
    }
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
