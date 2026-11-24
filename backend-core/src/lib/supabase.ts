import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('PERINGATAN: SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY kosong di .env!');
}

export const supabase = createClient(supabaseUrl, supabaseKey);