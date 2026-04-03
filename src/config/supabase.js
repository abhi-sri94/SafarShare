const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'your_supabase_project_url_here') {
  console.error('❌ CRITICAL: Missing or placeholder Supabase credentials in .env file.');
  console.error('👉 Please update SUPABASE_URL and SUPABASE_ANON_KEY in your .env file.');
}

// Ensure the app doesn't crash on boot even if keys are missing
// but requests will fail until keys are provided.
const supabase = (supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_project_url_here') 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

module.exports = supabase;
