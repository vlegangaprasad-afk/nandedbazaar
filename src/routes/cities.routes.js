const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/cities?state=Maharashtra
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { state } = req.query;
    const params = [];
    let where = '';
    if (state) {
      params.push(state);
      where = `WHERE st.name ILIKE $1`;
    }
    const { rows } = await db.query(
      `SELECT c.id, c.name, st.name AS state_name
       FROM cities c JOIN states st ON st.id = c.state_id
       ${where}
       ORDER BY c.name`,
      params
    );
    res.json({ cities: rows });
  })
);

module.exports = router;
