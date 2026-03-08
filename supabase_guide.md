# Supabase Guide — Cloud Backend Setup

## Overview

This guide covers setting up Supabase as a cloud backend for the Trading Chart Platform. Supabase replaces the local SQLite database and Node.js server with a hosted PostgreSQL database, real-time subscriptions, authentication, and Edge Functions — enabling the app to work from anywhere without running a local server.

## What Supabase Provides

| Feature | Replaces |
|---|---|
| PostgreSQL Database | Local SQLite (`alerts.db`) |
| Realtime Subscriptions | Binance WebSocket polling in browser |
| Edge Functions | Local Node.js server (`server/`) |
| Authentication | No auth (current setup) |
| Row Level Security | No security (current setup) |

---

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up / log in
2. Click **New Project**
3. Choose your organization, set a project name (e.g., `trading-alerts`)
4. Set a strong **database password** (save it somewhere safe)
5. Choose a **region** close to you
6. Click **Create new project** and wait for provisioning (~2 minutes)

---

## Step 2: Get Your API Keys

1. In your Supabase dashboard, go to **Settings → API**
2. Copy these values:
   - **Project URL** — e.g., `https://xyzcompany.supabase.co`
   - **anon (public) key** — safe to use in frontend code
   - **service_role key** — ⚠️ NEVER expose in frontend; only use in Edge Functions

---

## Step 3: Create Database Tables

Go to **SQL Editor** in your Supabase dashboard and run the following:

### Alerts Table

```sql
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('above', 'below', 'cross_above', 'cross_below', 'cross_any')),
  target_price REAL NOT NULL,
  timeframe TEXT DEFAULT '1m',
  active BOOLEAN DEFAULT true,
  triggered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  triggered_at TIMESTAMPTZ,
  telegram_chat_id TEXT
);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own alerts"
  ON alerts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Indicator Alerts Table

```sql
CREATE TABLE IF NOT EXISTS indicator_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  indicator TEXT NOT NULL,
  period INTEGER DEFAULT 14,
  condition TEXT NOT NULL CHECK (condition IN ('above', 'below', 'cross_above', 'cross_below')),
  threshold REAL,
  timeframe TEXT DEFAULT '1h',
  active BOOLEAN DEFAULT true,
  triggered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  triggered_at TIMESTAMPTZ,
  telegram_chat_id TEXT
);

ALTER TABLE indicator_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own indicator alerts"
  ON indicator_alerts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Alert Logs Table

```sql
CREATE TABLE IF NOT EXISTS alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID,
  alert_type TEXT DEFAULT 'price',
  symbol TEXT NOT NULL,
  message TEXT NOT NULL,
  price REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read logs"
  ON alert_logs FOR SELECT
  TO authenticated
  USING (true);
```

### Trendlines Table (optional — persist drawings)

```sql
CREATE TABLE IF NOT EXISTS trendlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_time BIGINT NOT NULL,
  start_price REAL NOT NULL,
  end_time BIGINT NOT NULL,
  end_price REAL NOT NULL,
  color TEXT DEFAULT '#2962FF',
  thickness INTEGER DEFAULT 2,
  line_style TEXT DEFAULT 'solid',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trendlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trendlines"
  ON trendlines FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### User Settings Table

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  telegram_enabled BOOLEAN DEFAULT false,
  default_timeframe TEXT DEFAULT '1h',
  theme TEXT DEFAULT 'dark',
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## Step 4: Set Up Authentication (Optional)

1. Go to **Authentication → Providers** in the Supabase dashboard
2. **Email/Password** is enabled by default
3. To enable **Google Sign-In**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add `https://your-project.supabase.co/auth/v1/callback` as redirect URI
   - Paste Client ID and Secret in Supabase → Authentication → Providers → Google

---

## Step 5: Install Supabase Client in Frontend

```bash
npm install @supabase/supabase-js
```

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

> The anon key is safe to include in frontend code — it's a public key that only works with RLS policies.

---

## Step 6: Create Edge Function for Price Monitoring

Edge Functions replace the local Node.js server for server-side logic.

### Create the function

```bash
supabase functions new price-monitor
```

### Example Edge Function (`supabase/functions/price-monitor/index.ts`)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Fetch active alerts
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('active', true);

  // Check prices against Binance
  for (const alert of alerts || []) {
    const symbol = alert.symbol.replace('/', '').toUpperCase();
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    const { price } = await res.json();
    const currentPrice = parseFloat(price);

    let triggered = false;
    if (alert.condition === 'above' && currentPrice > alert.target_price) triggered = true;
    if (alert.condition === 'below' && currentPrice < alert.target_price) triggered = true;

    if (triggered) {
      // Mark as triggered
      await supabase
        .from('alerts')
        .update({ triggered: true, active: false, triggered_at: new Date().toISOString() })
        .eq('id', alert.id);

      // Log it
      await supabase.from('alert_logs').insert({
        alert_id: alert.id,
        symbol: alert.symbol,
        message: `⚠️ ${alert.symbol} ${alert.condition} ${alert.target_price} — Current: ${currentPrice}`,
        price: currentPrice,
      });

      // Send Telegram notification
      if (alert.telegram_chat_id) {
        const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: alert.telegram_chat_id,
              text: `⚠️ ${alert.symbol} ${alert.condition === 'above' ? '↑' : '↓'} ${alert.target_price}\nCurrent: ${currentPrice}`,
            }),
          });
        }
      }
    }
  }

  return new Response(JSON.stringify({ checked: alerts?.length || 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### Deploy

```bash
supabase functions deploy price-monitor
```

### Set Secrets

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=your-bot-token-here
```

### Schedule with pg_cron (check every 30 seconds)

In SQL Editor:

```sql
SELECT cron.schedule(
  'check-price-alerts',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/price-monitor',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('supabase.service_role_key'))
  );
  $$
);
```

> Note: `pg_cron` minimum interval is 1 minute. For sub-minute checks, use an external scheduler or the local Node.js server.

---

## Step 7: Enable Realtime (Optional)

For live alert status updates in the frontend:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE alert_logs;
```

Then in your frontend:

```typescript
supabase
  .channel('alerts')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, (payload) => {
    console.log('Alert changed:', payload);
  })
  .subscribe();
```

---

## Architecture Comparison

### Local Server (current)
```
Browser ←→ Binance WS (real-time charts)
Local Node.js server ←→ Binance WS (alert monitoring)
Local Node.js server ←→ Telegram Bot
SQLite (local file)
```

### With Supabase
```
Browser ←→ Binance WS (real-time charts)
Browser ←→ Supabase (alerts CRUD, auth, realtime)
Edge Function (scheduled) ←→ Binance API (alert checking)
Edge Function ←→ Telegram API (notifications)
PostgreSQL (cloud, persistent)
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `401 Unauthorized` | Check your anon key is correct |
| RLS blocking queries | Ensure user is authenticated and policies match |
| Edge Function timeout | Binance API may be slow; add error handling |
| Realtime not working | Ensure table is added to `supabase_realtime` publication |
| `pg_cron` not available | Enable it in Dashboard → Database → Extensions |
