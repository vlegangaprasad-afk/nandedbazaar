const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/areas?city_id=1
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cityId = parseInt(req.query.city_id, 10);
    if (!cityId) return res.status(400).json({ error: 'city_id is required.' });
    const { rows } = await db.query(`SELECT id, name FROM areas WHERE city_id = $1 ORDER BY name`, [cityId]);
    res.json({ areas: rows });
  })
);

module.exports = router;
