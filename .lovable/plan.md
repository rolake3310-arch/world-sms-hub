# SMS Sender Platform — Build Plan

A web app where users top up a wallet (crypto manual or Squad checkout), then send SMS worldwide via GatewayAPI. You (admin) control pricing, active funding methods, deposit approvals, and users.

## Stack
- TanStack Start + Lovable Cloud (Postgres + Auth)
- Email/password auth (you become first admin)
- GatewayAPI connector for SMS sending
- Squad (squadco.com) via REST API (you provide secret key) for card/bank funding
- Crypto: manual — show wallet addresses, user submits tx hash, you approve

## Pages

**Public**
- `/` — landing (what it does, pricing, sign up)
- `/auth` — sign in / sign up

**User (signed in)**
- `/app` — dashboard: balance, quick send, recent activity
- `/app/send` — compose SMS: sender ID, recipients (paste or CSV-like textarea, auto-detect country), message, live cost preview, send
- `/app/fund` — choose active method (crypto or Squad); crypto shows wallet + form to submit tx hash/amount; Squad launches hosted checkout and verifies on return
- `/app/history` — sent messages + funding history

**Admin (`/app/admin`, gated by `admin` role)**
- Dashboard: totals (users, revenue, SMS sent)
- Pricing: global default price + per-country overrides
- Funding methods: toggle Crypto on/off, toggle Squad on/off, manage crypto wallet addresses (BTC/USDT-TRC20/etc), set Squad keys
- Deposits: pending list → approve/reject (credits user balance on approve)
- Users: list, search, adjust balance, suspend
- Messages: global log

## Data model (Lovable Cloud / Postgres)

- `profiles` (id→auth.users, email, balance_usd numeric, status, created_at)
- `user_roles` (user_id, role enum: admin|user) + `has_role()` security-definer fn
- `app_settings` (singleton: crypto_enabled bool, squad_enabled bool, default_price_usd, squad_public_key, currency)
- `crypto_wallets` (id, label, asset, address, active)
- `country_prices` (country_code PK, price_usd) — fallback to default
- `deposits` (id, user_id, method enum crypto|squad, amount_usd, status pending|approved|rejected, tx_reference, squad_ref, proof_url, notes, created_at, reviewed_by, reviewed_at)
- `sms_messages` (id, user_id, sender, recipient, country_code, message, cost_usd, gateway_id, status, error, created_at)

RLS: users see only their own rows; admins see all via `has_role(auth.uid(),'admin')`. Settings/wallets/country_prices: public read, admin write.

## Server functions (`src/lib/*.functions.ts`)
- `getMyBalance`, `getMyHistory`, `getPublicSettings`, `getActiveCryptoWallets`
- `quoteSms({ recipients, message })` → per-recipient country + cost, total, segments
- `sendSms({ sender, recipients, message })` → validates balance, calls GatewayAPI `/mobile/multi`, debits balance, inserts rows
- `submitCryptoDeposit({ amount, asset, tx_hash, proof_url? })`
- `createSquadCheckout({ amount })` → calls Squad init payment, returns checkout URL, stores pending deposit with `squad_ref`
- `verifySquadDeposit({ reference })` → called on return; if Squad says successful, approve deposit
- Admin: `adminListDeposits`, `adminApproveDeposit`, `adminRejectDeposit`, `adminListUsers`, `adminAdjustBalance`, `adminUpdateSettings`, `adminUpsertCountryPrice`, `adminUpsertWallet`

All write fns use `requireSupabaseAuth`; admin fns additionally check `has_role`.

## Integrations
- **GatewayAPI**: connect via Lovable connector; calls go through connector gateway from server fns. Sender ID and message from user; recipient parsed to E.164 MSISDN integer.
- **Squad** (squadco.com): you'll provide `SQUAD_SECRET_KEY` and `SQUAD_PUBLIC_KEY` via Add Secret. Init: `POST https://api-d.squadco.com/transaction/initiate`. Verify: `GET /transaction/verify/:reference`. Webhook (optional) at `/api/public/webhooks/squad` with HMAC verification for instant credit.

## Pricing logic
`price = country_prices[country] ?? app_settings.default_price_usd` per message segment (160 GSM / 70 unicode chars). Quote endpoint returns line items; send debits sum atomically.

## Admin bootstrap
First signup is auto-promoted to admin (or via a one-time SQL seed using your email). Subsequent admins promoted from the Users page.

## Out of scope (v1)
- Automatic on-chain crypto confirmation (still manual approve)
- Scheduled / drip campaigns
- Two-way SMS / inbound webhooks
- Multi-currency display (USD only internally)

## What I need from you to finish wiring
1. Confirm plan → I enable Lovable Cloud, scaffold DB, build pages.
2. Connect **GatewayAPI** when prompted.
3. Provide **Squad** secret key when prompted (get from squadco.com dashboard → API Keys).
4. Tell me the email you'll sign up with so I seed it as admin (or you can promote yourself via SQL after signup).

Reply "go" to start, or tell me what to change.