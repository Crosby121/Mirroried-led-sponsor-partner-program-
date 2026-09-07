const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function main() {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of files) {
      const done = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [file]);
      if (done.rowCount) continue;
      let sql = fs.readFileSync(path.join(dir, file), 'utf8');
      sql = sql.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
      console.log(`Applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log('Database migrations complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
