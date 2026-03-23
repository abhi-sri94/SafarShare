const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./src/models/User');

const approveDriver = async (email) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email });
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    user.isDriverApproved = true;
    user.role = (user.role === 'passenger') ? 'both' : user.role;
    await user.save();

    console.log(`Driver ${email} approved successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

const email = process.argv[2];
if (!email) {
  console.log('Usage: node approve_driver.js <email>');
  process.exit(1);
}

approveDriver(email);
