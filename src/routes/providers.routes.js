const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// NOTE: base_lat/base_lng are intentionally never included in these SELECTs — a service
// provider's home/base location must stay internal-only per PRD §3 and §13; only the
// computed distance_km and the named coverage areas are public.
const PROVIDER_SUMMARY_COLUMNS = `
  sp.id, sp.business_name, sp.is_individual, sp.bio, sp.years_experience,
  sp.home_visit, sp.at_location, sp.working_hours, sp.weekly_holiday,
  sp.languages, sp.website, sp.is_verified, sp.is_featured,
  scat.name AS service_category_name, sp.city_id, ci.name AS city_name, sp.created_at
`;

async function withCoverage(rows) {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return rows;
  const { rows: areaRows } = await db.query(
    `SELECT spa.provider_id, a.name AS area_name
     FROM service_provider_areas spa JOIN areas a ON a.id = spa.area_id
     WHERE spa.provider_id = ANY($1::int[])
     ORDER BY a.name`,
    [ids]
  );
  const byProvider = {};
  areaRows.forEach((r) => {
    byProvider[r.provider_id] = byProvider[r.provider_id] || [];
    byProvider[r.provider_id].push(r.area_name);
  });
  return rows.map((r) => ({ ...r, coverage_areas: byProvider[r.id] || [] }));
}

// GET /api/providers/nearby?lat=&lng=&limit=  — distance estimated from the provider's
// (private) base location, per PRD §12.
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
      `SELECT ${PROVIDER_SUMMARY_COLUMNS},
        (6371 * acos(
          LEAST(1, GREATEST(-1,
            cos(radians($1)) * cos(radians(sp.base_lat)) * cos(radians(sp.base_lng) - radians($2))
            + sin(radians($1)) * sin(radians(sp.base_lat))
          ))
        )) AS distance_km
       FROM service_providers sp
       LEFT JOIN service_categories scat ON scat.id = sp.service_category_id
       LEFT JOIN cities ci ON ci.id = sp.city_id
       WHERE sp.status = 'approved' AND sp.is_public = true AND sp.base_lat IS NOT NULL AND sp.base_lng IS NOT NULL
       ORDER BY distance_km ASC
       LIMIT $3`,
      [lat, lng, limit]
    );
    res.json({ providers: await withCoverage(rows) });
  })
);

// GET /api/providers?city=&category=&area=&home_visit=true&verified=true&min_experience=2
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { city, category, area, home_visit, verified, min_experience } = req.query;
    const clauses = [`sp.status = 'approved'`, `sp.is_public = true`];
    const params = [];

    if (city) {
      params.push(city);
      clauses.push(`ci.name ILIKE $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`scat.name ILIKE $${params.length}`);
    }
    if (home_visit === 'true') clauses.push(`sp.home_visit = true`);
    if (verified === 'true') clauses.push(`sp.is_verified = true`);
    if (min_experience) {
      params.push(Number(min_experience));
      clauses.push(`sp.years_experience >= $${params.length}`);
    }

    let areaJoin = '';
    if (area) {
      params.push(area);
      areaJoin = `JOIN service_provider_areas spa2 ON spa2.provider_id = sp.id
                  JOIN areas a2 ON a2.id = spa2.area_id AND a2.name ILIKE $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT DISTINCT ${PROVIDER_SUMMARY_COLUMNS}
       FROM service_providers sp
       LEFT JOIN service_categories scat ON scat.id = sp.service_category_id
       LEFT JOIN cities ci ON ci.id = sp.city_id
       ${areaJoin}
       WHERE ${clauses.join(' AND ')}
       ORDER BY sp.is_featured DESC, sp.created_at DESC
       LIMIT 100`,
      params
    );
    res.json({ providers: await withCoverage(rows) });
  })
);

// GET /api/providers/:id  — PRD §7 "Service Provider Profile Page"
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid provider id.' });

    const { rows } = await db.query(
      `SELECT ${PROVIDER_SUMMARY_COLUMNS}
       FROM service_providers sp
       LEFT JOIN service_categories scat ON scat.id = sp.service_category_id
       LEFT JOIN cities ci ON ci.id = sp.city_id
       WHERE sp.id = $1`,
      [id]
    );
    const provider = rows[0];
    if (!provider) return res.status(404).json({ error: 'Service provider not found.' });

    const services = await db.query(
      `SELECT id, name, description, rate_type, rate_amount FROM services WHERE provider_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    const [withCov] = await withCoverage([provider]);

    res.json({ provider: { ...withCov, services: services.rows } });
  })
);

module.exports = router;
