# Firebase Guide — Cloud Backend Setup

## Overview

This guide covers setting up Firebase as a cloud backend for the Trading Chart Platform. Firebase provides Firestore (NoSQL database), Authentication, Cloud Functions, and Hosting — an alternative to the local Node.js server or Supabase.

---

## What Firebase Provides

| Feature | Replaces |
|---|---|
| Firestore | Local SQLite (`alerts.db`) |
| Cloud Functions | Local Node.js server (`server/`) |
| Firebase Auth | No auth (current setup) |
| Cloud Scheduler | `setInterval` loops in server |
| Firebase Hosting | Local Vite dev server (for deployment) |

---

## Step 1: Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Name it (e.g., `trading-alerts`)
4. Optionally enable Google Analytics
5. Click **Create project**

---

## Step 2: Enable Services

### Firestore Database
1. Go to **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode**
4. Select a region close to you
5. Click **Enable**

### Authentication
1. Go to **Build → Authentication**
2. Click **Get started**
3. Enable **Email/Password** provider
4. Optionally enable **Google** sign-in provider

### Cloud Functions (requires Blaze plan)
1. Go to **Build → Functions**
2. Upgrade to **Blaze (pay-as-you-go)** plan if not already
3. Click **Get started**

---

## Step 3: Get Firebase Config

1. Go to **Project Settings → General**
2. Under **Your apps**, click the web icon (`</>`)
3. Register your app (e.g., `trading-chart`)
4. Copy the Firebase config object:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "trading-alerts-xxxxx.firebaseapp.com",
  projectId: "trading-alerts-xxxxx",
  storageBucket: "trading-alerts-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

---

## Step 4: Install Firebase in Frontend

```bash
npm install firebase
```

Create `src/lib/firebase.ts`:

```typescript
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
```

> Firebase API keys are **public** and safe to include in frontend code. Security is enforced via Firestore Security Rules.

---

## Step 5: Firestore Data Structure

### Collection: `alerts`

```
alerts/
  {alertId}/
    userId: string          // Firebase Auth UID
    symbol: string          // "BTC/USD"
    condition: string       // "above" | "below"
    targetPrice: number     // 70000
    timeframe: string       // "1m"
    active: boolean         // true
    triggered: boolean      // false
    createdAt: Timestamp
    triggeredAt: Timestamp | null
    telegramChatId: string | null
```

### Collection: `indicatorAlerts`

```
indicatorAlerts/
  {alertId}/
    userId: string
    symbol: string
    indicator: string       // "RSI" | "EMA" | "SMA"
    period: number          // 14
    condition: string       // "above" | "below"
    threshold: number       // 70
    timeframe: string       // "1h"
    active: boolean
    triggered: boolean
    createdAt: Timestamp
    triggeredAt: Timestamp | null
    telegramChatId: string | null
```

### Collection: `alertLogs`

```
alertLogs/
  {logId}/
    alertId: string
    alertType: string       // "price" | "indicator"
    symbol: string
    message: string
    price: number
    createdAt: Timestamp
```

### Collection: `userSettings`

```
userSettings/
  {userId}/
    telegramBotToken: string
    telegramChatId: string
    telegramEnabled: boolean
    defaultTimeframe: string
    theme: string
```

### Collection: `trendlines` (optional)

```
trendlines/
  {trendlineId}/
    userId: string
    symbol: string
    timeframe: string
    startTime: number
    startPrice: number
    endTime: number
    endPrice: number
    color: string
    thickness: number
    lineStyle: string
    createdAt: Timestamp
```

---

## Step 6: Firestore Security Rules

Go to **Firestore → Rules** and paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Alerts: users can only access their own
    match /alerts/{alertId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }

    // Indicator alerts: same rules
    match /indicatorAlerts/{alertId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }

    // Alert logs: authenticated users can read
    match /alertLogs/{logId} {
      allow read: if request.auth != null;
      allow write: if false; // Only Cloud Functions write logs
    }

    // User settings: users can only access their own
    match /userSettings/{userId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }

    // Trendlines: users can only access their own
    match /trendlines/{trendlineId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

---

## Step 7: Frontend CRUD Examples

### Create an Alert

```typescript
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

async function createAlert(symbol: string, condition: string, targetPrice: number) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const docRef = await addDoc(collection(db, 'alerts'), {
    userId: user.uid,
    symbol,
    condition,
    targetPrice,
    timeframe: '1m',
    active: true,
    triggered: false,
    createdAt: serverTimestamp(),
    triggeredAt: null,
    telegramChatId: null,
  });

  return docRef.id;
}
```

### List Active Alerts

```typescript
import { collection, query, where, onSnapshot } from 'firebase/firestore';

function subscribeToAlerts(userId: string, callback: (alerts: any[]) => void) {
  const q = query(
    collection(db, 'alerts'),
    where('userId', '==', userId),
    where('active', '==', true)
  );

  return onSnapshot(q, (snapshot) => {
    const alerts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(alerts);
  });
}
```

### Delete an Alert

```typescript
import { doc, deleteDoc } from 'firebase/firestore';

async function removeAlert(alertId: string) {
  await deleteDoc(doc(db, 'alerts', alertId));
}
```

---

## Step 8: Cloud Function for Price Monitoring

### Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase init functions
```

Choose **TypeScript** when prompted.

### Create `functions/src/index.ts`

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Runs every 1 minute
export const checkPriceAlerts = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    const snapshot = await db.collection('alerts')
      .where('active', '==', true)
      .get();

    for (const doc of snapshot.docs) {
      const alert = doc.data();
      const symbol = alert.symbol.replace('/', '').toUpperCase();

      try {
        const res = await fetch(
          `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}${symbol.endsWith('USDT') ? '' : 'USDT'}`
        );
        const { price } = await res.json();
        const currentPrice = parseFloat(price);

        let triggered = false;
        if (alert.condition === 'above' && currentPrice > alert.targetPrice) triggered = true;
        if (alert.condition === 'below' && currentPrice < alert.targetPrice) triggered = true;

        if (triggered) {
          // Update alert
          await doc.ref.update({
            triggered: true,
            active: false,
            triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Log
          await db.collection('alertLogs').add({
            alertId: doc.id,
            alertType: 'price',
            symbol: alert.symbol,
            message: `⚠️ ${alert.symbol} ${alert.condition === 'above' ? '↑' : '↓'} ${alert.targetPrice} — Current: ${currentPrice}`,
            price: currentPrice,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Telegram notification
          if (alert.telegramChatId) {
            const botToken = functions.config().telegram?.bot_token;
            if (botToken) {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: alert.telegramChatId,
                  text: `⚠️ ${alert.symbol} ${alert.condition === 'above' ? '↑' : '↓'} ${alert.targetPrice}\nCurrent: ${currentPrice}`,
                }),
              });
            }
          }
        }
      } catch (err) {
        console.error(`Error checking ${alert.symbol}:`, err);
      }
    }

    return null;
  });
```

### Set Telegram Token as Config

```bash
firebase functions:config:set telegram.bot_token="your-bot-token"
```

### Deploy

```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## Step 9: Deploy Frontend to Firebase Hosting

```bash
firebase init hosting
# Set public directory to: dist
# Configure as SPA: Yes

npm run build
firebase deploy --only hosting
```

Your app will be live at `https://your-project.web.app`.

---

## Architecture with Firebase

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Browser    │────▶│  Firestore   │◀────│  Cloud      │
│   React App  │     │  Database    │     │  Functions  │
│              │     │              │     │  (scheduled)│
│  Binance WS  │     │  alerts      │     │             │
│  (charts)    │     │  alertLogs   │     │  Binance    │
│              │     │  trendlines  │     │  API check  │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                         ┌──────▼──────┐
                                         │  Telegram   │
                                         │  Bot API    │
                                         └─────────────┘
```

---

## Cost Estimation (Blaze Plan)

| Service | Free Tier | Typical Usage |
|---|---|---|
| Firestore | 50K reads/day, 20K writes/day | Well within free tier for personal use |
| Cloud Functions | 2M invocations/month | ~43K/month at 1/min = free |
| Hosting | 10 GB transfer/month | Free for small apps |
| Authentication | Free for all providers | Free |

For a personal trading alert system, Firebase should stay within the **free tier**.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `PERMISSION_DENIED` | Check Firestore rules match your auth state |
| Cloud Function not triggering | Verify it's deployed: `firebase functions:list` |
| Billing required | Cloud Functions + scheduled tasks require Blaze plan |
| `fetch` not available | Use `node-fetch` or upgrade to Node 18+ runtime in `firebase.json` |
| Telegram not sending | Verify config: `firebase functions:config:get` |

---

## Firebase vs Supabase vs Local Server

| Feature | Local Server | Supabase | Firebase |
|---|---|---|---|
| Setup complexity | Low | Medium | Medium |
| Real-time alerts | ✅ WebSocket (1s) | ⚠️ Edge Function (30s+) | ⚠️ Cloud Function (60s) |
| Cost | Free (your PC) | Free tier generous | Free tier generous |
| Runs 24/7 | Need PC on / PM2 | ✅ Cloud hosted | ✅ Cloud hosted |
| SQL queries | ✅ SQLite | ✅ PostgreSQL | ❌ NoSQL (Firestore) |
| Auth built-in | ❌ | ✅ | ✅ |
| Telegram bot | ✅ Polling mode | Edge Function only | Cloud Function only |
| Offline access | ✅ | ❌ | ✅ (Firestore offline) |
