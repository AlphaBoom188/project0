require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// This backend is a trusted server, not a client the end user controls directly,
// so it uses the service role key to bypass RLS and perform CRUD on behalf of
// authenticated LINE users. All access control happens in the controllers
// (every query is scoped by line_user_id), not at the database layer.
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabase;
