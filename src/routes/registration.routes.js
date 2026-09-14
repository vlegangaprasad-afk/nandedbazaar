const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });
  next();
}

// POST /api/vendors/register  — PRD §13 "Store registration". Requires an already-created
// vendor-role account (via /api/auth/otp/verify with role=vendor) so a store is always
// tied to a real logged-in owner.
router.post(
  '/vendors/register',
  authRequired,
  requireRole('vendor'),
  [
    body('name').trim().notEmpty().withMessage('Store name is required.'),
    body('category_id').isInt().withMessage('Category is required.'),
    body('city_id').isInt().withMessage('City is required.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const existing = await db.query(`SELECT id FROM stores WHERE vendor_user_id = $1`, [req.user.id]);
    if (existing.rows[0]) return res.status(409).json({ error: 'A store is already registered for this account.' });

    const {
      name,
      owner_name,
      whatsapp,
      email,
      category_id,
      description,
      city_id,
      area_id,
      address,
      pincode,
      lat,
      lng,
      logo_url,
      website,
      opens_at,
      closes_at,
      weekly_holiday,
      established_year,
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO stores
        (vendor_user_id, name, owner_name, whatsapp, email, category_id, description,
         city_id, area_id, address, pincode, lat, lng, logo_url, website,
         opens_at, closes_at, weekly_holiday, established_year, status, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'pending', true)
       RETURNING *`,
      [
        req.user.id,
        name,
        owner_name || null,
        whatsapp || null,
        email || null,
        category_id,
        description || null,
        city_id,
        area_id || null,
        address || null,
        pincode || null,
        lat || null,
        lng || null,
        logo_url || null,
        website || null,
        opens_at || null,
        closes_at || null,
        weekly_holiday || null,
        established_year || null,
      ]
    );
    res.status(201).json({ store: rows[0], note: 'Submitted — visible publicly once an admin approves it.' });
  })
);

// POST /api/providers/register  — PRD §13 "Service provider registration"
router.post(
  '/providers/register',
  authRequired,
  requireRole('provider'),
  [
    body('business_name').trim().notEmpty().withMessage('Provider/business name is required.'),
    body('service_category_id').isInt().withMessage('Service category is required.'),
    body('city_id').isInt().withMessage('City is required.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const existing = await db.query(`SELECT id FROM service_providers WHERE provider_user_id = $1`, [req.user.id]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'A service provider profile already exists for this account.' });
    }

    const {
      business_name,
      is_individual,
      service_category_id,
      description,
      bio,
      years_experience,
      city_id,
      base_lat,
      base_lng,
      home_visit,
      at_location,
      working_hours,
      weekly_holiday,
      languages,
      website,
      coverage_area_ids,
    } = req.body;

    const { rows } = await db.query(
      `INSERT INTO service_providers
        (provider_user_id, business_name, is_individual, service_category_id, bio,
         years_experience, city_id, base_lat, base_lng, home_visit, at_location,
         working_hours, weekly_holiday, languages, website, status, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending', true)
       RETURNING *`,
      [
        req.user.id,
        business_name,
        is_individual !== false,
        service_category_id,
        bio || description || null,
        years_experience || 0,
        city_id,
        base_lat || null,
        base_lng || null,
        home_visit !== false,
        at_location === true,
        working_hours || null,
        weekly_holiday || null,
        languages || [],
        website || null,
      ]
    );
    const provider = rows[0];

    if (Array.isArray(coverage_area_ids) && coverage_area_ids.length > 0) {
      for (const areaId of coverage_area_ids) {
        await db.query(`INSERT INTO service_provider_areas (provider_id, area_id) VALUES ($1, $2)`, [
          provider.id,
          areaId,
        ]);
      }
    }

    res.status(201).json({ provider, note: 'Submitted — visible publicly once an admin approves it.' });
  })
);

module.exports = router;
