require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const { rows } = await db.query('SELECT count(*) FROM stores');
  if (Number(rows[0].count) > 0) {
    console.log('Database already has store data — skipping seed (use a fresh database to reseed).');
    await db.pool.end();
    return;
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.sql'), 'utf8');
  await db.query(sql);
  console.log('Seed data inserted.');
  await db.pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
