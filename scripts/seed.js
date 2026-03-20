require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Ride = require('../src/models/Ride');
const Booking = require('../src/models/Booking');
const logger = require('../src/utils/logger');

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing data
  await Promise.all([User.deleteMany(), Ride.deleteMany(), Booking.deleteMany()]);
  console.log('Cleared existing data');

  // Create admin
  const admin = await User.create({
    firstName: 'Abhishek', lastName: 'Admin',
    phone: '+919999999999', email: 'admin@safarshare.in',
    password: 'Admin@123', role: 'admin',
    city: 'Lucknow', isPhoneVerified: true, isEmailVerified: true,
  });
  console.log('Admin created:', admin.phone);

  // Create drivers
  const drivers = await User.insertMany([
    {
      firstName: 'Rohit', lastName: 'Kumar',
      phone: '+919876543210', email: 'rohit@example.com',
      password: 'Test@1234', role: 'both', activeRole: 'driver',
      city: 'Lucknow', isPhoneVerified: true, isDriverApproved: true,
      driverRating: 4.9, totalRides: 45,
      driverInfo: { vehicleModel: 'Maruti Alto K10', vehicleNumber: 'UP32AB1234', vehicleType: 'hatchback', vehicleColor: 'White', isOnline: true, currentLocation: { type: 'Point', coordinates: [80.9462, 26.8467] } },
    },
    {
      firstName: 'Sunita', lastName: 'Verma',
      phone: '+919876543211', email: 'sunita@example.com',
      password: 'Test@1234', role: 'driver', activeRole: 'driver',
      city: 'Gorakhpur', isPhoneVerified: true, isDriverApproved: true,
      driverRating: 4.7, totalRides: 32,
      driverInfo: { vehicleModel: 'Maruti Ertiga', vehicleNumber: 'UP53CD5678', vehicleType: 'mpv', vehicleColor: 'Silver', isOnline: true },
    },
    {
      firstName: 'Arjun', lastName: 'Mishra',
      phone: '+919876543212', email: 'arjun@example.com',
      password: 'Test@1234', role: 'driver',
      city: 'Varanasi', isPhoneVerified: true, isDriverApproved: true,
      driverRating: 4.8, totalRides: 28,
      driverInfo: { vehicleModel: 'Maruti Wagon R', vehicleNumber: 'UP65EF9012', vehicleType: 'hatchback', vehicleColor: 'Red' },
    },
  ]);
  console.log(`${drivers.length} drivers created`);

  // Create passengers
  const passengers = await User.insertMany([
    {
      firstName: 'Priya', lastName: 'Sharma',
      phone: '+919900112234', email: 'priya@example.com',
      password: 'Test@1234', role: 'passenger',
      city: 'Bahraich', isPhoneVerified: true,
      passengerRating: 4.3,
      emergencyContacts: [{ name: 'Mom', phone: '+919800011122', relation: 'Mother' }],
    },
    {
      firstName: 'Vikram', lastName: 'Singh',
      phone: '+919900112235', email: 'vikram@example.com',
      password: 'Test@1234', role: 'passenger',
      city: 'Kanpur', isPhoneVerified: true,
      passengerRating: 4.6,
    },
  ]);
  console.log(`${passengers.length} passengers created`);

  // Create rides
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);

  const rides = await Ride.insertMany([
    {
      driver: drivers[0]._id,
      origin: { city: 'Lucknow', address: 'Hazratganj, Lucknow', coordinates: { type: 'Point', coordinates: [80.9462, 26.8467] } },
      destination: { city: 'Kanpur', address: 'Kanpur Central, Kanpur', coordinates: { type: 'Point', coordinates: [80.3319, 26.4499] } },
      departureTime: new Date(tomorrow.setHours(8, 30)),
      estimatedArrivalTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
      durationMinutes: 120, distanceKm: 85,
      totalSeats: 3, seatsBooked: 1, seatsAvailable: 2,
      pricePerSeat: 320, status: 'scheduled',
      vehicleModel: 'Maruti Alto K10', vehicleNumber: 'UP32AB1234',
      preferences: { musicAllowed: true, luggageAllowed: true },
    },
    {
      driver: drivers[1]._id,
      origin: { city: 'Gorakhpur', address: 'Gorakhpur Railway Station', coordinates: { type: 'Point', coordinates: [83.3732, 26.7606] } },
      destination: { city: 'Lucknow', address: 'Lucknow Airport', coordinates: { type: 'Point', coordinates: [80.9462, 26.8467] } },
      departureTime: new Date(dayAfter.setHours(7, 0)),
      durationMinutes: 210, distanceKm: 273,
      totalSeats: 4, seatsBooked: 0, seatsAvailable: 4,
      pricePerSeat: 450, status: 'scheduled',
      vehicleModel: 'Maruti Ertiga', vehicleNumber: 'UP53CD5678',
      preferences: { womenOnly: false, musicAllowed: true, luggageAllowed: true },
    },
    {
      driver: drivers[2]._id,
      origin: { city: 'Varanasi', address: 'Varanasi Cantt', coordinates: { type: 'Point', coordinates: [82.9739, 25.3176] } },
      destination: { city: 'Prayagraj', address: 'Civil Lines, Prayagraj', coordinates: { type: 'Point', coordinates: [81.8463, 25.4358] } },
      departureTime: new Date(tomorrow.setHours(9, 0)),
      durationMinutes: 100, distanceKm: 120,
      totalSeats: 2, seatsBooked: 0, seatsAvailable: 2,
      pricePerSeat: 240, status: 'scheduled',
      vehicleModel: 'Maruti Wagon R', vehicleNumber: 'UP65EF9012',
    },
  ]);
  console.log(`${rides.length} rides created`);

  console.log('\n✅ Seed complete!\n');
  console.log('Test credentials:');
  console.log('  Admin:     +91 9999999999 / Admin@123');
  console.log('  Driver:    +91 9876543210 / Test@1234');
  console.log('  Passenger: +91 9900112234 / Test@1234');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
