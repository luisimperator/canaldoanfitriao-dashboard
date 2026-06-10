import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Cliente com service role para rotas de servidor (webhooks e syncs).
// Nunca exponha SUPABASE_SERVICE_ROLE_KEY no cliente.
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
