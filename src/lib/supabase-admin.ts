// Server-only Supabase client with the service role key. Import it only from server code
// (server actions, route handlers); the key is not available in the browser bundle.
import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from './supabase'

if (typeof window !== 'undefined') {
  throw new Error('supabase-admin must not be imported in the browser')
}

export const supabaseAdmin = createClient(getSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing-service-role-key', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
