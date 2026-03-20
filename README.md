# SafarShare Backend — Complete Setup Guide

## Stack Overview

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MongoDB (Mongoose) |
| Real-time | Socket.io |
| OTP / SMS | Twilio |
| Payments | Razorpay |
| Maps | Google Maps Platform |
| Push Notifications | Firebase Admin SDK |
| File Uploads | Cloudinary |
| Auth | JWT (access + refresh tokens) |
| Deployment | Any VPS / Railway / Render |

---

## Project Structure

```
safarshare-backend/
├── src/
│   ├── server.js              ← Entry point
│   ├── config/
│   │   └── database.js        ← MongoDB connection
│   ├── models/
│   │   ├── User.js            ← User schema (passenger + driver)
│   │   ├── Ride.js            ← Ride schema
│   │   ├── Booking.js         ← Booking schema
│   │   ├── Payment.js         ← Payment / payout schema
│   │   ├── Message.js         ← Chat message schema
│   │   └── OTP.js             ← OTP verification schema
│   ├── routes/
│   │   ├── auth.js            ← Register, login, OTP, refresh token
│   │   ├── users.js           ← Profile, documents, emergency contacts
│   │   ├── rides.js           ← Create, search, start, complete rides
│   │   ├── bookings.js        ← Book, cancel, rate, panic button
│   │   ├── payments.js        ← Razorpay verify, earnings, receipts
│   │   ├── chat.js            ← Message history, conversations
│   │   ├── tracking.js        ← Live location + ride progress
│   │   ├── notifications.js   ← FCM token, test push
│   │   └── admin.js           ← Dashboard, approve drivers, analytics
│   ├── services/
│   │   ├── twilioService.js   ← Send OTP, SMS, panic alerts
│   │   ├── razorpayService.js ← Orders, verify, refunds, payouts
│   │   ├── mapsService.js     ← Geocode, distance, polyline, autocomplete
│   │   └── firebaseService.js ← Push notifications (all templates)
│   ├── middleware/
│   │   ├── auth.js            ← JWT protect, restrictTo, requireDriverApproval
│   │   └── errorHandler.js    ← Global error handler
│   ├── socket/
│   │   └── socket.js          ← Socket.io (chat + live tracking)
│   └── utils/
│       ├── AppError.js        ← Custom error class
│       └── logger.js          ← Winston logger
└── scripts/
    └── seed.js                ← Sample data seeder
```

---

## Step 1 — Install & Configure

```bash
cd safarshare-backend
npm install

# Copy the environment file
cp .env.example .env
```

Then open `.env` and fill in each section below.

---

## Step 2 — MongoDB Setup

### Option A: Local MongoDB (Development)
```bash
# Install MongoDB on Ubuntu
sudo apt install -y mongodb
sudo systemctl start mongodb

# Your URI (already the default in .env):
MONGODB_URI=mongodb://localhost:27017/safarshare
```

### Option B: MongoDB Atlas (Recommended for Production)
1. Go to https://cloud.mongodb.com → Create free cluster
2. Click **Connect** → **Connect your application**
3. Copy the connection string:
```
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/safarshare
```

---

## Step 3 — Twilio (OTP SMS)

1. Sign up at https://console.twilio.com
2. Go to **Account Info** → copy Account SID and Auth Token
3. For India, create a **Verify Service**:
   - Twilio Console → Verify → Services → Create Service → Name: "SafarShare"
   - Copy the Service SID (starts with VA...)
4. For test phone number: Console → Phone Numbers → Get a number

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Important for India**: WhatsApp OTP is cheaper. Enable WhatsApp channel in your Verify service.

---

## Step 4 — Razorpay (Payments)

1. Sign up at https://dashboard.razorpay.com
2. Go to **Settings → API Keys** → Generate Test Key
3. Copy Key ID and Key Secret

```env
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_here
```

### Webhook Setup (for payment confirmations):
1. Dashboard → Settings → Webhooks → Add new webhook
2. URL: `https://your-domain.com/webhook/razorpay`
3. Events to enable: `payment.captured`, `payment.failed`, `refund.processed`
4. Copy the webhook secret:
```env
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

### Frontend Integration (how to open checkout):
```javascript
// After POST /api/bookings returns paymentOrder:
const options = {
  key: paymentOrder.keyId,
  amount: paymentOrder.amount,
  currency: 'INR',
  name: 'SafarShare',
  description: 'Ride Booking',
  order_id: paymentOrder.orderId,
  handler: async function(response) {
    // Call POST /api/payments/verify with response
    await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      }),
    });
  },
  prefill: { name: user.fullName, contact: user.phone, email: user.email },
  theme: { color: '#0F5C3A' },
};
const rzp = new Razorpay(options);
rzp.open();
```

---

## Step 5 — Google Maps Platform

1. Go to https://console.cloud.google.com
2. Create a new project: "SafarShare"
3. Enable these APIs:
   - **Maps JavaScript API**
   - **Geocoding API**
   - **Distance Matrix API**
   - **Directions API**
   - **Places API** (for autocomplete)
4. Go to **Credentials** → Create API Key → Restrict to your domain/IP

```env
GOOGLE_MAPS_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Cost control**: Set daily quota limits in the API console. Most requests are under $2/1000. The app has fallback coordinates for all major UP cities if the API is unavailable.

---

## Step 6 — Firebase (Push Notifications)

1. Go to https://console.firebase.google.com → Create project: "SafarShare"
2. Project Settings → Service Accounts → Generate new private key
3. Download the JSON file, then extract values:

```env
FIREBASE_PROJECT_ID=safarshare-xxxxx
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@safarshare-xxxxx.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_FULL_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

> **Frontend**: Add Firebase SDK to your app → get the user's FCM token → send it to `PATCH /api/notifications/fcm-token` after login.

---

## Step 7 — Cloudinary (Profile Photos & Documents)

1. Sign up at https://cloudinary.com/console
2. Copy your Cloud name, API Key, API Secret from the dashboard

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your_api_secret
```

---

## Step 8 — Run the Server

```bash
# Seed sample data (optional)
npm run seed

# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Server starts at: `http://localhost:5000`
Health check: `GET http://localhost:5000/health`

---

## Complete API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send OTP to phone |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login with password |
| POST | `/api/auth/login-otp` | Login with OTP |
| POST | `/api/auth/refresh-token` | Refresh JWT |
| POST | `/api/auth/forgot-password` | Send reset OTP |
| POST | `/api/auth/reset-password` | Reset with OTP |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/logout` | Logout |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id` | Get user profile |
| PATCH | `/api/users/profile/update` | Update profile |
| POST | `/api/users/profile-photo` | Upload profile photo |
| POST | `/api/users/upload-document` | Upload Aadhaar/License/RC |
| PATCH | `/api/users/emergency-contacts` | Set emergency contacts |
| PATCH | `/api/users/driver-info` | Update vehicle info |
| PATCH | `/api/users/change-password` | Change password |
| PATCH | `/api/users/switch-role` | Switch passenger/driver |
| GET | `/api/users/stats/me` | Ride & earning stats |

### Rides
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rides/search` | Search rides (from, to, date, seats) |
| POST | `/api/rides` | Create a ride (driver) |
| GET | `/api/rides/:id` | Get ride details |
| GET | `/api/rides/driver/my-rides` | Driver's own rides |
| PATCH | `/api/rides/:id/start` | Start ride |
| PATCH | `/api/rides/:id/complete` | Complete ride |
| PATCH | `/api/rides/:id/cancel` | Cancel ride |
| PATCH | `/api/rides/:id/location` | Update driver location |
| GET | `/api/rides/nearby/drivers` | Find nearby online drivers |

### Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bookings` | Book seats (returns Razorpay order) |
| GET | `/api/bookings/my` | My bookings |
| GET | `/api/bookings/:id` | Booking details |
| POST | `/api/bookings/:id/cancel` | Cancel booking |
| POST | `/api/bookings/:id/rate` | Rate driver/passenger |
| POST | `/api/bookings/:id/panic` | 🚨 Trigger panic alert |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/verify` | Verify Razorpay payment |
| GET | `/api/payments/my` | Payment history |
| GET | `/api/payments/earnings` | Driver earnings |
| GET | `/api/payments/:id/receipt` | Get receipt |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat/:bookingId/messages` | Message history |
| GET | `/api/chat/unread/count` | Unread message count |
| GET | `/api/chat/conversations/list` | All conversations |

### Tracking
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tracking/:rideId` | Live location + progress |

### Admin (role: admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Platform stats |
| GET | `/api/admin/pending-drivers` | Awaiting approval |
| PATCH | `/api/admin/drivers/:id/approve` | Approve driver |
| PATCH | `/api/admin/drivers/:id/reject` | Reject driver |
| GET | `/api/admin/users` | All users |
| PATCH | `/api/admin/users/:id/ban` | Ban user |
| PATCH | `/api/admin/users/:id/unban` | Unban user |
| GET | `/api/admin/rides` | All rides |
| GET | `/api/admin/analytics` | Revenue & growth charts |
| GET | `/api/admin/panic-alerts` | All panic alerts |
| PATCH | `/api/admin/panic/:id/resolve` | Resolve panic alert |

---

## Socket.io Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join_booking` | `{ bookingId }` | Join chat room |
| `send_message` | `{ bookingId, text, type }` | Send message |
| `typing` | `{ bookingId, isTyping }` | Typing indicator |
| `join_ride_tracking` | `{ rideId }` | Watch driver location |
| `driver_location` | `{ rideId, lat, lng, speed }` | Update driver location |
| `driver_online` | `{ isOnline }` | Toggle online status |

### Server → Client
| Event | Description |
|-------|-------------|
| `message_history` | Last 50 messages on room join |
| `new_message` | Real-time incoming message |
| `user_typing` | Typing indicator |
| `location_update` | Driver GPS update |

---

## Deployment (Railway — easiest for India)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Create project
railway init

# Add MongoDB plugin in Railway dashboard

# Set environment variables in Railway dashboard
# Then deploy:
railway up
```

Your API will be live at `https://safarshare-production.up.railway.app`

---

## Test Credentials (after npm run seed)

| Role | Phone | Password |
|------|-------|----------|
| Admin | +91 9999999999 | Admin@123 |
| Driver | +91 9876543210 | Test@1234 |
| Passenger | +91 9900112234 | Test@1234 |

---

## Security Checklist Before Launch

- [ ] Change all `.env` secrets (JWT_SECRET min 32 chars)
- [ ] Enable MongoDB Atlas IP whitelist
- [ ] Set Razorpay to live keys (not test)
- [ ] Add SSL certificate (HTTPS)
- [ ] Set `NODE_ENV=production`
- [ ] Enable Cloudinary signed uploads
- [ ] Rotate all API keys after testing
- [ ] Set up MongoDB daily backups
