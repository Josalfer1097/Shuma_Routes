export async function logAction(
  action: string,
  entity: string,
  entityId: string | null,
  userName: string,
  userRole: string,
  module: string,
  metadata?: Record<string, unknown>
) {
  try {
    // Detectar si estamos en server-side (Next.js API route) o client-side
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
        module: module || 'general',
        metadata,
        // La IP se registra en el API route de auth, no aquí
        ip_address: 'server',
        user_agent: 'server',
        created_at: new Date().toISOString(),
      });
    } else {
      // Client-side: usar fetch al API route
      await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, entity, entity_id: entityId,
          user_name: userName, user_role: userRole,
          module, metadata,
        }),
      });
    }
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
