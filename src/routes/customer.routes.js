const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');

// PRD §15 "Customer Account (Optional)" — everything here needs a logged-in customer,
// but note search/enquiry themselves never require login (see enquiries.routes.js).
router.use(authRequired, requireRole('customer'));

// GET /api/customer/me
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT id, mobile, name, email, city_id, created_at FROM users WHERE id = $1`, [
      req.user.id,
    ]);
    res.json({ user: rows[0] });
  })
);

// PUT /api/customer/me
router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const { name, email, city_id } = req.body;
    const { rows } = await db.query(
      `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), city_id = COALESCE($3, city_id)
       WHERE id = $4 RETURNING id, mobile, name, email, city_id`,
      [name, email, city_id, req.user.id]
    );
    res.json({ user: rows[0] });
  })
);

// GET /api/customer/favorites — "My Saved Stores & Providers"
router.get(
  '/favorites',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT f.id, f.target_type, f.store_id, f.provider_id, f.created_at,
              s.name AS store_name, sp.business_name AS provider_name
       FROM favorites f
       LEFT JOIN stores s ON s.id = f.store_id
       LEFT JOIN service_providers sp ON sp.id = f.provider_id
       WHERE f.customer_user_id = $1 ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ favorites: rows });
  })
);

// POST /api/customer/favorites  { target_type: 'store'|'provider', store_id?, provider_id? }
router.post(
  '/favorites',
  asyncHandler(async (req, res) => {
    const { target_type } = req.body;
    if (!['store', 'provider'].includes(target_type)) {
      return res.status(422).json({ error: 'target_type must be store or provider.' });
    }
    const targetId = parseInt(target_type === 'store' ? req.body.store_id : req.body.provider_id, 10);
    if (!targetId) return res.status(422).json({ error: `${target_type}_id is required.` });

    try {
      const { rows } = await db.query(
        `INSERT INTO favorites (customer_user_id, target_type, store_id, provider_id) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.user.id, target_type, target_type === 'store' ? targetId : null, target_type === 'provider' ? targetId : null]
      );
      res.status(201).json({ favorite: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        // Already saved — return the existing row instead of erroring.
        const column = target_type === 'store' ? 'store_id' : 'provider_id';
        const existing = await db.query(
          `SELECT * FROM favorites WHERE customer_user_id = $1 AND target_type = $2 AND ${column} = $3`,
          [req.user.id, target_type, targetId]
        );
        return res.status(200).json({ favorite: existing.rows[0] });
      }
      throw err;
    }
  })
);

// DELETE /api/customer/favorites/:id — "unfollow" toggle on the customer account page
router.delete(
  '/favorites/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(`DELETE FROM favorites WHERE id = $1 AND customer_user_id = $2 RETURNING id`, [
      req.params.id,
      req.user.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Favorite not found.' });
    res.json({ ok: true });
  })
);

// GET /api/customer/enquiries — "My enquiries" tab, with vendor/provider replies
router.get(
  '/enquiries',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT e.*, s.name AS store_name, sp.business_name AS provider_name
       FROM enquiries e
       LEFT JOIN stores s ON s.id = e.store_id
       LEFT JOIN service_providers sp ON sp.id = e.provider_id
       WHERE e.customer_user_id = $1 ORDER BY e.created_at DESC`,
      [req.user.id]
    );
    res.json({ enquiries: rows });
  })
);

module.exports = router;
