const pool = require('./pool');
const { randomId } = require('../lib/security');

async function main() {
  const name = String(process.env.SPONSOR_NAME || '').trim();
  const id = String(process.env.SPONSOR_ID || randomId('spn')).trim();
  const contact = String(process.env.SPONSOR_CONTACT || '').trim() || null;
  const email = String(process.env.SPONSOR_EMAIL || '').trim().toLowerCase() || null;
  const category = String(process.env.SPONSOR_CATEGORY || '').trim() || null;

  if (!name) throw new Error('SPONSOR_NAME is required.');

  const existing = await pool.query('SELECT id,name FROM sponsors WHERE id=$1', [id]);
  if (existing.rowCount) throw new Error(`Sponsor ID already exists: ${id}`);

  await pool.query(
    `INSERT INTO sponsors(id,name,status,primary_contact,email,category)
     VALUES($1,$2,'active',$3,$4,$5)`,
    [id, name, contact, email, category]
  );
  console.log(`Created sponsor ${name}`);
  console.log(`Sponsor ID: ${id}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
