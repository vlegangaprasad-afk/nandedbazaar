const { verifyToken } = require('../utils/jwt');

function getToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Blocks the request unless a valid bearer token is present.
function authRequired(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

// Attaches req.user when a valid token is present, but never blocks the request.
// Used on endpoints (like posting an enquiry) that work for logged-out visitors too.
function optionalAuth(req, res, next) {
  const token = getToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (e) {
      // ignore invalid/expired token — request proceeds as anonymous
    }
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this.' });
    }
    next();
  };
}

module.exports = { authRequired, optionalAuth, requireRole };
