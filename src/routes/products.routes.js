const router = require('express').Router();
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/products/search?q=&city=&category=&brand=  — PRD §5 "Product search"
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, city, category, brand } = req.query;
    const clauses = [`s.status = 'approved'`, `s.is_public = true`];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      clauses.push(`(p.name ILIKE $${params.length} OR p.brand ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (city) {
      params.push(city);
      clauses.push(`ci.name ILIKE $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`cat.name ILIKE $${params.length}`);
    }
    if (brand) {
      params.push(brand);
      clauses.push(`p.brand ILIKE $${params.length}`);
    }

    const { rows } = await db.query(
      `SELECT p.id, p.name, p.brand, p.price, p.availability, p.updated_at,
              s.id AS store_id, s.name AS store_name, s.lat, s.lng,
              ci.name AS city_name, cat.name AS category_name
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY p.is_featured DESC, p.created_at DESC
       LIMIT 100`,
      params
    );
    res.json({ products: rows });
  })
);

// GET /api/products/:id  — PRD §8, plus "also available near you" alternates
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid product id.' });

    const { rows } = await db.query(
      `SELECT p.*, s.name AS store_name, s.id AS store_id, s.lat, s.lng, s.whatsapp
       FROM products p JOIN stores s ON s.id = p.store_id
       WHERE p.id = $1`,
      [id]
    );
    const product = rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const [images, alternates] = await Promise.all([
      db.query(`SELECT url FROM product_images WHERE product_id = $1 ORDER BY sort_order`, [id]),
      db.query(
        `SELECT p2.id, p2.price, s2.id AS store_id, s2.name AS store_name, s2.lat, s2.lng
         FROM products p2 JOIN stores s2 ON s2.id = p2.store_id
         WHERE p2.name ILIKE $1 AND p2.id != $2 AND s2.status = 'approved' AND s2.is_public = true
         LIMIT 10`,
        [product.name, id]
      ),
    ]);

    await db.query(`UPDATE products SET view_count = view_count + 1 WHERE id = $1`, [id]);

    res.json({
      product: { ...product, images: images.rows.map((i) => i.url) },
      alternates: alternates.rows,
    });
  })
);

module.exports = router;
