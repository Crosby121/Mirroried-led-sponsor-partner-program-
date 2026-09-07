const pool = require('./db/pool');
const { randomId, hashToken } = require('./lib/security');

const expressPath = require.resolve('express');
const currentExpress = require('express');
const STAFF = new Set(['sales', 'operations', 'admin']);
const SPONSOR_ROLES = new Set(['sponsor_viewer', 'sponsor_approver']);
const ADVERTISER_ROLES = new Set(['advertiser_viewer', 'advertiser_approver']);
const CONTRIBUTION_TYPES = new Set(['product','equipment','material','service','other']);

function cookieMap(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function commerceAuth(req, res, next) {
  try {
    const token = cookieMap(req).mirroried_session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const result = await pool.query(
      `SELECT u.id,u.email,u.name,u.role,u.sponsor_id,u.advertiser_id
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,
      [hashToken(token)]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Session expired or invalid' });
    const row = result.rows[0];
    req.commerceUser = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      sponsorId: row.sponsor_id || null,
      advertiserId: row.advertiser_id || null,
    };
    next();
  } catch (error) { next(error); }
}

function staffOnly(req, res, next) {
  if (!STAFF.has(req.commerceUser.role)) return res.status(403).json({ error: 'Staff access required' });
  next();
}
function sponsorRead(req, res, next) {
  if (!STAFF.has(req.commerceUser.role) && !SPONSOR_ROLES.has(req.commerceUser.role)) return res.status(403).json({ error: 'Sponsor Partner access required' });
  next();
}
function sponsorWrite(req, res, next) {
  if (!STAFF.has(req.commerceUser.role) && req.commerceUser.role !== 'sponsor_approver') return res.status(403).json({ error: 'Sponsor Partner approver access required' });
  next();
}
function advertiserOnly(req, res, next) {
  if (!ADVERTISER_ROLES.has(req.commerceUser.role) || !req.commerceUser.advertiserId) return res.status(403).json({ error: 'Advertiser account required' });
  next();
}
function advertiserApprover(req, res, next) {
  if (req.commerceUser.role !== 'advertiser_approver') return res.status(403).json({ error: 'Advertiser approver access required' });
  next();
}

async function audit(client, user, action, entityType, entityId, details = {}) {
  await client.query(
    `INSERT INTO audit_log(id,actor_id,actor_role,action,entity_type,entity_id,details)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomId('aud'), user.id, user.role, action, entityType, entityId, JSON.stringify(details)]
  );
}

function sponsorIdFor(req) {
  if (STAFF.has(req.commerceUser.role)) return String(req.query.sponsorId || req.body?.sponsorId || '').trim() || null;
  return req.commerceUser.sponsorId;
}

function installCommerceRoutes(app) {
  if (app.__mirroriedCommerceRoutesInstalled) return;
  app.__mirroriedCommerceRoutesInstalled = true;

  // ---------------------------------------------------------------------------
  // Sponsor Partner Program — contribution value and placement ledger
  // ---------------------------------------------------------------------------
  app.get('/api/commerce/sponsor/accounts', commerceAuth, staffOnly, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT id,name,status,primary_contact AS "primaryContact",email,category FROM sponsors ORDER BY name`);
      res.json({ items: result.rows });
    } catch (error) { next(error); }
  });

  app.get('/api/commerce/sponsor/contributions', commerceAuth, sponsorRead, async (req, res, next) => {
    try {
      const sponsorId = sponsorIdFor(req);
      const params = [];
      const where = sponsorId ? 'WHERE c.sponsor_id=$1' : '';
      if (sponsorId) params.push(sponsorId);
      const result = await pool.query(
        `SELECT c.id,c.sponsor_id AS "sponsorId",s.name AS "sponsorName",c.contribution_type AS "contributionType",
                c.description,c.offered_value AS "offeredValue",c.accepted_value AS "acceptedValue",c.status,
                c.received_at AS "receivedAt",c.notes,c.approved_at AS "approvedAt",
                COALESCE((SELECT sum(sp.agreed_value) FROM sponsor_placements sp
                          WHERE sp.contribution_id=c.id AND sp.status<>'cancelled'),0) AS "allocatedValue",
                GREATEST(c.accepted_value-COALESCE((SELECT sum(sp.agreed_value) FROM sponsor_placements sp
                          WHERE sp.contribution_id=c.id AND sp.status<>'cancelled'),0),0) AS "remainingValue",
                c.created_at AS "createdAt"
         FROM sponsor_contributions c JOIN sponsors s ON s.id=c.sponsor_id
         ${where}
         ORDER BY c.created_at DESC`,
        params
      );
      res.json({ items: result.rows });
    } catch (error) { next(error); }
  });

  app.post('/api/commerce/sponsor/contributions', commerceAuth, sponsorWrite, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const sponsorId = sponsorIdFor(req);
      const contributionType = String(req.body.contributionType || 'other');
      const description = String(req.body.description || '').trim();
      const offeredValue = Number(req.body.offeredValue || 0);
      if (!sponsorId || !CONTRIBUTION_TYPES.has(contributionType) || !description || !Number.isFinite(offeredValue) || offeredValue <= 0) {
        return res.status(400).json({ error: 'Sponsor, contribution type, description and offered value greater than zero are required' });
      }
      const sponsor = await client.query('SELECT id FROM sponsors WHERE id=$1', [sponsorId]);
      if (!sponsor.rowCount) return res.status(404).json({ error: 'Sponsor Partner account not found' });
      const id = randomId('con');
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO sponsor_contributions(id,sponsor_id,contribution_type,description,offered_value,accepted_value,status,notes)
         VALUES($1,$2,$3,$4,$5,0,'offered',$6)
         RETURNING id,sponsor_id AS "sponsorId",contribution_type AS "contributionType",description,
                   offered_value AS "offeredValue",accepted_value AS "acceptedValue",status,notes,created_at AS "createdAt"`,
        [id, sponsorId, contributionType, description, offeredValue, String(req.body.notes || '')]
      );
      await audit(client, req.commerceUser, 'offer', 'sponsor_contribution', id, { sponsorId, offeredValue });
      await client.query('COMMIT');
      res.status(201).json({ item: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
  });

  app.patch('/api/commerce/sponsor/contributions/:id', commerceAuth, staffOnly, async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query('SELECT * FROM sponsor_contributions WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!currentResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contribution not found' }); }
      const current = currentResult.rows[0];
      const status = String(req.body.status || current.status);
      if (!['offered','approved','received','rejected','closed'].includes(status)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Invalid contribution status' }); }
      let acceptedValue = req.body.acceptedValue === undefined ? Number(current.accepted_value) : Number(req.body.acceptedValue);
      if (['approved','received','closed'].includes(status)) {
        if (!Number.isFinite(acceptedValue) || acceptedValue <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'An accepted value greater than zero is required' }); }
        if (acceptedValue > Number(current.offered_value)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Accepted value cannot exceed the partner offered value' }); }
        const allocated = await client.query(`SELECT COALESCE(sum(agreed_value),0) AS total FROM sponsor_placements WHERE contribution_id=$1 AND status<>'cancelled'`, [current.id]);
        if (acceptedValue < Number(allocated.rows[0].total)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Accepted value cannot be reduced below sponsor value already allocated' }); }
      }
      if (status === 'rejected') acceptedValue = 0;
      const result = await client.query(
        `UPDATE sponsor_contributions
         SET status=$2,accepted_value=$3,approved_by_user_id=CASE WHEN $2 IN ('approved','received','closed') THEN $4 ELSE approved_by_user_id END,
             approved_at=CASE WHEN $2 IN ('approved','received','closed') AND approved_at IS NULL THEN now() ELSE approved_at END,
             received_at=CASE WHEN $2='received' AND received_at IS NULL THEN now() ELSE received_at END,
             notes=COALESCE($5,notes),updated_at=now()
         WHERE id=$1
         RETURNING id,sponsor_id AS "sponsorId",contribution_type AS "contributionType",description,
                   offered_value AS "offeredValue",accepted_value AS "acceptedValue",status,received_at AS "receivedAt",approved_at AS "approvedAt",notes`,
        [current.id, status, acceptedValue, req.commerceUser.id, req.body.notes === undefined ? null : String(req.body.notes)]
      );
      await audit(client, req.commerceUser, 'update', 'sponsor_contribution', current.id, { status, acceptedValue });
      await client.query('COMMIT');
      res.json({ item: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
  });

  app.get('/api/commerce/sponsor/placements', commerceAuth, sponsorRead, async (req, res, next) => {
    try {
      const sponsorId = sponsorIdFor(req);
      const params = [];
      const where = sponsorId ? 'WHERE sp.sponsor_id=$1' : '';
      if (sponsorId) params.push(sponsorId);
      const result = await pool.query(
        `SELECT sp.id,sp.sponsor_id AS "sponsorId",s.name AS "sponsorName",sp.contribution_id AS "contributionId",
                sp.name,sp.placement_type AS "placementType",sp.location_label AS "locationLabel",sp.agreed_value AS "agreedValue",
                sp.status,sp.start_date AS "startDate",sp.end_date AS "endDate",sp.notes,sp.created_at AS "createdAt"
         FROM sponsor_placements sp JOIN sponsors s ON s.id=sp.sponsor_id
         ${where} ORDER BY sp.created_at DESC`,
        params
      );
      res.json({ items: result.rows });
    } catch (error) { next(error); }
  });

  app.post('/api/commerce/sponsor/placements', commerceAuth, staffOnly, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const contributionId = String(req.body.contributionId || '');
      const name = String(req.body.name || '').trim();
      const placementType = String(req.body.placementType || '').trim();
      const agreedValue = Number(req.body.agreedValue || 0);
      if (!contributionId || !name || !placementType || !Number.isFinite(agreedValue) || agreedValue <= 0) return res.status(400).json({ error: 'Contribution, placement name/type and agreed value greater than zero are required' });
      await client.query('BEGIN');
      const contributionResult = await client.query('SELECT * FROM sponsor_contributions WHERE id=$1 FOR UPDATE', [contributionId]);
      if (!contributionResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Contribution not found' }); }
      const contribution = contributionResult.rows[0];
      if (!['approved','received'].includes(contribution.status) || Number(contribution.accepted_value) <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Contribution must be approved with an accepted value before sponsor placement is assigned' }); }
      const allocatedResult = await client.query(`SELECT COALESCE(sum(agreed_value),0) AS total FROM sponsor_placements WHERE contribution_id=$1 AND status<>'cancelled'`, [contributionId]);
      const allocated = Number(allocatedResult.rows[0].total);
      if (allocated + agreedValue > Number(contribution.accepted_value)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Placement would exceed available sponsor value. Remaining value: ${(Number(contribution.accepted_value)-allocated).toFixed(2)}` });
      }
      const id = randomId('spl');
      const result = await client.query(
        `INSERT INTO sponsor_placements(id,sponsor_id,contribution_id,name,placement_type,location_label,agreed_value,status,start_date,end_date,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,'planned',NULLIF($8,'')::date,NULLIF($9,'')::date,$10)
         RETURNING id,sponsor_id AS "sponsorId",contribution_id AS "contributionId",name,placement_type AS "placementType",
                   location_label AS "locationLabel",agreed_value AS "agreedValue",status,start_date AS "startDate",end_date AS "endDate",notes`,
        [id, contribution.sponsor_id, contributionId, name, placementType, String(req.body.locationLabel || ''), agreedValue, String(req.body.startDate || ''), String(req.body.endDate || ''), String(req.body.notes || '')]
      );
      await audit(client, req.commerceUser, 'allocate', 'sponsor_placement', id, { contributionId, agreedValue });
      await client.query('COMMIT');
      res.status(201).json({ item: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
  });

  app.patch('/api/commerce/sponsor/placements/:id', commerceAuth, staffOnly, async (req, res, next) => {
    try {
      const status = String(req.body.status || '');
      if (!['planned','active','fulfilled','expired','cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid placement status' });
      const result = await pool.query(`UPDATE sponsor_placements SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,status`, [req.params.id, status]);
      if (!result.rowCount) return res.status(404).json({ error: 'Sponsor placement not found' });
      res.json({ item: result.rows[0] });
    } catch (error) { next(error); }
  });

  // ---------------------------------------------------------------------------
  // Advertising on the Go — provider-neutral checkout/payment ledger
  // ---------------------------------------------------------------------------
  app.get('/api/commerce/advertising/checkout', commerceAuth, advertiserOnly, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT b.id AS "bookingId",b.status,b.package_price AS "packagePrice",b.amount_paid AS "amountPaid",
                GREATEST(b.package_price-b.amount_paid,0) AS "balanceDue",p.name AS "packageName",
                e.name AS "eventName",e.event_date AS "eventDate",
                pr.id AS "paymentRequestId",pr.status AS "paymentRequestStatus",pr.external_reference AS "paymentRequestReference",
                pr.amount_due AS "requestedAmount",pr.created_at AS "paymentRequestedAt"
         FROM advertising_bookings b
         JOIN advertising_packages p ON p.id=b.package_id
         JOIN events e ON e.id=b.event_id
         LEFT JOIN LATERAL (
           SELECT r.* FROM advertising_payment_requests r WHERE r.booking_id=b.id ORDER BY r.created_at DESC LIMIT 1
         ) pr ON true
         WHERE b.advertiser_id=$1
         ORDER BY e.event_date DESC,b.created_at DESC`,
        [req.commerceUser.advertiserId]
      );
      res.json({ items: result.rows, processorConnected: false });
    } catch (error) { next(error); }
  });

  app.post('/api/commerce/advertising/bookings/:id/request-invoice', commerceAuth, advertiserOnly, advertiserApprover, async (req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const bookingResult = await client.query(
        `SELECT b.*,p.name AS package_name,e.name AS event_name FROM advertising_bookings b
         JOIN advertising_packages p ON p.id=b.package_id JOIN events e ON e.id=b.event_id
         WHERE b.id=$1 AND b.advertiser_id=$2 FOR UPDATE OF b`,
        [req.params.id, req.commerceUser.advertiserId]
      );
      if (!bookingResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Advertising booking not found' }); }
      const booking = bookingResult.rows[0];
      const balanceDue = Number(booking.package_price) - Number(booking.amount_paid);
      if (balanceDue <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This booking has no outstanding balance' }); }
      const existing = await client.query(
        `SELECT id,status,amount_due AS "amountDue",external_reference AS "externalReference",created_at AS "createdAt"
         FROM advertising_payment_requests WHERE booking_id=$1 AND status IN ('requested','issued','partially-paid')
         ORDER BY created_at DESC LIMIT 1`,
        [booking.id]
      );
      if (existing.rowCount) { await client.query('COMMIT'); return res.json({ item: existing.rows[0], existing: true, processorConnected: false }); }
      const id = randomId('inv');
      const reference = `ML-${id.toUpperCase()}`;
      const result = await client.query(
        `INSERT INTO advertising_payment_requests(id,advertiser_id,booking_id,request_type,amount_due,status,external_reference,notes,requested_by)
         VALUES($1,$2,$3,'invoice',$4,'requested',$5,$6,$7)
         RETURNING id,status,amount_due AS "amountDue",external_reference AS "externalReference",created_at AS "createdAt"`,
        [id, req.commerceUser.advertiserId, booking.id, balanceDue, reference, String(req.body.notes || ''), req.commerceUser.id]
      );
      await audit(client, req.commerceUser, 'request', 'advertising_invoice', id, { bookingId: booking.id, balanceDue });
      await client.query('COMMIT');
      res.status(201).json({ item: result.rows[0], processorConnected: false });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
  });

  app.get('/api/commerce/advertising/admin/payments', commerceAuth, staffOnly, async (req, res, next) => {
    try {
      const bookings = await pool.query(
        `SELECT b.id AS "bookingId",adv.name AS "advertiserName",p.name AS "packageName",e.name AS "eventName",e.event_date AS "eventDate",
                b.status,b.package_price AS "packagePrice",b.amount_paid AS "amountPaid",GREATEST(b.package_price-b.amount_paid,0) AS "balanceDue",
                pr.id AS "paymentRequestId",pr.status AS "paymentRequestStatus",pr.external_reference AS "paymentRequestReference"
         FROM advertising_bookings b JOIN advertisers adv ON adv.id=b.advertiser_id
         JOIN advertising_packages p ON p.id=b.package_id JOIN events e ON e.id=b.event_id
         LEFT JOIN LATERAL (SELECT r.* FROM advertising_payment_requests r WHERE r.booking_id=b.id ORDER BY r.created_at DESC LIMIT 1) pr ON true
         ORDER BY CASE WHEN b.status='payment-pending' THEN 0 ELSE 1 END,e.event_date DESC`
      );
      const payments = await pool.query(
        `SELECT pay.id,pay.booking_id AS "bookingId",adv.name AS "advertiserName",pay.amount,pay.payment_method AS "paymentMethod",
                pay.provider,pay.provider_reference AS "providerReference",pay.status,pay.paid_at AS "paidAt",pay.notes
         FROM advertising_payments pay JOIN advertisers adv ON adv.id=pay.advertiser_id
         ORDER BY pay.paid_at DESC LIMIT 200`
      );
      res.json({ bookings: bookings.rows, payments: payments.rows, processorConnected: false });
    } catch (error) { next(error); }
  });

  app.post('/api/commerce/advertising/admin/bookings/:id/record-payment', commerceAuth, staffOnly, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const amount = Number(req.body.amount || 0);
      const paymentMethod = String(req.body.paymentMethod || 'invoice');
      if (!Number.isFinite(amount) || amount <= 0 || !['invoice','card','ach','check','cash','other'].includes(paymentMethod)) return res.status(400).json({ error: 'Valid payment amount and method are required' });
      await client.query('BEGIN');
      const bookingResult = await client.query('SELECT * FROM advertising_bookings WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!bookingResult.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Advertising booking not found' }); }
      const booking = bookingResult.rows[0];
      const balanceDue = Math.max(Number(booking.package_price) - Number(booking.amount_paid), 0);
      if (balanceDue <= 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Booking is already paid in full' }); }
      if (amount > balanceDue + 0.005) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Payment exceeds remaining balance of ${balanceDue.toFixed(2)}` }); }
      const paymentId = randomId('pay');
      const requestResult = await client.query(`SELECT id FROM advertising_payment_requests WHERE booking_id=$1 AND status IN ('requested','issued','partially-paid') ORDER BY created_at DESC LIMIT 1`, [booking.id]);
      await client.query(
        `INSERT INTO advertising_payments(id,advertiser_id,booking_id,payment_request_id,amount,payment_method,provider,provider_reference,status,paid_at,recorded_by,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'recorded',COALESCE($9::timestamptz,now()),$10,$11)`,
        [paymentId, booking.advertiser_id, booking.id, requestResult.rows[0]?.id || null, amount, paymentMethod, String(req.body.provider || ''), String(req.body.providerReference || ''), req.body.paidAt || null, req.commerceUser.id, String(req.body.notes || '')]
      );
      const newPaid = Number(booking.amount_paid) + amount;
      const fullyPaid = newPaid + 0.005 >= Number(booking.package_price);
      await client.query(
        `UPDATE advertising_bookings SET amount_paid=$2,status=CASE WHEN $3 THEN 'confirmed' ELSE 'payment-pending' END,
             payment_reference=COALESCE(NULLIF($4,''),payment_reference),updated_at=now() WHERE id=$1`,
        [booking.id, newPaid, fullyPaid, String(req.body.providerReference || paymentId)]
      );
      if (fullyPaid) {
        await client.query(`UPDATE advertising_booking_showrooms SET status='confirmed',updated_at=now() WHERE booking_id=$1 AND status='reserved'`, [booking.id]);
      }
      await client.query(
        `UPDATE advertising_payment_requests SET status=CASE WHEN $2 THEN 'paid' ELSE 'partially-paid' END,updated_at=now()
         WHERE booking_id=$1 AND status IN ('requested','issued','partially-paid')`,
        [booking.id, fullyPaid]
      );
      await audit(client, req.commerceUser, 'record', 'advertising_payment', paymentId, { bookingId: booking.id, amount, fullyPaid, paymentMethod });
      await client.query('COMMIT');
      res.status(201).json({ paymentId, bookingId: booking.id, amountPaid: newPaid, balanceDue: Math.max(Number(booking.package_price)-newPaid,0), bookingStatus: fullyPaid ? 'confirmed' : 'payment-pending' });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
  });
}

function wrappedExpress(...args) {
  const app = currentExpress(...args);
  const priorUse = app.use.bind(app);
  app.use = function patchedUse(...useArgs) {
    if (!app.__mirroriedCommerceRoutesInstalled && useArgs[0] === '/api') installCommerceRoutes(app);
    return priorUse(...useArgs);
  };
  return app;
}
Object.assign(wrappedExpress, currentExpress);
require.cache[expressPath].exports = wrappedExpress;
