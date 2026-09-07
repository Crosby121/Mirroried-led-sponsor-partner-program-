const pool = require('./pool');
const { randomId, hashPassword } = require('../lib/security');

async function main() {
  const name = String(process.env.ADVERTISER_NAME || '').trim();
  const email = String(process.env.ADVERTISER_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADVERTISER_PASSWORD || '');
  const contact = String(process.env.ADVERTISER_CONTACT || '').trim() || null;
  const phone = String(process.env.ADVERTISER_PHONE || '').trim() || null;
  const billingEmail = String(process.env.ADVERTISER_BILLING_EMAIL || email).trim().toLowerCase() || null;
  const role = String(process.env.ADVERTISER_ROLE || 'advertiser_approver').trim();

  if (!name || !email || password.length < 10) {
    throw new Error('ADVERTISER_NAME, ADVERTISER_EMAIL and ADVERTISER_PASSWORD (10+ characters) are required.');
  }
  if (!['advertiser_viewer', 'advertiser_approver'].includes(role)) {
    throw new Error('ADVERTISER_ROLE must be advertiser_viewer or advertiser_approver.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const advertiserId = process.env.ADVERTISER_ID || randomId('adv');
    const userId = randomId('usr');
    const { salt, hash } = hashPassword(password);

    await client.query(
      `INSERT INTO advertisers(id,name,primary_contact,email,phone,billing_email,status)
       VALUES($1,$2,$3,$4,$5,$6,'active')`,
      [advertiserId, name, contact, email, phone, billingEmail]
    );
    await client.query(
      `INSERT INTO users(id,email,name,role,advertiser_id,salt,password_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [userId, email, contact || name, role, advertiserId, salt, hash]
    );

    await client.query('COMMIT');
    console.log(`Advertiser created: ${advertiserId}`);
    console.log(`Advertising portal user: ${email}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
