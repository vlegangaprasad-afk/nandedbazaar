const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');

// Everything below requires a logged-in vendor account. To actually register
// the store itself, see POST /api/vendors/register in registration.routes.js.
router.use(authRequired, requireRole('vendor'));

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });
  next();
}

async function getOwnStore(vendorUserId) {
  const { rows } = await db.query(`SELECT * FROM stores WHERE vendor_user_id = $1`, [vendorUserId]);
  return rows[0];
}

function requireStore(handler) {
  return asyncHandler(async (req, res) => {
    const store = await getOwnStore(req.user.id);
    if (!store) return res.status(404).json({ error: 'No store registered for this account yet.' });
    return handler(req, res, store);
  });
}

// GET /api/vendor/store — my store profile (PRD §13 dashboard "Profile editing")
router.get('/store', requireStore(async (req, res, store) => res.json({ store })));

// PUT /api/vendor/store
router.put(
  '/store',
  requireStore(async (req, res, store) => {
    const fields = [
      'name', 'description', 'category_id', 'city_id', 'area_id', 'address', 'pincode',
      'lat', 'lng', 'logo_url', 'website', 'opens_at', 'closes_at', 'weekly_holiday',
      'whatsapp', 'email', 'established_year', 'is_public',
    ];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (updates.length === 0) return res.json({ store });

    params.push(store.id);
    const { rows } = await db.query(
      `UPDATE stores SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ store: rows[0] });
  })
);

// GET /api/vendor/products — PRD §13 "Listings management"
router.get(
  '/products',
  requireStore(async (req, res, store) => {
    const { rows } = await db.query(`SELECT * FROM products WHERE store_id = $1 ORDER BY created_at DESC`, [store.id]);
    res.json({ products: rows });
  })
);

// POST /api/vendor/products
router.post(
  '/products',
  [body('name').trim().notEmpty().withMessage('Product name is required.')],
  validate,
  requireStore(async (req, res, store) => {
    const { name, category_id, brand, description, model_number, price, availability, tags } = req.body;
    const { rows } = await db.query(
      `INSERT INTO products (store_id, name, category_id, brand, description, model_number, price, availability, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        store.id,
        name,
        category_id || null,
        brand || null,
        description || null,
        model_number || null,
        price === '' || price === undefined ? null : price,
        availability || 'not_specified',
        tags || [],
      ]
    );
    res.status(201).json({ product: rows[0] });
  })
);

// PUT /api/vendor/products/:id
router.put(
  '/products/:id',
  requireStore(async (req, res, store) => {
    const fields = ['name', 'category_id', 'brand', 'description', 'model_number', 'price', 'availability', 'tags'];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    params.push(req.params.id, store.id);
    const { rows } = await db.query(
      `UPDATE products SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND store_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product: rows[0] });
  })
);

// DELETE /api/vendor/products/:id
router.delete(
  '/products/:id',
  requireStore(async (req, res, store) => {
    const { rows } = await db.query(`DELETE FROM products WHERE id = $1 AND store_id = $2 RETURNING id`, [
      req.params.id,
      store.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found.' });
    res.json({ ok: true });
  })
);

// GET /api/vendor/enquiries — PRD §13 "Enquiries inbox"
router.get(
  '/enquiries',
  requireStore(async (req, res, store) => {
    const { rows } = await db.query(
      `SELECT e.*, p.name AS product_name FROM enquiries e
       LEFT JOIN products p ON p.id = e.product_id
       WHERE e.store_id = $1 ORDER BY e.created_at DESC`,
      [store.id]
    );
    res.json({ enquiries: rows });
  })
);

// POST /api/vendor/enquiries/:id/reply
router.post(
  '/enquiries/:id/reply',
  requireStore(async (req, res, store) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(422).json({ error: 'Reply message is required.' });

    const { rows } = await db.query(
      `UPDATE enquiries SET reply_message = $1, status = 'replied', replied_at = now()
       WHERE id = $2 AND store_id = $3 RETURNING *`,
      [message, req.params.id, store.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Enquiry not found.' });
    res.json({ enquiry: rows[0] });
  })
);

// GET /api/vendor/overview?days=7 — dashboard KPI tiles (PRD §13 "Overview")
router.get(
  '/overview',
  requireStore(async (req, res, store) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [views, productViews, enquiries, calls, whatsapp, directions] = await Promise.all([
      db.query(`SELECT count(*) FROM view_events WHERE target_type='store' AND target_id=$1 AND created_at > $2`, [
        store.id,
        sinceDate,
      ]),
      db.query(
        `SELECT count(*) FROM view_events v JOIN products p ON p.id = v.target_id
         WHERE v.target_type='product' AND p.store_id=$1 AND v.created_at > $2`,
        [store.id, sinceDate]
      ),
      db.query(`SELECT count(*) FROM enquiries WHERE store_id=$1 AND created_at > $2`, [store.id, sinceDate]),
      db.query(
        `SELECT count(*) FROM interaction_events WHERE target_type='store' AND target_id=$1 AND event_type='call' AND created_at > $2`,
        [store.id, sinceDate]
      ),
      db.query(
        `SELECT count(*) FROM interaction_events WHERE target_type='store' AND target_id=$1 AND event_type='whatsapp' AND created_at > $2`,
        [store.id, sinceDate]
      ),
      db.query(
        `SELECT count(*) FROM interaction_events WHERE target_type='store' AND target_id=$1 AND event_type='direction' AND created_at > $2`,
        [store.id, sinceDate]
      ),
    ]);

    res.json({
      days,
      store_views: Number(views.rows[0].count),
      product_views: Number(productViews.rows[0].count),
      enquiries: Number(enquiries.rows[0].count),
      calls: Number(calls.rows[0].count),
      whatsapp_clicks: Number(whatsapp.rows[0].count),
      direction_requests: Number(directions.rows[0].count),
    });
  })
);

module.exports = router;
