// Nunca llama Supabase directo — siempre usa /api/audit (server-side)
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
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
