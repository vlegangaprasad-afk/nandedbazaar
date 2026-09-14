require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/localmart',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  nodeEnv: process.env.NODE_ENV || 'development',
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 5),
  otpLength: 6,
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
};

module.exports = { config };
