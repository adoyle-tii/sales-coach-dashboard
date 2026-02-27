import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// auth-js 2.65+ has a bug in _getSessionFromURL where it calls .get() on a
// non-URLSearchParams value, crashing on OAuth redirects. We handle the
// OAuth callback manually in App.jsx, so we disable auto URL detection here.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;
