import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Supabase client with service role key. Use only in server-side code (API routes, server actions).
 * Bypasses RLS - never expose this to the client.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
