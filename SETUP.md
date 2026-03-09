# Friendly MVP — Setup Guide

## Prerequisites

- Node.js 20+
- Google Cloud SDK (`gcloud`)
- Firebase CLI (`firebase-tools`)
- Expo CLI (`npx expo`)
- EAS CLI (`eas-cli`)
- Xcode (iOS) / Android Studio (Android)

---

## Step 1: Firebase Project

```bash
# Create project
firebase projects:create friendly-app --display-name "Friendly"

# Set as default
firebase use friendly-app

# Enable services
firebase init firestore
firebase init storage
```

In the Firebase Console:
1. **Authentication** → Enable "Email/Password" and "Apple" sign-in providers
2. **Firestore** → Create database in production mode
3. **Storage** → Create default bucket
4. **Cloud Messaging** → Note your Server Key

---

## Step 2: Firebase Config for Mobile

### iOS
1. Firebase Console → Project Settings → Add iOS app
2. Bundle ID: `com.friendly.ai.app`
3. Download `GoogleService-Info.plist`
4. Place in `apps/friendly-mobile/GoogleService-Info.plist`

### Android
1. Firebase Console → Project Settings → Add Android app
2. Package: `com.friendly.app`
3. Download `google-services.json`
4. Place in `apps/friendly-mobile/google-services.json`

---

## Step 3: FCM Setup

### iOS (APNs)
1. Apple Developer → Certificates → Create APNs Key
2. Firebase Console → Project Settings → Cloud Messaging → iOS
3. Upload the APNs key

### Android
FCM works automatically with `google-services.json`.

---

## Step 4: Install Dependencies

```bash
# From repo root
cd apps/friendly-mobile && npm install
cd ../../services/friendly-api && npm install
```

---

## Step 5: Run API Locally

```bash
cd services/friendly-api

# Set environment (mock providers for dev)
export USE_MOCK_PROVIDERS=true
export GCP_PROJECT_ID=friendly-app
export STORAGE_BUCKET=friendly-app.appspot.com
export PROACTIVE_JOB_SECRET=dev-secret

# Start dev server
npm run dev
# → Listening on http://localhost:8080
```

---

## Step 6: Run Mobile App

```bash
cd apps/friendly-mobile

# Start Expo dev server
npx expo start

# Or directly:
npx expo run:ios     # Requires Xcode
npx expo run:android # Requires Android Studio
```

> Note: Firebase native modules require a development build, not Expo Go.
> Run `npx expo prebuild` then build via Xcode/Android Studio,
> or use EAS development builds.

---

## Step 7: EAS Build Profiles

```bash
# Login to EAS
eas login

# Configure
eas build:configure

# Development build (with dev client)
eas build --platform ios --profile development

# Preview build (internal distribution)
eas build --platform all --profile preview

# Production build
eas build --platform all --profile production
```

---

## Step 8: Deploy API to Cloud Run

```bash
# Set env vars
export GCP_PROJECT_ID=friendly-app
export GCP_REGION=us-central1

# Deploy
cd infra && bash deploy.sh
```

After deployment:
1. Copy the service URL from output
2. Update `API_BASE_URL` in `apps/friendly-mobile/src/config/constants.ts`

---

## Step 9: Set Real AI Provider Keys

```bash
gcloud run services update friendly-api \
  --region=us-central1 \
  --set-env-vars="OPENAI_API_KEY=sk-...,ELEVENLABS_API_KEY=...,USE_MOCK_PROVIDERS=false"
```

---

## Step 10: Cloud Scheduler (Proactive Outreach)

```bash
export PROACTIVE_JOB_SECRET=$(openssl rand -hex 32)

# Update Cloud Run with the secret
gcloud run services update friendly-api \
  --region=us-central1 \
  --set-env-vars="PROACTIVE_JOB_SECRET=${PROACTIVE_JOB_SECRET}"

# Create scheduler job
cd infra && bash scheduler-setup.sh
```

---

## Step 11: RevenueCat (Subscriptions)

1. Create account at revenuecat.com
2. Create a project → Add iOS and Android apps
3. Configure products:
   - `friendly_starter` — $9.99/month
   - `friendly_core` — $19.99/month
   - `friendly_power` — $29.99/month
4. Create entitlements: `starter`, `core`, `power`
5. Copy API keys to `apps/friendly-mobile/src/config/constants.ts`

---

## Step 12: Deploy Firestore Rules

```bash
cd infra
firebase deploy --only firestore:rules,firestore:indexes
```

---

## Rive Avatar

1. Create an account at rive.app
2. Design a 2D character with state machine "MainStateMachine"
3. Add inputs: `isSpeaking` (bool), `emotion` (number 0-5), `intensity` (number 0-1)
4. Export as `avatar.riv`
5. Place at `apps/friendly-mobile/src/assets/avatar.riv`

Until you have a real Rive file, the app uses `AvatarPlaceholder` (a simple animated face).
