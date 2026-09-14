# LocalMart Backend (Core MVP)

A REST API for LocalMart — a local store, product & service **discovery** platform.
No cart, no checkout, no payments, no bookings: this backend only ever supports
*search, profiles, and enquiries*, per `localmart-prd.md`.

This is the **core MVP** slice of the full PRD (see "What's not in here yet" below) —
enough for a customer to discover stores/products/service providers, view a
profile, send an enquiry, and for a vendor or provider to register, manage
their listings, and see their enquiries and basic stats.

## Stack

- Node.js + Express
- PostgreSQL (plain SQL — no ORM, so the schema in `db/schema.sql` is the
  full, readable source of truth)
- JWT auth, OTP-style mobile login (no real SMS gateway wired in yet — see below)

## Getting started

```bash
cp .env.example .env      # then edit DATABASE_URL / JWT_SECRET for your setup
npm install
npm run migrate           # creates all tables (safe to re-run)
npm run seed               # inserts sample data (Shree Mobile Center, Ramesh
                            # Electricals, Rahul Deshmukh — the same fictional
                            # records used in the LocalMart HTML prototypes)
npm run dev                 # starts the API on http://localhost:4000 with reload
```

Health check: `GET /api/health` → `{ "ok": true }`.

### Trying it end-to-end with curl

```bash
# 1. Request an OTP (role must be customer/vendor/provider)
curl -X POST localhost:4000/api/auth/otp/request \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"+919876543210","role":"customer"}'
# → in dev mode the response includes "dev_otp" so you don't need a real SMS gateway

# 2. Verify it to get a JWT
curl -X POST localhost:4000/api/auth/otp/verify \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"+919876543210","otp":"<dev_otp from above>","role":"customer","name":"Rahul Deshmukh"}'

# 3. Use the token
curl localhost:4000/api/customer/me -H 'Authorization: Bearer <token>'

# 4. Public search, no login needed
curl "localhost:4000/api/stores/nearby?lat=19.15&lng=77.32"
curl "localhost:4000/api/products/search?q=galaxy"
curl "localhost:4000/api/providers/nearby?lat=19.15&lng=77.32"
```

## Project layout

```
db/schema.sql        full table definitions (source of truth — no migration framework)
db/seed.sql          sample data matching the LocalMart prototypes
scripts/migrate.js   runs schema.sql
scripts/seed.js      runs seed.sql (skips if stores already exist)
src/app.js           Express app: middleware, route mounting
src/server.js        process entrypoint
src/db.js            pg Pool wrapper
src/config.js        env var loading
src/middleware/      auth (JWT), error handling
src/utils/           jwt, otp, distance (haversine), asyncHandler
src/routes/          one file per resource — see "API surface" below
uploads/             local image storage for the /api/uploads/image endpoint
```

## Data model (see `db/schema.sql` for full detail)

`states → cities → areas` (location hierarchy), `categories` / `service_categories`,
`users` (one table, `role` column: customer/vendor/provider/admin), `stores`,
`products` (+ `product_images`), `service_providers`, `service_provider_areas`
(coverage, since a provider covers areas rather than sitting at one address),
`services`, `enquiries` (one shared table for both store- and provider-targeted
enquiries), `favorites`, `search_history`, and two generic analytics tables
(`view_events`, `interaction_events` for call/WhatsApp/direction clicks) that
back the dashboard KPI tiles without a table per metric.

A service provider's `base_lat`/`base_lng` (used only to estimate distance) are
never returned by any API response — only the computed `distance_km` and the
named `coverage_areas` are public, per PRD §3/§13/§21.

## API surface

**Public (no login required):**
```
GET  /api/health
GET  /api/stores/nearby?lat=&lng=&limit=
GET  /api/stores?city=&area=&category=&q=&verified=
GET  /api/stores/:id
GET  /api/products/search?q=&city=&category=&brand=
GET  /api/products/:id
GET  /api/providers/nearby?lat=&lng=&limit=
GET  /api/providers?city=&category=&area=&home_visit=&verified=&min_experience=
GET  /api/providers/:id
GET  /api/services/search?q=&city=&category=&home_visit=
GET  /api/categories
GET  /api/service-categories
GET  /api/cities?state=
GET  /api/areas?city_id=
GET  /api/search/suggest?q=            (type-ahead)
POST /api/enquiries                    (works logged-out too)
POST /api/enquiries/:id/report
POST /api/track/view                   (view_events — call from a profile/product page)
POST /api/track/interaction            (interaction_events — call/whatsapp/direction clicks)
POST /api/auth/otp/request             { mobile, role }
POST /api/auth/otp/verify              { mobile, otp, role, name? } → { token, user }
```

**Vendor (JWT with role=vendor):**
```
POST   /api/vendors/register
GET    /api/vendor/store
PUT    /api/vendor/store
GET    /api/vendor/products
POST   /api/vendor/products
PUT    /api/vendor/products/:id
DELETE /api/vendor/products/:id
GET    /api/vendor/enquiries
POST   /api/vendor/enquiries/:id/reply
GET    /api/vendor/overview?days=7     (dashboard KPI tiles)
```

**Service provider (JWT with role=provider):** the same shape, under `/api/providers/register`
and `/api/provider/*` (`profile` instead of `store`, `services` instead of `products`).

**Customer (JWT with role=customer):**
```
GET    /api/customer/me
PUT    /api/customer/me
GET    /api/customer/favorites
POST   /api/customer/favorites
DELETE /api/customer/favorites/:id
GET    /api/customer/enquiries
```

**Uploads:** `POST /api/uploads/image` (any logged-in role, multipart `image` field,
JPEG/PNG/WEBP up to 5MB) → `{ "url": "/uploads/<file>" }`.

## What's in this MVP vs. what's next

This build covers PRD §28 items 1–22 (homepage/discovery data, location, search,
store/product/service-provider profiles, registration, vendor & provider
dashboards including product/service management, and customer enquiries) —
matching what the 14 LocalMart prototype pages actually call for.

**Deliberately not built yet (Phase 2 — "Full PRD scope"):**
- **Admin panel backend** (§14): approve/reject/suspend vendors & providers,
  product/service moderation, category & city management, platform-wide
  reports, enquiry abuse review. The prototype admin panel page has no live
  data source yet — everything currently comes in as `status='pending'` and
  would need an admin to flip it to `'approved'` directly in the database
  (`UPDATE stores SET status='approved' WHERE id=...`) until that's built.
- Real SMS gateway for OTP delivery (`src/utils/otp.js` just logs the code
  and, in non-production, echoes it back in the API response for testing —
  wire MSG91/Twilio/etc. there before this goes live).
- Cloud file storage for uploads (currently local disk under `/uploads`,
  which won't survive a redeploy — swap for S3/Cloud Storage).
- Reviews/ratings (PRD §16 marks this future/optional).
- Notifications (§17), featured-listing curation tables, site settings (§14).
- PostGIS / a real geocoding + routing provider for distance (currently a
  plain haversine formula in SQL — fine for MVP, not for real "directions").

## Connecting this to the existing prototype pages

The 14 LocalMart prototypes are static, single-file HTML artifacts (each its
own origin, no build step) with hardcoded sample data — they are not wired to
this API. To connect a page for real: add `fetch()` calls against this API's
base URL (once it's deployed somewhere publicly reachable — this can't be the
same cloud sandbox this was built in), handle the JWT in `localStorage`
alongside the existing `?lang=` mechanism, and replace each hardcoded data
array with the matching endpoint's response. That rewire was intentionally
left out of this pass — this delivery is the backend codebase only.

## Security notes already covered

Helmet default headers, CORS (configurable via `ALLOWED_ORIGINS`), a coarse
global rate limit (tighten per-route — especially OTP and enquiry submission —
before production), `express-validator` on the main write endpoints, OTPs
hashed at rest and single-use, JWT-based role checks on every vendor/provider/
customer route, parameterized SQL everywhere (no string-built queries), and
upload MIME/size validation. Still needed before production: per-route rate
limiting, HTTPS termination in front of this (e.g. behind a reverse proxy),
and moving `JWT_SECRET` to a real secrets manager.
