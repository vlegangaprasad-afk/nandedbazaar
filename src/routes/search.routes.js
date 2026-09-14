const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/search/suggest?q=elec — live type-ahead split by Store / Product / Service provider,
// per PRD §5 "Search intelligence".
router.get(
  '/suggest',
  asyncHandler(async (req, res) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ stores: [], products: [], providers: [] });
    const like = `%${q}%`;

    const [stores, products, providers] = await Promise.all([
      db.query(
        `SELECT id, name FROM stores WHERE status = 'approved' AND is_public = true AND name ILIKE $1 ORDER BY name LIMIT 5`,
        [like]
      ),
      db.query(`SELECT id, name FROM products WHERE name ILIKE $1 ORDER BY name LIMIT 5`, [like]),
      db.query(
        `SELECT id, business_name AS name FROM service_providers
         WHERE status = 'approved' AND is_public = true AND business_name ILIKE $1 ORDER BY business_name LIMIT 5`,
        [like]
      ),
    ]);

    res.json({ stores: stores.rows, products: products.rows, providers: providers.rows });
  })
);

module.exports = router;
