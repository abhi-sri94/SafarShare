const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function seedRides() {
  console.log('🌱 Seeding Test Rides...');

  try {
    // 1. Create a dummy driver if not exists
    const driverEmail = 'driver@test.com';
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    let { data: driver } = await supabase.from('users').select('id').eq('email', driverEmail).maybeSingle();
    
    if (!driver) {
      const { data: newDriver, error: driverError } = await supabase.from('users').insert({
        first_name: 'Rajesh',
        last_name: 'Kumar',
        email: driverEmail,
        phone: '+919988776655',
        password: hashedPassword,
        role: 'driver',
        active_role: 'driver',
        is_phone_verified: true,
        is_driver_approved: true,
        driver_info: { vehicleModel: 'Maruti Suzuki Swift', vehicleNumber: 'UP32 AB 1234' }
      }).select().single();
      
      if (driverError) throw driverError;
      driver = newDriver;
      console.log('✅ Created test driver');
    }

    // 2. Create some rides
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const rides = [
      {
        driver_id: driver.id,
        origin: { city: 'Lucknow', address: 'Hazratganj' },
        destination: { city: 'Kanpur', address: 'Z Square Mall' },
        departure_time: tomorrow.toISOString(),
        price_per_seat: 160,
        total_seats: 4,
        seats_available: 4,
        vehicle_model: 'Swift',
        vehicle_number: 'UP32 AB 1234',
        status: 'scheduled'
      },
      {
        driver_id: driver.id,
        origin: { city: 'Lucknow', address: 'Charbagh' },
        destination: { city: 'Varanasi', address: 'Ghats' },
        departure_time: new Date(tomorrow.getTime() + 4 * 3600000).toISOString(), // 4 hours later
        price_per_seat: 450,
        total_seats: 3,
        seats_available: 3,
        vehicle_model: 'Swift',
        vehicle_number: 'UP32 AB 1234',
        status: 'scheduled'
      }
    ];

    const { error: rideError } = await supabase.from('rides').insert(rides);
    if (rideError) throw rideError;

    console.log('✅ Successfully seeded 2 test rides!');
  } catch (error) {
    console.error('❌ Error seeding rides:', error.message);
  }
}

seedRides();
