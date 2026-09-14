const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/services/search?q=&city=&category=&home_visit=true  — PRD §5 "Service provider search"
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, city, category, home_visit } = req.query;
    const clauses = [`sp.status = 'approved'`, `sp.is_public = true`];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(sv.name ILIKE $${params.length} OR sv.description ILIKE $${params.length})`);
    }
    if (city) {
      params.push(city);
      clauses.push(`ci.name ILIKE $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`scat.name ILIKE $${params.length}`);
    }
    if (home_visit === 'true') clauses.push(`sp.home_visit = true`);

    const { rows } = await db.query(
      `SELECT sv.id, sv.name, sv.description, sv.rate_type, sv.rate_amount,
              sp.id AS provider_id, sp.business_name, sp.years_experience, sp.home_visit, sp.at_location,
              ci.name AS city_name, scat.name AS service_category_name
       FROM services sv
       JOIN service_providers sp ON sp.id = sv.provider_id
       LEFT JOIN cities ci ON ci.id = sp.city_id
       LEFT JOIN service_categories scat ON scat.id = sp.service_category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY sv.created_at DESC
       LIMIT 100`,
      params
    );
    res.json({ services: rows });
  })
);

module.exports = router;
