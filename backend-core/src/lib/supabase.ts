import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

const supabaseUrl = process.env.SUPABASE_URL?.trim() ?? '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di backend-core/.env sebelum menjalankan server.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
