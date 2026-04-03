# SafarShare — Complete Deployment Guide

Deploy the full stack in under 30 minutes:
- **Backend** → Railway (Node.js + MongoDB)
- **Frontend app** → Vercel
- **Landing page** → Vercel
- **Domain** → Namecheap / GoDaddy

---

## Architecture Overview

```
User → safarshare.in (Vercel, landing page)
User → app.safarshare.in (Vercel, React web app)
App → api.safarshare.in (Railway, Node.js backend)
App ↔ api.safarshare.in (Socket.io, WebSocket)
Backend → MongoDB Atlas (managed DB)
Backend → Twilio / Razorpay / Firebase (external APIs)
```

---

## Step 1 — Deploy Backend to Railway

Railway gives you a free tier with $5 credit/month, enough for development. Production costs ~$5/month.

### 1.1 Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### 1.2 Create project
```bash
cd safarshare-backend
railway init
# Choose: Create new project → name: safarshare-backend
```

### 1.3 Add MongoDB plugin
In Railway dashboard:
- Click your project → **+ New** → **Database** → **MongoDB**
- Railway auto-sets `MONGODB_URL` variable — rename it to `MONGODB_URI` in settings

### 1.4 Set environment variables
In Railway dashboard → your service → **Variables**, add all from `.env.example`:
```
NODE_ENV=production
PORT=5000
JWT_SECRET=<generate 64-char random string>
JWT_REFRESH_SECRET=<generate another 64-char string>
TWILIO_ACCOUNT_SID=...
RAZORPAY_KEY_ID=...
GOOGLE_MAPS_API_KEY=...
FIREBASE_PROJECT_ID=...
(all other .env values)
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 1.5 Deploy
```bash
railway up
```

Railway builds and deploys automatically. Your API will be at:
`https://safarshare-backend-production.up.railway.app`

### 1.6 Set custom domain (optional)
Railway dashboard → Settings → Domains → Add domain: `api.safarshare.in`

### 1.7 Seed the database
```bash
railway run npm run seed
```

---

## Step 2 — Deploy Frontend to Vercel

### 2.1 Install Vercel CLI
```bash
npm install -g vercel
vercel login
```

### 2.2 Update API URL
In `safarshare-app-connected.html`, change:
```js
const BASE_URL = 'https://safarshare-backend-production.up.railway.app/api';
```

### 2.3 Deploy web app
```bash
# Create a folder with just the app HTML
mkdir safarshare-web && cp safarshare-app-connected.html safarshare-web/index.html
cd safarshare-web
vercel
# Follow prompts: project name → safarshare-app
```

Your app is live at: `https://safarshare-app.vercel.app`

### 2.4 Deploy landing page
```bash
cd safarshare-landing
vercel
# Project name → safarshare-landing
```

Landing page live at: `https://safarshare-landing.vercel.app`

### 2.5 Set custom domains
Vercel dashboard → each project → Settings → Domains:
- Landing: `safarshare.in` and `www.safarshare.in`
- App: `app.safarshare.in`

---

## Step 3 — Domain DNS Setup

In your domain registrar (Namecheap / GoDaddy), add these DNS records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | 76.76.21.21 (Vercel) | Auto |
| CNAME | www | cname.vercel-dns.com | Auto |
| CNAME | app | cname.vercel-dns.com | Auto |
| CNAME | api | your-railway-domain.up.railway.app | Auto |

---

## Step 4 — SSL Certificates

Both Vercel and Railway handle SSL automatically via Let's Encrypt. No action needed.

---

## Step 5 — Production Checklist

Run through these before going live:

### Backend security
```bash
# 1. Change all default secrets in Railway environment variables
# 2. Set NODE_ENV=production
# 3. Switch Razorpay to LIVE keys (not test)
# 4. Set FRONTEND_URL to your actual domain
NODE_ENV=production
FRONTEND_URL=https://app.safarshare.in
```

### MongoDB Atlas (switch from Railway MongoDB for production)
1. Create Atlas M0 free cluster at https://cloud.mongodb.com
2. Whitelist Railway's IP (or 0.0.0.0/0 for all IPs)
3. Update `MONGODB_URI` in Railway to Atlas connection string
4. Run `railway run npm run seed` once

### Razorpay live mode
1. Dashboard → Settings → API Keys → **Regenerate Live Keys**
2. Update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Railway
3. Update webhook URL to `https://api.safarshare.in/webhook/razorpay`
4. Test a ₹1 transaction before launch

### Google Maps API restrictions
1. In Google Cloud Console → APIs → Credentials → your key
2. Add **HTTP referrers**: `*.safarshare.in/*`
3. Add **IP addresses**: your Railway server IP

---

## Step 6 — Monitoring Setup

### Uptime monitoring (free)
Add your API to UptimeRobot (https://uptimerobot.com):
- Monitor URL: `https://api.safarshare.in/health`
- Alert email: your email

### Error logging (Railway built-in)
Railway dashboard → your service → **Observability** shows real-time logs.

For production, add Sentry:
```bash
npm install @sentry/node
```
In `server.js`:
```js
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV });
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

---

## Step 7 — Continuous Deployment

### Connect GitHub to Railway
Railway dashboard → your service → Settings → Source → connect GitHub repo.

Every push to `main` auto-deploys. To protect production:
- Create `main` and `develop` branches
- Railway deploys from `main`
- All development happens on `develop`

### Connect GitHub to Vercel
Vercel dashboard → project → Settings → Git → connect repo.

---

## Monthly Cost Estimate

| Service | Free tier | Production |
|---------|-----------|------------|
| Railway (backend) | $5 credit | ~$5/mo |
| MongoDB Atlas | M0 free | Free for MVP |
| Vercel (frontend) | Free | Free |
| Twilio | 15 free SMS | ~$0.005/SMS |
| Razorpay | Free | 2% per transaction |
| Google Maps | $200 free credit | ~$2-5/mo |
| Firebase | Free | Free for MVP |
| Cloudinary | Free 25GB | Free for MVP |
| **Total MVP** | **~$0** | **~$10-15/mo** |

---

## Quick Deploy Script

Save as `deploy.sh` and run after any change:

```bash
#!/bin/bash
set -e
echo "🚀 Deploying SafarShare..."

echo "📦 Deploying backend to Railway..."
cd safarshare-backend
railway up --detach

echo "🌐 Deploying app to Vercel..."
cd ../safarshare-web
vercel --prod

echo "🏠 Deploying landing to Vercel..."
cd ../safarshare-landing
vercel --prod

echo "✅ Deployment complete!"
echo "API:     https://api.safarshare.in/health"
echo "App:     https://app.safarshare.in"
echo "Landing: https://safarshare.in"
```

```bash
chmod +x deploy.sh
./deploy.sh
```
