const pool = require('./pool');
const { randomId, hashPassword } = require('../lib/security');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.ADMIN_NAME || 'Mirroried LED Administrator').trim();

  if (!email || password.length < 14) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD (minimum 14 characters) are required.');
  }

  const existing = await pool.query('SELECT id, email, role FROM users WHERE lower(email)=lower($1)', [email]);
  if (existing.rowCount) {
    console.log(`Administrator already exists: ${existing.rows[0].email}`);
    return;
  }

  const { salt, hash } = hashPassword(password);
  await pool.query(
    `INSERT INTO users(id,email,name,role,sponsor_id,salt,password_hash)
     VALUES($1,$2,$3,'admin',NULL,$4,$5)`,
    [randomId('usr'), email, name, salt, hash]
  );
  console.log(`Created production administrator: ${email}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
