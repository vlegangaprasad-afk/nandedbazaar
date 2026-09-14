const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/service-categories — local-service categories (electrician, plumber, ...)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, icon, sort_order FROM service_categories ORDER BY sort_order, name`
    );
    res.json({ service_categories: rows });
  })
);

module.exports = router;
