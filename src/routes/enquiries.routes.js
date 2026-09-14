const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { optionalAuth } = require('../middleware/auth');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });
  next();
}

// POST /api/enquiries  — PRD §10 "Enquiry Flow". Works for a logged-out customer too
// (optionalAuth), since search and enquiry never require login per PRD §15.
router.post(
  '/',
  optionalAuth,
  [
    body('customer_name').trim().notEmpty().withMessage('Name is required.'),
    body('customer_mobile').trim().isLength({ min: 6, max: 20 }).withMessage('Enter a valid mobile number.'),
    body('message').trim().notEmpty().withMessage('Message is required.'),
    body('preferred_contact').optional().isIn(['call', 'whatsapp', 'either']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const {
      store_id,
      provider_id,
      product_id,
      service_id,
      customer_name,
      customer_mobile,
      message,
      preferred_contact,
    } = req.body;

    if (!store_id && !provider_id) {
      return res.status(422).json({ error: 'An enquiry needs either a store or a service provider.' });
    }
    if (store_id && provider_id) {
      return res.status(422).json({ error: 'An enquiry can target only one of store or provider, not both.' });
    }
    const targetType = store_id ? 'store' : 'provider';

    const { rows } = await db.query(
      `INSERT INTO enquiries
        (customer_user_id, customer_name, customer_mobile, target_type, store_id, provider_id, product_id, service_id, message, preferred_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.user ? req.user.id : null,
        customer_name,
        customer_mobile,
        targetType,
        store_id || null,
        provider_id || null,
        product_id || null,
        service_id || null,
        message,
        preferred_contact || 'either',
      ]
    );
    res.status(201).json({ enquiry: rows[0] });
  })
);

// POST /api/enquiries/:id/report  — spam/abuse flag surfaced to admin moderation (PRD §14)
router.post(
  '/:id/report',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid enquiry id.' });
    const { reason } = req.body;
    const { rows } = await db.query(
      `UPDATE enquiries SET reported = true, report_reason = $2 WHERE id = $1 RETURNING id`,
      [id, reason || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Enquiry not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;
