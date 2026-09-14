-- Sample data for local dev/demo — the same fictional records used throughout
-- the LocalMart HTML prototypes (Shree Mobile Center, Ramesh Electricals,
-- Rahul Deshmukh), so the two stay recognizably in sync.
-- Run via: npm run seed  (scripts/seed.js skips this file if stores already exist).

INSERT INTO states (name) VALUES ('Maharashtra') ON CONFLICT DO NOTHING;

INSERT INTO cities (state_id, name)
SELECT st.id, city FROM states st, unnest(ARRAY['Nanded', 'Latur', 'Parbhani', 'Hingoli']) AS city
WHERE st.name = 'Maharashtra'
ON CONFLICT DO NOTHING;

INSERT INTO areas (city_id, name)
SELECT c.id, a FROM cities c, unnest(ARRAY['Vazirabad', 'Mukhed Road', 'Shivaji Nagar', 'Degloor Naka']) AS a
WHERE c.name = 'Nanded'
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, icon, sort_order) VALUES
  ('Grocery', 'basket', 1),
  ('Clothing', 'shirt', 2),
  ('Mobile & Electronics', 'mobile', 3),
  ('Hardware', 'wrench', 4),
  ('Agriculture', 'leaf', 5),
  ('Pharmacy', 'plus', 6),
  ('Furniture', 'home', 7),
  ('Home Appliances', 'box', 8),
  ('Footwear', 'shirt', 9),
  ('Automobile', 'wrench', 10),
  ('Jewellery', 'tag', 11),
  ('Stationery', 'tag', 12),
  ('Restaurants', 'store', 13),
  ('Other', 'tag', 14)
ON CONFLICT DO NOTHING;

INSERT INTO service_categories (name, icon, sort_order) VALUES
  ('Electrician', 'flash', 1),
  ('Plumber', 'wrench', 2),
  ('Home Tutor', 'user', 3),
  ('AC & Appliance Repair', 'tool', 4),
  ('Salon at Home', 'user', 5),
  ('Tailor', 'shirt', 6),
  ('Carpenter', 'tool', 7),
  ('Pest Control', 'leaf', 8),
  ('Event Help', 'tag', 9),
  ('Other', 'tag', 10)
ON CONFLICT DO NOTHING;

-- Vendor: Shree Mobile Center (Rajesh Kulkarni)
INSERT INTO users (mobile, role, name) VALUES ('+919800000001', 'vendor', 'Rajesh Kulkarni')
ON CONFLICT (mobile) DO NOTHING;

INSERT INTO stores (
  vendor_user_id, name, owner_name, whatsapp, category_id, description,
  city_id, area_id, address, pincode, lat, lng, opens_at, closes_at,
  weekly_holiday, established_year, is_verified, is_public, status
)
SELECT u.id, 'Shree Mobile Center', 'Rajesh Kulkarni', '+919800000001', c.id,
  'Mobile phones, accessories and electronics in Vazirabad, Nanded.',
  ci.id, a.id, 'Shop 4, Mukhed Road', '431601', 19.1481, 77.3210, '10:00', '21:00',
  'None', 2015, true, true, 'approved'
FROM users u, categories c, cities ci, areas a
WHERE u.mobile = '+919800000001' AND c.name = 'Mobile & Electronics' AND ci.name = 'Nanded' AND a.name = 'Vazirabad'
  AND NOT EXISTS (SELECT 1 FROM stores WHERE vendor_user_id = u.id);

INSERT INTO products (store_id, category_id, brand, name, description, price, availability)
SELECT s.id, c.id, v.brand, v.name, v.description, v.price, v.availability
FROM stores s
JOIN categories c ON c.name = 'Mobile & Electronics'
JOIN (VALUES
  ('Samsung', 'Samsung Galaxy A15', '6.5" display, 128GB storage.', 11499.00, 'available'),
  ('boAt', 'boAt Airdopes 141', 'True wireless earbuds, 42h playback.', 1299.00, 'available'),
  ('Samsung', 'Samsung Galaxy Tab A9', '8.7" tablet, 64GB.', 10999.00, 'available'),
  ('Redmi', 'Redmi Power Bank 20000mAh', '22.5W fast charging.', 1799.00, 'contact_vendor'),
  ('Mi', 'Mi LED Bulb 9W (pack of 2)', 'Cool white, 2-year warranty.', 399.00, 'unavailable')
) AS v(brand, name, description, price, availability) ON true
WHERE s.name = 'Shree Mobile Center'
  AND NOT EXISTS (SELECT 1 FROM products WHERE store_id = s.id);

-- Service provider: Ramesh Electricals
INSERT INTO users (mobile, role, name) VALUES ('+919800000002', 'provider', 'Ramesh Jadhav')
ON CONFLICT (mobile) DO NOTHING;

INSERT INTO service_providers (
  provider_user_id, business_name, is_individual, service_category_id, bio,
  years_experience, city_id, base_lat, base_lng, home_visit, at_location,
  working_hours, weekly_holiday, languages, is_verified, is_public, status
)
SELECT u.id, 'Ramesh Electricals', true, sc.id,
  'Licensed electrician covering Vazirabad and nearby areas — wiring, repairs and installations.',
  8, ci.id, 19.1500, 77.3180, true, false, '08:00 - 20:00', 'None fixed',
  ARRAY['Marathi', 'Hindi', 'English'], true, true, 'approved'
FROM users u, service_categories sc, cities ci
WHERE u.mobile = '+919800000002' AND sc.name = 'Electrician' AND ci.name = 'Nanded'
  AND NOT EXISTS (SELECT 1 FROM service_providers WHERE provider_user_id = u.id);

INSERT INTO service_provider_areas (provider_id, area_id)
SELECT sp.id, a.id
FROM service_providers sp
JOIN areas a ON a.name IN ('Vazirabad', 'Mukhed Road', 'Shivaji Nagar', 'Degloor Naka')
WHERE sp.business_name = 'Ramesh Electricals'
ON CONFLICT DO NOTHING;

INSERT INTO services (provider_id, name, description, rate_type)
SELECT sp.id, v.name, v.description, v.rate_type
FROM service_providers sp
JOIN (VALUES
  ('Home wiring repair', 'Fixing faulty wiring & short circuits.', 'per_visit'),
  ('Fan & light installation', 'Ceiling fan & lighting fitted.', 'per_job'),
  ('Switchboard & MCB repair', 'Sockets, MCBs & distribution units.', 'per_visit'),
  ('New home wiring (concealed)', 'Site visit needed for estimate.', 'per_job'),
  ('Emergency fault fixing', 'Same-day priority response.', 'per_visit')
) AS v(name, description, rate_type) ON true
WHERE sp.business_name = 'Ramesh Electricals'
  AND NOT EXISTS (SELECT 1 FROM services WHERE provider_id = sp.id);

-- Customer: Rahul Deshmukh
INSERT INTO users (mobile, role, name) VALUES ('+919876543210', 'customer', 'Rahul Deshmukh')
ON CONFLICT (mobile) DO NOTHING;

-- One enquiry + reply thread, matching the customer-account / vendor-dashboard prototypes
INSERT INTO enquiries (
  customer_user_id, customer_name, customer_mobile, target_type, store_id, product_id,
  message, preferred_contact, reply_message, replied_at, status
)
SELECT cu.id, 'Rahul Deshmukh', '+919876543210', 'store', s.id, p.id,
  'Hello, I found your product on LocalMart. Is this available in black? Also is the price negotiable a bit?',
  'whatsapp',
  'Yes, this one''s available in black! Rs 11,499, one unit in stock right now. Feel free to walk in anytime before 9pm or ping us here on WhatsApp to hold it.',
  now() - interval '18 hours', 'replied'
FROM users cu, stores s, products p
WHERE cu.mobile = '+919876543210' AND s.name = 'Shree Mobile Center' AND p.name = 'Samsung Galaxy A15'
  AND NOT EXISTS (SELECT 1 FROM enquiries WHERE customer_user_id = cu.id AND store_id = s.id);
