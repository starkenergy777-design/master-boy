# MASTER_BOY — ხელოსნების ეროვნული პლატფორმა (Full-Stack Application)

პროფესიონალი ხელოსნების საძიებო და მართვის სისტემა რეალურ დროში, სამენოვანი მხარდაჭერით (ქართული, რუსული, ინგლისური), GPS რუკით, 180-დღიანი ხელოსნის გამოწერის ციკლით, TOP 15 პრემიუმ სლოტების ბილინგით (BOG, TBC, Stripe), საიდუმლო Staff ადმინ CRM-ით, საიდუმლო სუპერ ადმინისტრატორით და ავტონომიური Gemini AI დამხმარით.

---

## 🚀 სწრაფი დაწყება (Quick Start)

### 1. დამოკიდებულებების ინსტალაცია
```bash
npm install
```

### 2. გარემოს ცვლადების კონფიგურაცია
დააკოპირეთ `.env.example` ფაილი `.env`-ად:
```bash
cp .env.example .env
```

### 3. აპლიკაციის გაშვება (Development)
```bash
npm run dev
```
აპლიკაცია გაეშვება `http://localhost:3000`-ზე (Express REST API v1.2.0 + Vite Frontend HMR).

---

## 🗄️ მონაცემთა ბაზა და მიგრაციები (Database & Migrations)

სისტემა შეიცავს მზა PostgreSQL მიგრაციის ფაილებს `migrations/` დირექტორიაში:

- **`migrations/001_initial_schema.sql`**: სრული DDL სქემა — ცხრილები, უცხოური გასაღებები (FK), ინდექსები, ENUM ტიპები (`users`, `craftsmen`, `cities`, `professions`, `listings`, `top15`, `payments`, `audit_logs` და სხვა).
- **`migrations/002_seed_data.sql`**: საქართველოს 8 ქალაქი, 8 ძირითადი პროფესია, საწყისი TOP 15 ფასები, სუპერ ადმინი და სატესტო ხელოსნები.

### მიგრაციების გაშვება:
```bash
# 1. მიუთითეთ თქვენი PostgreSQL / Supabase / Neon ბაზის ბმული
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/master_boy"

# 2. გაუშვით მიგრატორი
npm run migrate
```

ან `psql`-ის მეშვეობით:
```bash
psql -d "YOUR_DATABASE_URL" -f migrations/001_initial_schema.sql
psql -d "YOUR_DATABASE_URL" -f migrations/002_seed_data.sql
```

---

## 🐳 Docker Deployment

სრული პროექტის გაშვება PostgreSQL 16 ბაზით Docker-ში:
```bash
docker compose up -d
```
Docker ავტომატურად:
1. გაუშვებს PostgreSQL კონტეინერს პორტზე `5432`.
2. შეასრულებს `001_initial_schema.sql` და `002_seed_data.sql` მიგრაციებს.
3. ააგებს და გაუშვებს Node.js სერვერს პორტზე `3000`.

---

## 🔑 საწყისი ანგარიშები და წვდომები

| როლი | ტელეფონის ნომერი | პაროლი | აღწერა |
| :--- | :--- | :--- | :--- |
| **სუპერ ადმინისტრატორი** | `BOOTSTRAP_PHONE` | `BOOTSTRAP_PASSWORD` | 6-თვიანი Config Lock, საბანკო IBAN, AI რეპორტები |
| **Staff ადმინისტრატორი** | `ADMIN_PHONE` | `ADMIN_PASSWORD` | CRM ხელოსნების მართვა, ბლოკირება/განბლოკვა, ფასები |
| **სატესტო ხელოსანი** | `+995599112233` | პაროლი არ ინახება README-ში | გიორგი ბერიძე (სანტექნიკოსი, თბილისი) |

*შენიშვნა: ადმინისტრატორების შესასვლელი საჯარო ინტერფეისში დამალულია — ავტორიზაცია ხდება ხელოსნის შესასვლელი ფანჯრიდან შესაბამისი ნომრითა და პაროლით.*

---

## 🛠️ Build & Production

```bash
# Frontend-ის კომპილაცია dist/ დირექტორიაში
npm run build

# Production სერვერის გაშვება
npm start
```


## Production safety notes

- Cloud Run runtime state is persisted through the server-side Firestore service account. Browser/client Firestore access is denied by `firestore.rules`.
- Production payment endpoints do not simulate successful payments. A real BOG/TBC/Stripe gateway implementation must be connected before accepting real payments.
- OTP delivery requires `SMS_WEBHOOK_URL`; no OTP code is returned to clients.
- Production administrator/bootstrap credentials and provider secrets must be supplied through Cloud Run environment variables or Secret Manager; no real credentials are stored in source files.
- The deployment archive is not served by the application itself.


### Security hardening
- User/admin/partner passwords are stored as scrypt hashes.
- Session tokens expire after 12 hours.
- OTP challenges expire after 5 minutes and allow at most 5 attempts.
- Production CORS is restricted by `APP_ORIGIN`/`APP_URL`; do not leave it unset for a browser deployment.
- Provider credentials and unlock credentials must come from Secret Manager/environment; API responses never return provider secrets or password fields.
- Production payment endpoints remain disabled until a real provider + webhook verification implementation is configured.

- `cloudrun-service.yaml` intentionally limits this Map+Firestore snapshot implementation to one Cloud Run instance with concurrency 1. For horizontal scaling, the runtime data model must be migrated to transactional Firestore/Cloud SQL before increasing `maxScale`.

## Final architecture/security invariants

- Anonymous customers can search, filter, view craftsman profiles, and use the map without creating an account.
- Registration/authentication is only for craftsmen and privileged roles; the public directory does not require authentication.
- OTP login never creates a new user. A craftsman account must already exist.
- Craftsman-only endpoints require the CRAFTSMAN role.
- Advertisement partner endpoints require the AD_PARTNER role.
- Admin and Super Admin endpoints retain their existing role boundaries.
- Production sessions and OTP challenges are intentionally ephemeral and are not persisted as durable application data.
- Production runtime data requires Cloud Firestore; the local JSON snapshot is development-only.
- Production payment endpoints fail closed until a real gateway integration with server-side verification/webhooks is configured.
- Production bootstrap credentials must be explicitly supplied through environment/Secret Manager.
- `role-simulation.mjs` performs the final authorization/role invariants simulation.

## Production readiness hardening (2026-10)

- Production starts only with durable Firestore available and with `BOOTSTRAP_PHONE`, `BOOTSTRAP_PASSWORD`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` supplied as deployment secrets.
- Demo users, demo craftsmen, demo advertisements, demo reports, and demo audit records are not shipped as production runtime data. Legacy demo IDs are cleaned during the first production hydration.
- Runtime local JSON snapshots are development-only. Production never falls back to the container filesystem for runtime state.
- Runtime persistence is triggered only by mutating API requests; GET requests do not rewrite the Firestore snapshot.
- Public customer search remains anonymous: the person looking for a craftsman does not register or log in.
- `/search/nearby` returns only craftsmen with an active listing, matching the main search rules.
- Top 15 ordering is deterministically reshuffled every 30 minutes.
- Payment endpoints fail closed in production until a real gateway adapter/webhook verification is configured. No endpoint may fabricate a successful payment.
- Supabase is not the runtime application database in this release. Its direct client table access is locked down with RLS and revoked `anon`/`authenticated` table privileges; payment secrets previously present in `system_config` were cleared. Do not put provider secrets back into database tables.
- A fresh dependency installation/build must still be executed in a networked build environment (Google Cloud Build/Cloud Shell/CI). The source was syntax-validated here, but this environment could not reach the npm registry to produce a fresh `package-lock.json` or a post-change Vite build.

### External production prerequisites

1. Configure Google Secret Manager / Cloud Run environment variables for all required secrets.
2. Configure a real SMS provider endpoint for OTP delivery.
3. Implement and verify the chosen real payment gateway adapter(s) and webhook signatures before enabling paid production flows.
4. Build the image in a networked Google build environment and deploy using `cloudrun-service.yaml`.
5. Keep Cloud Run `maxScale=1` and `containerConcurrency=1` for the current snapshot-based runtime architecture. If higher availability/concurrency is required, migrate runtime entities to transactional Firestore/Postgres before increasing these limits.

## Final buyer-side audit hardening (2026-10-14)

A buyer-oriented audit was performed without changing the established architecture (React/Vite frontend -> Node/Express Cloud Run backend -> Firestore durable storage, with the current single-instance constraint).

Additional fixes:
- Removed the hardcoded Gorgia/demo advertisement fallback from the public home screen. Public ads are now server-authoritative.
- Added the active commercial advertisement placement to the craftsman cabinet.
- Advertisement validity now starts from confirmed payment, not from partner provisioning time.
- Super Admin cannot activate an unpaid advertisement through the admin update endpoint.
- Advertisement partner phone numbers are validated as E.164 and duplicate advertisement accounts are rejected.
- An existing non-advertising application account cannot be hijacked by creating an advertisement partner with the same phone number.
- Advertisement partner payment requests now require an Idempotency-Key and replay the original result for the same ad/key pair.
- Corrected the Super Admin UI password hint to the actual 12-character minimum.
- Removed a duplicated craftsman-dashboard timer wrapper that caused incorrect DOM nesting.

Validation completed:
- 30 TypeScript/TSX files: syntax errors 0.
- Existing role simulation: ALL ROLE SIMULATIONS PASSED.
- Buyer-oriented production audit: 15/15 checks PASSED.
- ZIP integrity: passed.

The project remains intentionally fail-closed for real production payments until a real payment gateway and verified webhook are integrated. The current simulation cannot create a real successful payment in production.
