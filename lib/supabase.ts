import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente privado — SOLO para backend/API routes (escritura completa)
// NUNCA importar este archivo desde un componente 'use client'
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Re-export del cliente público para no romper imports existentes
// que hacían `import { supabase } from '@/lib/supabase'`
export { supabase } from './supabase-client';
