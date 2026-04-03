const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function setupAdmin() {
  const email = 'safarshare@admin.com';
  const password = 'admin123';
  const firstName = 'SafarShare';
  const lastName = 'Admin';

  console.log('🚀 Setting up Admin User...');

  try {
    // 1. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2. Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      console.log('⚠️ Admin user already exists. Updating role to admin...');
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: 'admin', is_driver_approved: true })
        .eq('id', existingUser.id);
      
      if (updateError) throw updateError;
      console.log('✅ Admin role updated successfully!');
      return;
    }

    // 3. Create new admin user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: '0000000000', // Placeholder for admin
        password: hashedPassword,
        role: 'admin',
        is_driver_approved: true
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log('✅ Admin user created successfully!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);

  } catch (error) {
    console.error('❌ Error setting up admin:', error.message);
  }
}

setupAdmin();
