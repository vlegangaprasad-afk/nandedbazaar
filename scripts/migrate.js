require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Schema created/updated.');
  await db.pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
