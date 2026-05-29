// Supabase client singleton
// Reads configuration from environment variables.
// SUPABASE_URL – Project URL (e.g. https://xxxx.supabase.co)
// SUPABASE_SERVICE_KEY – Service role secret (server‑side privileged key)

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase configuration missing: set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;