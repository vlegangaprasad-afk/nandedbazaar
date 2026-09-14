const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const VALID_VIEW_TARGETS = ['store', 'provider', 'product', 'service'];
const VALID_INTERACTION_TARGETS = ['store', 'provider'];
const VALID_EVENTS = ['call', 'whatsapp', 'direction'];

// POST /api/track/view  { target_type, target_id }
// Fired by the frontend when a store/provider/product/service page is opened.
// Feeds the vendor/provider dashboard's view-count KPIs (PRD §13, §14).
router.post(
  '/view',
  asyncHandler(async (req, res) => {
    const { target_type, target_id } = req.body;
    const id = parseInt(target_id, 10);
    if (!VALID_VIEW_TARGETS.includes(target_type) || !id) {
      return res.status(422).json({ error: 'Invalid target_type or target_id.' });
    }
    await db.query(`INSERT INTO view_events (target_type, target_id) VALUES ($1, $2)`, [target_type, id]);
    res.status(201).json({ ok: true });
  })
);

// POST /api/track/interaction  { target_type: 'store'|'provider', target_id, event_type: 'call'|'whatsapp'|'direction' }
// Fired when a customer taps Call / WhatsApp / Get Directions on a store or provider page.
router.post(
  '/interaction',
  asyncHandler(async (req, res) => {
    const { target_type, target_id, event_type } = req.body;
    const id = parseInt(target_id, 10);
    if (!VALID_INTERACTION_TARGETS.includes(target_type) || !VALID_EVENTS.includes(event_type) || !id) {
      return res.status(422).json({ error: 'Invalid target_type, target_id, or event_type.' });
    }
    await db.query(
      `INSERT INTO interaction_events (target_type, target_id, event_type) VALUES ($1, $2, $3)`,
      [target_type, id, event_type]
    );
    res.status(201).json({ ok: true });
  })
);

module.exports = router;
