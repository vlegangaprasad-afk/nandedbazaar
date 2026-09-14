const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { authRequired } = require('../middleware/auth');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — PRD §21 calls for file-upload validation
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG or WEBP images are allowed.'));
    }
    cb(null, true);
  },
});

// POST /api/uploads/image — for store logos/photos, product images, provider work photos.
// Stores locally under /uploads for this MVP; swap the storage engine for S3/Cloud Storage
// before relying on this in production (local disk won't survive a redeploy).
router.post('/image', authRequired, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

module.exports = router;
