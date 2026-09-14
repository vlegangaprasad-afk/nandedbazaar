const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');

// Everything below requires a logged-in service-provider account. To create the
// profile itself, see POST /api/providers/register in registration.routes.js.
router.use(authRequired, requireRole('provider'));

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });
  next();
}

async function getOwnProvider(providerUserId) {
  const { rows } = await db.query(`SELECT * FROM service_providers WHERE provider_user_id = $1`, [providerUserId]);
  return rows[0];
}

function requireProvider(handler) {
  return asyncHandler(async (req, res) => {
    const provider = await getOwnProvider(req.user.id);
    if (!provider) return res.status(404).json({ error: 'No service provider profile for this account yet.' });
    return handler(req, res, provider);
  });
}

// GET /api/provider/profile — PRD §13 dashboard "Profile editing (provider profile + coverage areas)"
router.get(
  '/profile',
  requireProvider(async (req, res, provider) => {
    const areas = await db.query(
      `SELECT a.id, a.name FROM service_provider_areas spa JOIN areas a ON a.id = spa.area_id WHERE spa.provider_id = $1 ORDER BY a.name`,
      [provider.id]
    );
    res.json({ provider: { ...provider, coverage_areas: areas.rows } });
  })
);

// PUT /api/provider/profile — also accepts coverage_area_ids: [1,2,3] to replace coverage
router.put(
  '/profile',
  requireProvider(async (req, res, provider) => {
    const fields = [
      'business_name', 'is_individual', 'bio', 'years_experience', 'service_category_id', 'city_id',
      'home_visit', 'at_location', 'working_hours', 'weekly_holiday', 'languages', 'website', 'is_public',
    ];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (updates.length > 0) {
      params.push(provider.id);
      await db.query(`UPDATE service_providers SET ${updates.join(', ')}, updated_at = now() WHERE id = $${params.length}`, params);
    }

    if (Array.isArray(req.body.coverage_area_ids)) {
      await db.query(`DELETE FROM service_provider_areas WHERE provider_id = $1`, [provider.id]);
      for (const areaId of req.body.coverage_area_ids) {
        await db.query(`INSERT INTO service_provider_areas (provider_id, area_id) VALUES ($1, $2)`, [provider.id, areaId]);
      }
    }

    const { rows } = await db.query(`SELECT * FROM service_providers WHERE id = $1`, [provider.id]);
    res.json({ provider: rows[0] });
  })
);

// GET /api/provider/services — PRD §13 "Listings management" (service-side)
router.get(
  '/services',
  requireProvider(async (req, res, provider) => {
    const { rows } = await db.query(`SELECT * FROM services WHERE provider_id = $1 ORDER BY created_at DESC`, [provider.id]);
    res.json({ services: rows });
  })
);

// POST /api/provider/services
router.post(
  '/services',
  [body('name').trim().notEmpty().withMessage('Service name is required.')],
  validate,
  requireProvider(async (req, res, provider) => {
    const { name, description, rate_type, rate_amount, service_category_id, tags } = req.body;
    const { rows } = await db.query(
      `INSERT INTO services (provider_id, name, description, rate_type, rate_amount, service_category_id, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        provider.id,
        name,
        description || null,
        rate_type || 'rate_shared',
        rate_amount === '' || rate_amount === undefined ? null : rate_amount,
        service_category_id || null,
        tags || [],
      ]
    );
    res.status(201).json({ service: rows[0] });
  })
);

// PUT /api/provider/services/:id
router.put(
  '/services/:id',
  requireProvider(async (req, res, provider) => {
    const fields = ['name', 'description', 'rate_type', 'rate_amount', 'service_category_id', 'tags'];
    const updates = [];
    const params = [];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    params.push(req.params.id, provider.id);
    const { rows } = await db.query(
      `UPDATE services SET ${updates.join(', ')}, updated_at = now()
       WHERE id = $${params.length - 1} AND provider_id = $${params.length} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Service not found.' });
    res.json({ service: rows[0] });
  })
);

// DELETE /api/provider/services/:id
router.delete(
  '/services/:id',
  requireProvider(async (req, res, provider) => {
    const { rows } = await db.query(`DELETE FROM services WHERE id = $1 AND provider_id = $2 RETURNING id`, [
      req.params.id,
      provider.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Service not found.' });
    res.json({ ok: true });
  })
);

// GET /api/provider/enquiries
router.get(
  '/enquiries',
  requireProvider(async (req, res, provider) => {
    const { rows } = await db.query(
      `SELECT e.*, sv.name AS service_name FROM enquiries e
       LEFT JOIN services sv ON sv.id = e.service_id
       WHERE e.provider_id = $1 ORDER BY e.created_at DESC`,
      [provider.id]
    );
    res.json({ enquiries: rows });
  })
);

// POST /api/provider/enquiries/:id/reply
router.post(
  '/enquiries/:id/reply',
  requireProvider(async (req, res, provider) => {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(422).json({ error: 'Reply message is required.' });

    const { rows } = await db.query(
      `UPDATE enquiries SET reply_message = $1, status = 'replied', replied_at = now()
       WHERE id = $2 AND provider_id = $3 RETURNING *`,
      [message, req.params.id, provider.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Enquiry not found.' });
    res.json({ enquiry: rows[0] });
  })
);

// GET /api/provider/overview?days=7
router.get(
  '/overview',
  requireProvider(async (req, res, provider) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [views, serviceViews, enquiries, calls, whatsapp] = await Promise.all([
      db.query(`SELECT count(*) FROM view_events WHERE target_type='provider' AND target_id=$1 AND created_at > $2`, [
        provider.id,
        sinceDate,
      ]),
      db.query(
        `SELECT count(*) FROM view_events v JOIN services sv ON sv.id = v.target_id
         WHERE v.target_type='service' AND sv.provider_id=$1 AND v.created_at > $2`,
        [provider.id, sinceDate]
      ),
      db.query(`SELECT count(*) FROM enquiries WHERE provider_id=$1 AND created_at > $2`, [provider.id, sinceDate]),
      db.query(
        `SELECT count(*) FROM interaction_events WHERE target_type='provider' AND target_id=$1 AND event_type='call' AND created_at > $2`,
        [provider.id, sinceDate]
      ),
      db.query(
        `SELECT count(*) FROM interaction_events WHERE target_type='provider' AND target_id=$1 AND event_type='whatsapp' AND created_at > $2`,
        [provider.id, sinceDate]
      ),
    ]);

    res.json({
      days,
      profile_views: Number(views.rows[0].count),
      service_views: Number(serviceViews.rows[0].count),
      enquiries: Number(enquiries.rows[0].count),
      calls: Number(calls.rows[0].count),
      whatsapp_clicks: Number(whatsapp.rows[0].count),
      direction_requests: 0,
    });
  })
);

module.exports = router;
