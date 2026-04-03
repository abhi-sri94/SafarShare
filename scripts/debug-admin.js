const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkUserRole() {
  const email = 'safarshare@admin.com';
  
  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, role, active_role')
    .eq('email', email)
    .single();

  if (error) {
    console.error('❌ Error finding user:', error.message);
    return;
  }

  console.log('🔍 User details found:');
  console.log(JSON.stringify(user, null, 2));

  if (user.role !== 'admin') {
    console.log('⚠️ Role is NOT admin. Fixing it now...');
    const { error: updateError } = await supabase
      .from('users')
      .update({ role: 'admin' })
      .eq('id', user.id);
    
    if (updateError) console.error('❌ Failed to update role:', updateError.message);
    else console.log('✅ Role successfully fixed to "admin"!');
  } else {
    console.log('✅ Role is already "admin".');
  }
}

checkUserRole();
