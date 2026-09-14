const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { generateOtp, sendOtpSms } = require('../utils/otp');
const { signToken } = require('../utils/jwt');
const { config } = require('../config');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });
  next();
}

// POST /api/auth/otp/request  { mobile, role }
// role is 'customer' | 'vendor' | 'provider' — admin accounts are seeded directly in the DB,
// never self-registered, per PRD §21's role-based access requirement.
router.post(
  '/otp/request',
  [
    body('mobile').trim().isLength({ min: 6, max: 20 }).withMessage('Enter a valid mobile number.'),
    body('role').isIn(['customer', 'vendor', 'provider']).withMessage('Invalid role.'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { mobile, role } = req.body;
    const otp = generateOtp(config.otpLength);
    const otpHash = await bcrypt.hash(otp, 8);
    const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

    await db.query(
      `INSERT INTO otp_requests (mobile, role, otp_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [mobile, role, otpHash, expiresAt]
    );

    await sendOtpSms(mobile, otp);

    // Convenience only: never leak the OTP in the response once a real SMS gateway is wired up.
    const devPayload = config.nodeEnv !== 'production' ? { dev_otp: otp } : {};
    res.json({ message: 'OTP sent.', expires_in_minutes: config.otpExpiryMinutes, ...devPayload });
  })
);

// POST /api/auth/otp/verify  { mobile, otp, role, name? }
// Creates the user record on first successful verification (mobile + role together decide
// whether they land as a customer, a vendor, or a service provider).
router.post(
  '/otp/verify',
  [
    body('mobile').trim().isLength({ min: 6, max: 20 }),
    body('otp').trim().isLength({ min: 4, max: 8 }),
    body('role').isIn(['customer', 'vendor', 'provider']),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { mobile, otp, role, name } = req.body;

    const { rows } = await db.query(
      `SELECT * FROM otp_requests
       WHERE mobile = $1 AND role = $2 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [mobile, role]
    );
    const record = rows[0];
    if (!record) {
      return res.status(400).json({ error: 'OTP expired or not requested. Please request a new one.' });
    }
    const valid = await bcrypt.compare(otp, record.otp_hash);
    if (!valid) return res.status(400).json({ error: 'Incorrect OTP.' });

    await db.query(`UPDATE otp_requests SET consumed_at = now() WHERE id = $1`, [record.id]);

    const { rows: userRows } = await db.query(`SELECT * FROM users WHERE mobile = $1`, [mobile]);
    let user = userRows[0];
    if (!user) {
      const inserted = await db.query(
        `INSERT INTO users (mobile, role, name) VALUES ($1, $2, $3) RETURNING *`,
        [mobile, role, name || null]
      );
      user = inserted.rows[0];
    }

    const token = signToken({ id: user.id, role: user.role, mobile: user.mobile });
    res.json({ token, user: { id: user.id, mobile: user.mobile, role: user.role, name: user.name } });
  })
);

module.exports = router;
