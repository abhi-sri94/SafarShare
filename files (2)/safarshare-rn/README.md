# SafarShare — React Native App

## Project Structure

```
safarshare-rn/
├── App.js                          ← Entry point
├── src/
│   ├── services/
│   │   ├── api.js                  ← All API calls (axios + interceptors)
│   │   ├── socketService.js        ← Socket.io (chat + tracking)
│   │   ├── locationService.js      ← GPS (foreground + background)
│   │   └── notificationService.js  ← Firebase push notifications
│   ├── store/
│   │   ├── index.js                ← Redux store
│   │   ├── authSlice.js            ← Auth state (login, register, role)
│   │   └── ridesSlice.js           ← Rides + bookings state
│   ├── navigation/
│   │   └── AppNavigator.js         ← Stack + tab navigators
│   └── screens/
│       ├── HomeScreen.js           ← Ride search
│       ├── TrackingScreen.js       ← Live Google Maps tracking
│       ├── PanicScreen.js          ← Emergency button + GPS
│       ├── ChatScreen.js           ← Real-time messaging
│       └── ... (15 more screens)
```

---

## Setup Instructions

### Step 1 — Environment setup

Follow the official React Native environment setup guide:
https://reactnative.dev/docs/environment-setup

You need:
- Node.js 18+
- Java 17 (Android)
- Android Studio + Android SDK
- Xcode 14+ (iOS, Mac only)

### Step 2 — Install dependencies

```bash
cd safarshare-rn
npm install

# iOS only
cd ios && pod install && cd ..
```

### Step 3 — Configure the backend URL

Open `src/services/api.js` and change:
```js
// Local dev:
export const BASE_URL = 'http://localhost:5000/api';
// → change to your deployed Railway URL:
export const BASE_URL = 'https://safarshare-production.up.railway.app/api';
```

### Step 4 — Google Maps setup

**Android** — in `android/app/src/main/AndroidManifest.xml`:
```xml
<meta-data
  android:name="com.google.android.geo.API_KEY"
  android:value="YOUR_GOOGLE_MAPS_API_KEY" />
```

**iOS** — in `ios/SafarShare/AppDelegate.mm`:
```objc
#import <GoogleMaps/GoogleMaps.h>
// In didFinishLaunchingWithOptions:
[GMSServices provideAPIKey:@"YOUR_GOOGLE_MAPS_API_KEY"];
```

### Step 5 — Firebase setup

1. Go to https://console.firebase.google.com
2. Add Android app (package: `com.safarshare`) → download `google-services.json` → place in `android/app/`
3. Add iOS app (bundle ID: `com.safarshare`) → download `GoogleService-Info.plist` → place in `ios/SafarShare/`

### Step 6 — Razorpay setup

The `react-native-razorpay` package handles the checkout UI natively.

**Android** — no extra setup needed.

**iOS** — add to `ios/Podfile`:
```ruby
pod 'Razorpay-pod', '~> 1.3'
```
Then run `pod install`.

### Step 7 — Permissions

**Android** `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

**iOS** `ios/SafarShare/Info.plist`:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>SafarShare uses your location for ride tracking.</string>
<key>NSLocationAlwaysUsageDescription</key>
<string>SafarShare uses background location so passengers can track your ride.</string>
```

### Step 8 — Run the app

```bash
# Android
npx react-native run-android

# iOS (Mac only)
npx react-native run-ios
```

---

## Key Features by Screen

| Screen | Real features |
|--------|--------------|
| HomeScreen | Live ride search via API, popular route chips |
| TrackingScreen | Real Google Maps, Socket.io live GPS, polyline route |
| PanicScreen | Real GPS coordinates, API panic call, phone vibration, dial 112/108 |
| ChatScreen | Socket.io real-time messages, typing indicators, location sharing |
| BookingScreen | Razorpay native checkout, payment verification |
| DriverHomeScreen | Socket.io online toggle, background GPS tracking |
| PostRideScreen | Geocoding via Google Maps API |
| ProfileScreen | Cloudinary photo upload, emergency contacts |

---

## Building for Production

### Android APK / AAB
```bash
cd android
./gradlew assembleRelease        # APK
./gradlew bundleRelease          # AAB (for Play Store)
```
Output: `android/app/build/outputs/`

### iOS IPA
Open `ios/SafarShare.xcworkspace` in Xcode → Product → Archive → Distribute App

### Play Store & App Store
- Play Store: upload AAB at https://play.google.com/console
- App Store: use Xcode or Transporter at https://appstoreconnect.apple.com
