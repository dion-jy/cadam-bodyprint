import { createClient } from '@supabase/supabase-js';
import { Database } from '@shared/database';

const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isBrowser = typeof window !== 'undefined';
const isLocalHost =
  isBrowser &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const supabaseUrl =
  isBrowser && !isLocalHost
    ? `${window.location.origin}/supabase`
    : configuredSupabaseUrl;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export function getSupabaseFunctionUrl(functionName: string) {
  return `${supabaseUrl}/functions/v1/${functionName}`;
}
