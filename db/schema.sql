-- LocalMart backend schema (core MVP scope — see README.md for what's in/out).
-- Run via: npm run migrate  (executes this file against DATABASE_URL). Safe to
-- run more than once — every statement is guarded with IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS states (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY,
  state_id INTEGER NOT NULL REFERENCES states(id),
  name TEXT NOT NULL,
  UNIQUE (state_id, name)
);

CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (city_id, name)
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- One users table for every role. Admin accounts are seeded directly in the
-- database (see README) — there is no self-registration path for role='admin'.
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  mobile TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'vendor', 'provider', 'admin')),
  name TEXT,
  email TEXT,
  city_id INTEGER REFERENCES cities(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id SERIAL PRIMARY KEY,
  mobile TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'vendor', 'provider')),
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_requests_lookup ON otp_requests (mobile, role, consumed_at, expires_at);

CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  vendor_user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  owner_name TEXT,
  whatsapp TEXT,
  email TEXT,
  category_id INTEGER REFERENCES categories(id),
  description TEXT,
  city_id INTEGER REFERENCES cities(id),
  area_id INTEGER REFERENCES areas(id),
  address TEXT,
  pincode TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  logo_url TEXT,
  website TEXT,
  opens_at TEXT,
  closes_at TEXT,
  weekly_holiday TEXT,
  established_year INTEGER,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stores_city ON stores (city_id);
CREATE INDEX IF NOT EXISTS idx_stores_category ON stores (category_id);
CREATE INDEX IF NOT EXISTS idx_stores_status_public ON stores (status, is_public);
CREATE INDEX IF NOT EXISTS idx_stores_latlng ON stores (lat, lng);

CREATE TABLE IF NOT EXISTS store_photos (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id),
  brand TEXT,
  name TEXT NOT NULL,
  description TEXT,
  model_number TEXT,
  price NUMERIC(12, 2),
  availability TEXT NOT NULL DEFAULT 'not_specified'
    CHECK (availability IN ('available', 'unavailable', 'contact_vendor', 'not_specified')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_featured BOOLEAN NOT NULL DEFAULT false,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_store ON products (store_id);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_providers (
  id SERIAL PRIMARY KEY,
  provider_user_id INTEGER NOT NULL REFERENCES users(id),
  business_name TEXT NOT NULL,
  is_individual BOOLEAN NOT NULL DEFAULT true,
  service_category_id INTEGER REFERENCES service_categories(id),
  bio TEXT,
  years_experience INTEGER NOT NULL DEFAULT 0,
  city_id INTEGER REFERENCES cities(id),
  -- base_lat/base_lng are the private base location used only to estimate distance —
  -- never expose these two columns in an API response (PRD §3, §13, §21).
  base_lat DOUBLE PRECISION,
  base_lng DOUBLE PRECISION,
  home_visit BOOLEAN NOT NULL DEFAULT true,
  at_location BOOLEAN NOT NULL DEFAULT false,
  working_hours TEXT,
  weekly_holiday TEXT,
  languages TEXT[] NOT NULL DEFAULT '{}',
  website TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_providers_city ON service_providers (city_id);
CREATE INDEX IF NOT EXISTS idx_providers_category ON service_providers (service_category_id);
CREATE INDEX IF NOT EXISTS idx_providers_status_public ON service_providers (status, is_public);
CREATE INDEX IF NOT EXISTS idx_providers_latlng ON service_providers (base_lat, base_lng);

CREATE TABLE IF NOT EXISTS service_provider_areas (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  UNIQUE (provider_id, area_id)
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  service_category_id INTEGER REFERENCES service_categories(id),
  name TEXT NOT NULL,
  description TEXT,
  rate_type TEXT NOT NULL DEFAULT 'rate_shared'
    CHECK (rate_type IN ('hourly', 'per_visit', 'per_job', 'rate_shared')),
  rate_amount NUMERIC(12, 2),
  tags TEXT[] NOT NULL DEFAULT '{}',
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_services_provider ON services (provider_id);

CREATE TABLE IF NOT EXISTS enquiries (
  id SERIAL PRIMARY KEY,
  customer_user_id INTEGER REFERENCES users(id),
  customer_name TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('store', 'provider')),
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  preferred_contact TEXT NOT NULL DEFAULT 'either' CHECK (preferred_contact IN ('call', 'whatsapp', 'either')),
  reply_message TEXT,
  replied_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'replied')),
  reported BOOLEAN NOT NULL DEFAULT false,
  report_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'store' AND store_id IS NOT NULL AND provider_id IS NULL) OR
    (target_type = 'provider' AND provider_id IS NOT NULL AND store_id IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_enquiries_store ON enquiries (store_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_provider ON enquiries (provider_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer ON enquiries (customer_user_id);

CREATE TABLE IF NOT EXISTS favorites (
  id SERIAL PRIMARY KEY,
  customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('store', 'provider')),
  store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
  provider_id INTEGER REFERENCES service_providers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (target_type = 'store' AND store_id IS NOT NULL AND provider_id IS NULL) OR
    (target_type = 'provider' AND provider_id IS NOT NULL AND store_id IS NULL)
  )
);
-- Partial unique indexes (rather than one plain UNIQUE across all four columns) because
-- Postgres treats NULL <> NULL, so a plain constraint would not stop duplicate favorites.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_favorite_store ON favorites (customer_user_id, store_id) WHERE target_type = 'store';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_favorite_provider ON favorites (customer_user_id, provider_id) WHERE target_type = 'provider';

CREATE TABLE IF NOT EXISTS search_history (
  id SERIAL PRIMARY KEY,
  customer_user_id INTEGER REFERENCES users(id),
  query TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_history_customer ON search_history (customer_user_id, created_at DESC);

-- Two generic analytics tables cover every count the PRD's dashboards need
-- (store/product/provider/service views, plus call/WhatsApp/direction clicks)
-- without a separate table per metric.
CREATE TABLE IF NOT EXISTS view_events (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('store', 'provider', 'product', 'service')),
  target_id INTEGER NOT NULL,
  viewer_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_view_events_target ON view_events (target_type, target_id, created_at);

CREATE TABLE IF NOT EXISTS interaction_events (
  id BIGSERIAL PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('store', 'provider')),
  target_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('call', 'whatsapp', 'direction')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interaction_events_target ON interaction_events (target_type, target_id, event_type, created_at);
