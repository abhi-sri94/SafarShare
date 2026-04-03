const supabase = require('./src/config/supabase');
require('dotenv').config();

const approveDriver = async (email) => {
  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (fetchError || !user) {
      console.error('User not found or error fetching user:', fetchError?.message);
      process.exit(1);
    }

    const newRole = user.role === 'passenger' ? 'both' : user.role;

    const { error: updateError } = await supabase
      .from('users')
      .update({
        is_driver_approved: true,
        role: newRole
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error approving driver:', updateError.message);
      process.exit(1);
    }

    console.log(`Driver ${email} approved successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
};

const email = process.argv[2];
if (!email) {
  console.log('Usage: node approve_driver.js <email>');
  process.exit(1);
}

approveDriver(email);
