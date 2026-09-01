import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Browser client is used ONLY as a realtime change-signal.
 * All actual data still flows through the Next API routes (service role).
 * If these env vars are absent, the dashboard silently falls back to polling.
 */
export const supabaseBrowser: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null