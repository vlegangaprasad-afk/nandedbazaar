const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { config } = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: config.allowedOrigins === '*' ? '*' : config.allowedOrigins.split(',').map((s) => s.trim()),
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// Coarse global rate limit — tighten further per-route (especially OTP request/verify
// and enquiry submission) before this goes anywhere near production traffic.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'localmart-backend' }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
