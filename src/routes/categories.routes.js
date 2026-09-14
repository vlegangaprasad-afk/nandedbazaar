const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/categories — product/store categories (PRD §4's quick-category grid)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(`SELECT id, name, icon, sort_order FROM categories ORDER BY sort_order, name`);
    res.json({ categories: rows });
  })
);

module.exports = router;
