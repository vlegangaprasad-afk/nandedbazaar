const { Pool } = require('pg');
const { config } = require('./config');

// Hosted Postgres providers (Supabase, Render, etc.) require TLS and use
// certificates that aren't in Node's default trust store — skip local
// connections (no host or "localhost") since those don't need it.
const needsSsl = !/localhost|127\.0\.0\.1/.test(config.databaseUrl);

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // A lost idle connection shouldn't be silently swallowed.
  console.error('Unexpected error on idle PostgreSQL client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
