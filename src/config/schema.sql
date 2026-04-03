-- SafarShare Supabase Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'both', 'admin');
CREATE TYPE active_role AS ENUM ('passenger', 'driver');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE ride_status AS ENUM ('scheduled', 'active', 'in_progress', 'completed', 'cancelled');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refunded');
CREATE TYPE payment_method AS ENUM ('upi', 'card', 'netbanking', 'wallet', 'cash', 'safarshare_wallet');
CREATE TYPE payment_status AS ENUM ('created', 'pending', 'captured', 'failed', 'refunded', 'partially_refunded');
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'paid', 'failed');
CREATE TYPE message_type AS ENUM ('text', 'location', 'image', 'system');
CREATE TYPE otp_purpose AS ENUM ('login', 'register', 'reset_password', 'verify_phone');

-- Tables

-- 1. Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    firebase_uid VARCHAR(128) UNIQUE,
    role user_role DEFAULT 'passenger',
    active_role active_role DEFAULT 'passenger',
    profile_photo TEXT,
    city VARCHAR(100),
    date_of_birth DATE,
    gender gender_type,
    bio TEXT,
    is_phone_verified BOOLEAN DEFAULT FALSE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    is_aadhaar_verified BOOLEAN DEFAULT FALSE,
    is_driver_approved BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    driver_info JSONB,
    passenger_rating DECIMAL(3,2) DEFAULT 5.0,
    driver_rating DECIMAL(3,2) DEFAULT 5.0,
    total_ratings INT DEFAULT 0,
    total_rides INT DEFAULT 0,
    total_earnings DECIMAL DEFAULT 0,
    total_savings DECIMAL DEFAULT 0,
    emergency_contacts JSONB DEFAULT '[]',
    saved_upi_id VARCHAR(100),
    wallet_balance DECIMAL DEFAULT 0,
    fcm_token TEXT,
    preferences JSONB DEFAULT '{"language": "hi", "notifications": true, "share_location": true}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rides
CREATE TABLE rides (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    origin JSONB NOT NULL,
    destination JSONB NOT NULL,
    stops JSONB DEFAULT '[]',
    departure_time TIMESTAMPTZ NOT NULL,
    estimated_arrival_time TIMESTAMPTZ,
    duration_minutes INT,
    distance_km DECIMAL,
    price_per_seat INT NOT NULL,
    total_seats INT NOT NULL,
    seats_booked INT DEFAULT 0,
    seats_available INT,
    vehicle_model VARCHAR(100),
    vehicle_number VARCHAR(20),
    status ride_status DEFAULT 'scheduled',
    cancelled_by VARCHAR(20),
    cancel_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    preferences JSONB,
    current_location JSONB,
    route_polyline TEXT,
    penalty_applied BOOLEAN DEFAULT FALSE,
    average_rating DECIMAL(3,2) DEFAULT 0,
    rating_count INT DEFAULT 0,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_days JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bookings
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id UUID REFERENCES rides(id) ON DELETE CASCADE NOT NULL,
    passenger_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    seats_booked INT NOT NULL,
    price_per_seat INT NOT NULL,
    subtotal INT NOT NULL,
    platform_fee INT NOT NULL,
    total_amount INT NOT NULL,
    driver_payout INT NOT NULL,
    status booking_status DEFAULT 'pending',
    pickup_point JSONB,
    drop_point JSONB,
    cancelled_by VARCHAR(20),
    cancel_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    refund_amount INT DEFAULT 0,
    refund_status VARCHAR(20) DEFAULT 'none',
    passenger_rated_driver BOOLEAN DEFAULT FALSE,
    driver_rated_passenger BOOLEAN DEFAULT FALSE,
    passenger_rating INT,
    driver_given_rating INT,
    passenger_review TEXT,
    driver_review TEXT,
    rated_at TIMESTAMPTZ,
    panic_triggered BOOLEAN DEFAULT FALSE,
    panic_at TIMESTAMPTZ,
    panic_location JSONB,
    panic_resolved_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    boarding_code VARCHAR(20),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    type message_type DEFAULT 'text',
    text TEXT,
    location JSONB,
    image_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Payments
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE NOT NULL,
    payer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES users(id),
    amount INT NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature TEXT,
    payment_method payment_method,
    status payment_status DEFAULT 'created',
    payout_status payout_status DEFAULT 'pending',
    payout_id VARCHAR(100),
    payout_at TIMESTAMPTZ,
    refund_id VARCHAR(100),
    refund_amount INT DEFAULT 0,
    refund_reason TEXT,
    refunded_at TIMESTAMPTZ,
    receipt_number VARCHAR(50) UNIQUE,
    gateway_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. OTPs
CREATE TABLE otps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    otp VARCHAR(10) NOT NULL,
    purpose otp_purpose NOT NULL,
    attempts INT DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_rides_driver ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_bookings_ride ON bookings(ride_id);
CREATE INDEX idx_bookings_passenger ON bookings(passenger_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_messages_booking ON messages(booking_id);

-- Automatic Updated At Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_rides_updated_at BEFORE UPDATE ON rides FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_otps_updated_at BEFORE UPDATE ON otps FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
