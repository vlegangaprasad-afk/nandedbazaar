const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const STORE_SUMMARY_COLUMNS = `
  s.id, s.name, s.description, s.category_id, c.name AS category_name,
  s.city_id, ci.name AS city_name, s.area_id, a.name AS area_name,
  s.address, s.pincode, s.lat, s.lng, s.logo_url, s.website,
  s.is_verified, s.is_featured, s.opens_at, s.closes_at, s.weekly_holiday,
  s.whatsapp, s.created_at
`;

// GET /api/stores/nearby?lat=&lng=&limit=  — PRD §3 "Automatic Nearby Store Discovery"
router.get(
  '/nearby',
  asyncHandler(async (req, res) => {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 50);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'lat and lng are required.' });
    }

    const { rows } = await db.query(
      `SELECT ${STORE_SUMMARY_COLUMNS},
        (6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians($1)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians($2))
            + sin(radians($1)) * sin(radians(s.lat))
          ))
        )) AS distance_km
       FROM stores s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN areas a ON a.id = s.area_id
       WHERE s.status = 'approved' AND s.is_public = true AND s.lat IS NOT NULL AND s.lng IS NOT NULL
       ORDER BY distance_km ASC
       LIMIT $3`,
      [lat, lng, limit]
    );
    res.json({ stores: rows });
  })
);

// GET /api/stores?city=&area=&category=&q=&verified=true  — PRD §5 "Store search"
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { city, area, category, q, verified } = req.query;
    const clauses = [`s.status = 'approved'`, `s.is_public = true`];
    const params = [];

    if (city) {
      params.push(city);
      clauses.push(`ci.name ILIKE $${params.length}`);
    }
    if (area) {
      params.push(area);
      clauses.push(`a.name ILIKE $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`c.name ILIKE $${params.length}`);
    }
    if (verified === 'true') clauses.push(`s.is_verified = true`);
    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`);
    }

    const { rows } = await db.query(
      `SELECT ${STORE_SUMMARY_COLUMNS}
       FROM stores s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN areas a ON a.id = s.area_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.is_featured DESC, s.created_at DESC
       LIMIT 100`,
      params
    );
    res.json({ stores: rows });
  })
);

// GET /api/stores/:id  — PRD §6 "Store Profile Page"
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid store id.' });

    const { rows } = await db.query(
      `SELECT ${STORE_SUMMARY_COLUMNS}, s.owner_name, s.email, s.established_year, s.status
       FROM stores s
       LEFT JOIN categories c ON c.id = s.category_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN areas a ON a.id = s.area_id
       WHERE s.id = $1`,
      [id]
    );
    const store = rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found.' });

    const [photos, products] = await Promise.all([
      db.query(`SELECT url FROM store_photos WHERE store_id = $1 ORDER BY sort_order`, [id]),
      db.query(
        `SELECT id, name, brand, price, availability FROM products WHERE store_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [id]
      ),
    ]);

    res.json({ store: { ...store, photos: photos.rows.map((p) => p.url), products: products.rows } });
  })
);

module.exports = router;
