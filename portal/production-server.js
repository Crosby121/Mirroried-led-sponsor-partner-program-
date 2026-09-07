const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db/pool');
const { randomId, hashPassword, verifyPassword, createSessionToken, hashToken } = require('./lib/security');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'production';
const APP_ORIGIN = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 8);
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STAFF = new Set(['sales', 'operations', 'admin']);
const CAMPAIGN_STATUS = new Set(['draft','awaiting-assets','awaiting-approval','scheduled','active','paused','completed','cancelled']);
const DELIVERABLE_STATUS = new Set(['planned','ready','active','fulfilled','exception','make-good','cancelled']);
const OPPORTUNITY_STATUS = new Set(['target','contacted','discovery','qualified','proposal','negotiation','won','lost','nurture']);
const ROLES = new Set(['sponsor_viewer','sponsor_approver','sales','operations','admin']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    }
  }
}));
app.use(express.json({ limit: '3mb' }));
app.use((req, res, next) => {
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && APP_ORIGIN) {
    const origin = req.get('origin');
    if (origin && origin.replace(/\/$/, '') !== APP_ORIGIN) return res.status(403).json({ error: 'Origin not allowed' });
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

function cookieMap(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setSessionCookie(res, token, maxAgeSeconds) {
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `mirroried_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`);
}
function safeUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, sponsorId: row.sponsor_id || null };
}
function sponsorScope(user, alias = '') {
  return STAFF.has(user.role) ? { sql: 'TRUE', params: [] } : { sql: `${alias}sponsor_id = $1`, params: [user.sponsorId] };
}
function canSee(user, sponsorId) {
  return STAFF.has(user.role) || (user.sponsorId && user.sponsorId === sponsorId);
}
function requireRoles(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });
}
async function audit(client, user, action, entityType, entityId, details = {}) {
  await client.query(
    'INSERT INTO audit_log(id,actor_id,actor_role,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',
    [randomId('aud'), user.id, user.role, action, entityType, entityId, JSON.stringify(details)]
  );
}
async function auth(req, res, next) {
  try {
    const token = cookieMap(req).mirroried_session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const tokenHash = hashToken(token);
    const result = await pool.query(
      `SELECT u.id,u.email,u.name,u.role,u.sponsor_id
       FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,
      [tokenHash]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Session expired or invalid' });
    req.sessionTokenHash = tokenHash;
    req.user = safeUser(result.rows[0]);
    next();
  } catch (error) { next(error); }
}
function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) throw new Error('Expected a base64 data URL');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('File exceeds 2 MB upload limit');
  return { mimeType: match[1], buffer };
}
function cleanName(name) {
  return String(name || 'upload.bin').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
function campaignSelect(where = '') {
  return `SELECT id,sponsor_id AS "sponsorId",opportunity_id AS "opportunityId",name,objective,start_date AS "startDate",end_date AS "endDate",status,contract_ref AS "contractRef",creative_status AS "creativeStatus",renewal_date AS "renewalDate",renewal_status AS "renewalStatus",created_at AS "createdAt",updated_at AS "updatedAt" FROM campaigns ${where}`;
}
function deliverableSelect(where = '') {
  return `SELECT id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",name,type,status,planned_start AS "plannedStart",planned_end AS "plannedEnd",inventory_assignment AS "inventoryAssignment",notes,created_at AS "createdAt",updated_at AS "updatedAt" FROM deliverables ${where}`;
}
function approvalSelect(where = '') {
  return `SELECT id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",asset_id AS "assetId",title,status,requested_at AS "requestedAt",requested_by AS "requestedBy",decided_at AS "decidedAt",decided_by AS "decidedBy",comment FROM approvals ${where}`;
}

app.get('/api/config', (req, res) => res.json({ demoMode: false, database: 'postgresql' }));
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'mirroried-led-sponsor-portal', database: 'postgresql', environment: NODE_ENV });
  } catch {
    res.status(503).json({ ok: false, service: 'mirroried-led-sponsor-portal', database: 'unavailable' });
  }
});

app.post('/api/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true', [email]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.salt, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    await pool.query('DELETE FROM sessions WHERE expires_at<=now()');
    const { token, tokenHash } = createSessionToken();
    const expires = new Date(Date.now() + SESSION_MS);
    await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [tokenHash, user.id, expires]);
    setSessionCookie(res, token, SESSION_HOURS * 3600);
    res.json({ user: safeUser(user) });
  } catch (error) { next(error); }
});
app.post('/api/logout', auth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.sessionTokenHash]);
    setSessionCookie(res, '', 0);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.get('/api/dashboard', auth, async (req, res, next) => {
  try {
    const scope = sponsorScope(req.user);
    const campaigns = await pool.query(campaignSelect(`WHERE ${scope.sql} ORDER BY created_at DESC LIMIT 5`), scope.params);
    const deliverables = await pool.query(deliverableSelect(`WHERE ${scope.sql} ORDER BY created_at DESC LIMIT 8`), scope.params);
    const approvals = await pool.query(approvalSelect(`WHERE ${scope.sql} AND status='pending' ORDER BY requested_at DESC LIMIT 5`), scope.params);
    const proofs = await pool.query(`SELECT count(*)::int AS count FROM proofs WHERE ${scope.sql}`, scope.params);
    const renewals = await pool.query(`SELECT count(*)::int AS count FROM renewals WHERE ${scope.sql} AND status<>'closed'`, scope.params);
    res.json({
      summary: {
        activeCampaigns: campaigns.rows.filter(c => ['scheduled','active'].includes(c.status)).length,
        pendingApprovals: approvals.rowCount,
        fulfilled: deliverables.rows.filter(d => d.status === 'fulfilled').length,
        proofRecords: proofs.rows[0].count,
        upcomingRenewals: renewals.rows[0].count,
      },
      campaigns: campaigns.rows,
      approvals: approvals.rows,
      deliverables: deliverables.rows,
      renewals: []
    });
  } catch (error) { next(error); }
});

app.get('/api/opportunities', auth, requireRoles('sales','admin'), async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT id,sponsor_id AS "sponsorId",name,objective,estimated_value AS "estimatedValue",decision_maker AS "decisionMaker",next_step AS "nextStep",status,campaign_id AS "campaignId",owner_user_id AS "ownerUserId",created_at AS "createdAt",updated_at AS "updatedAt" FROM opportunities ORDER BY updated_at DESC`);
    res.json({ items: result.rows });
  } catch (error) { next(error); }
});
app.post('/api/opportunities', auth, requireRoles('sales','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { sponsorId, name, objective, estimatedValue, decisionMaker, nextStep } = req.body;
    if (!sponsorId || !String(name || '').trim()) return res.status(400).json({ error: 'sponsorId and name are required' });
    const sponsor = await client.query('SELECT id FROM sponsors WHERE id=$1', [sponsorId]);
    if (!sponsor.rowCount) return res.status(400).json({ error: 'Sponsor ID not found' });
    const id = randomId('opp');
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO opportunities(id,sponsor_id,name,objective,estimated_value,decision_maker,next_step,status,owner_user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,'target',$8)
       RETURNING id,sponsor_id AS "sponsorId",name,objective,estimated_value AS "estimatedValue",decision_maker AS "decisionMaker",next_step AS "nextStep",status,campaign_id AS "campaignId"`,
      [id, sponsorId, String(name).trim(), objective || null, Number(estimatedValue || 0), decisionMaker || null, nextStep || null, req.user.id]
    );
    await audit(client, req.user, 'create', 'opportunity', id, { sponsorId });
    await client.query('COMMIT');
    res.status(201).json({ item: created.rows[0] });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
});
app.patch('/api/opportunities/:id', auth, requireRoles('sales','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT * FROM opportunities WHERE id=$1', [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Opportunity not found' });
    const item = existing.rows[0];
    const requestedStatus = req.body.status || item.status;
    if (!OPPORTUNITY_STATUS.has(requestedStatus)) return res.status(400).json({ error: 'Invalid opportunity status' });
    await client.query('BEGIN');
    let campaignId = item.campaign_id;
    if (requestedStatus === 'won' && !campaignId) {
      if (!String(req.body.campaignName || '').trim()) return res.status(400).json({ error: 'campaignName is required when marking won' });
      campaignId = randomId('cmp');
      await client.query(
        `INSERT INTO campaigns(id,sponsor_id,opportunity_id,name,objective,start_date,end_date,status,contract_ref,creative_status)
         VALUES($1,$2,$3,$4,$5,NULLIF($6,'')::date,NULLIF($7,'')::date,'draft',NULLIF($8,''),'awaiting-assets')`,
        [campaignId, item.sponsor_id, item.id, String(req.body.campaignName).trim(), item.objective, req.body.startDate || '', req.body.endDate || '', req.body.contractRef || '']
      );
    }
    const updated = await client.query(
      `UPDATE opportunities SET status=$2,campaign_id=$3,updated_at=now() WHERE id=$1
       RETURNING id,sponsor_id AS "sponsorId",name,objective,estimated_value AS "estimatedValue",decision_maker AS "decisionMaker",next_step AS "nextStep",status,campaign_id AS "campaignId"`,
      [item.id, requestedStatus, campaignId]
    );
    await audit(client, req.user, requestedStatus === 'won' ? 'win-handoff' : 'update', 'opportunity', item.id, { status: requestedStatus, campaignId });
    await client.query('COMMIT');
    res.json({ item: updated.rows[0], campaignId });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); next(error); } finally { client.release(); }
});

app.get('/api/campaigns', auth, async (req, res, next) => {
  try { const s = sponsorScope(req.user); const r = await pool.query(campaignSelect(`WHERE ${s.sql} ORDER BY created_at DESC`), s.params); res.json({ items: r.rows }); } catch (e) { next(e); }
});
app.patch('/api/campaigns/:id', auth, requireRoles('sales','operations','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const current = await client.query('SELECT * FROM campaigns WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Campaign not found' });
    const c = current.rows[0];
    const status = req.body.status ?? c.status;
    if (!CAMPAIGN_STATUS.has(status)) return res.status(400).json({ error: 'Invalid campaign status' });
    await client.query('BEGIN');
    await client.query(
      `UPDATE campaigns SET name=$2,objective=$3,start_date=$4,end_date=$5,status=$6,contract_ref=$7,creative_status=$8,renewal_date=$9,renewal_status=$10,updated_at=now() WHERE id=$1`,
      [c.id, req.body.name ?? c.name, req.body.objective ?? c.objective, req.body.startDate ?? c.start_date, req.body.endDate ?? c.end_date, status, req.body.contractRef ?? c.contract_ref, req.body.creativeStatus ?? c.creative_status, req.body.renewalDate ?? c.renewal_date, req.body.renewalStatus ?? c.renewal_status]
    );
    await audit(client, req.user, 'update', 'campaign', c.id, { fields: Object.keys(req.body), status });
    await client.query('COMMIT');
    const out = await pool.query(campaignSelect('WHERE id=$1'), [c.id]);
    res.json({ item: out.rows[0] });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.get('/api/deliverables', auth, async (req, res, next) => {
  try { const s = sponsorScope(req.user); const r = await pool.query(deliverableSelect(`WHERE ${s.sql} ORDER BY created_at DESC`), s.params); res.json({ items: r.rows }); } catch (e) { next(e); }
});
app.patch('/api/deliverables/:id', auth, requireRoles('operations','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const current = await client.query('SELECT * FROM deliverables WHERE id=$1', [req.params.id]);
    if (!current.rowCount) return res.status(404).json({ error: 'Deliverable not found' });
    const d = current.rows[0];
    const status = req.body.status ?? d.status;
    if (!DELIVERABLE_STATUS.has(status)) return res.status(400).json({ error: 'Invalid deliverable status' });
    await client.query('BEGIN');
    await client.query(`UPDATE deliverables SET status=$2,planned_start=$3,planned_end=$4,inventory_assignment=$5,notes=$6,updated_at=now() WHERE id=$1`, [d.id, status, req.body.plannedStart ?? d.planned_start, req.body.plannedEnd ?? d.planned_end, req.body.inventoryAssignment ?? d.inventory_assignment, req.body.notes ?? d.notes]);
    await audit(client, req.user, 'update', 'deliverable', d.id, { fields: Object.keys(req.body), status });
    await client.query('COMMIT');
    const out = await pool.query(deliverableSelect('WHERE id=$1'), [d.id]);
    res.json({ item: out.rows[0] });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.get('/api/approvals', auth, async (req, res, next) => {
  try { const s = sponsorScope(req.user); const r = await pool.query(approvalSelect(`WHERE ${s.sql} ORDER BY requested_at DESC`), s.params); res.json({ items: r.rows }); } catch (e) { next(e); }
});
app.patch('/api/approvals/:id', auth, requireRoles('sponsor_approver','operations','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const current = await client.query('SELECT * FROM approvals WHERE id=$1', [req.params.id]);
    if (!current.rowCount || !canSee(req.user, current.rows[0].sponsor_id)) return res.status(404).json({ error: 'Approval not found' });
    if (!['approved','rejected'].includes(req.body.status)) return res.status(400).json({ error: 'status must be approved or rejected' });
    await client.query('BEGIN');
    const out = await client.query(`UPDATE approvals SET status=$2,comment=$3,decided_at=now(),decided_by=$4 WHERE id=$1 RETURNING id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",asset_id AS "assetId",title,status,requested_at AS "requestedAt",decided_at AS "decidedAt",comment`, [req.params.id, req.body.status, String(req.body.comment || ''), req.user.id]);
    if (current.rows[0].asset_id) await client.query('UPDATE assets SET status=$2 WHERE id=$1', [current.rows[0].asset_id, req.body.status]);
    await audit(client, req.user, 'decision', 'approval', req.params.id, { status: req.body.status });
    await client.query('COMMIT');
    res.json({ item: out.rows[0] });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.get('/api/assets', auth, async (req, res, next) => {
  try {
    const s = sponsorScope(req.user);
    const r = await pool.query(`SELECT id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",name,file_name AS "fileName",mime_type AS "mimeType",status,uploaded_by AS "uploadedBy",uploaded_at AS "uploadedAt" FROM assets WHERE ${s.sql} ORDER BY uploaded_at DESC`, s.params);
    res.json({ items: r.rows.map(a => ({ ...a, url: `/api/assets/${a.id}/file` })) });
  } catch (e) { next(e); }
});
app.post('/api/assets', auth, requireRoles('sponsor_approver','sales','operations','admin'), async (req, res, next) => {
  const client = await pool.connect();
  let storagePath;
  try {
    const sponsorId = STAFF.has(req.user.role) ? req.body.sponsorId : req.user.sponsorId;
    if (!sponsorId || !req.body.campaignId || !req.body.dataUrl) return res.status(400).json({ error: 'sponsorId/campaignId and file data are required' });
    const campaign = await client.query('SELECT id FROM campaigns WHERE id=$1 AND sponsor_id=$2', [req.body.campaignId, sponsorId]);
    if (!campaign.rowCount) return res.status(404).json({ error: 'Campaign not found in sponsor scope' });
    const parsed = parseDataUrl(req.body.dataUrl);
    const storageKey = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${cleanName(req.body.fileName)}`;
    storagePath = path.join(UPLOAD_DIR, storageKey);
    await fs.promises.writeFile(storagePath, parsed.buffer, { flag: 'wx' });
    const id = randomId('ast');
    await client.query('BEGIN');
    const out = await client.query(`INSERT INTO assets(id,sponsor_id,campaign_id,name,file_name,mime_type,storage_key,status,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,'submitted',$8) RETURNING id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",name,file_name AS "fileName",mime_type AS "mimeType",status,uploaded_at AS "uploadedAt"`, [id, sponsorId, req.body.campaignId, String(req.body.name || req.body.fileName || 'Creative asset'), cleanName(req.body.fileName), parsed.mimeType, storageKey, req.user.id]);
    await audit(client, req.user, 'upload', 'asset', id, { campaignId: req.body.campaignId });
    await client.query('COMMIT');
    res.status(201).json({ item: { ...out.rows[0], url: `/api/assets/${id}/file` } });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (storagePath) await fs.promises.unlink(storagePath).catch(() => {});
    next(e);
  } finally { client.release(); }
});
app.get('/api/assets/:id/file', auth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT sponsor_id,file_name,mime_type,storage_key FROM assets WHERE id=$1', [req.params.id]);
    const asset = result.rows[0];
    if (!asset || !canSee(req.user, asset.sponsor_id)) return res.status(404).json({ error: 'Asset not found' });
    const file = path.join(UPLOAD_DIR, path.basename(asset.storage_key));
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Stored file missing' });
    res.setHeader('Content-Type', asset.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${cleanName(asset.file_name)}"`);
    fs.createReadStream(file).pipe(res);
  } catch (e) { next(e); }
});

app.get('/api/proofs', auth, async (req, res, next) => {
  try { const s = sponsorScope(req.user); const r = await pool.query(`SELECT id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",deliverable_id AS "deliverableId",type,title,url,captured_at AS "capturedAt",notes,created_by AS "createdBy",created_at AS "createdAt" FROM proofs WHERE ${s.sql} ORDER BY captured_at DESC`, s.params); res.json({ items: r.rows }); } catch (e) { next(e); }
});
app.post('/api/proofs', auth, requireRoles('operations','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const campaign = await client.query('SELECT id FROM campaigns WHERE id=$1 AND sponsor_id=$2', [req.body.campaignId, req.body.sponsorId]);
    if (!campaign.rowCount) return res.status(400).json({ error: 'Valid sponsorId and campaignId required' });
    const id = randomId('prf');
    await client.query('BEGIN');
    const out = await client.query(`INSERT INTO proofs(id,sponsor_id,campaign_id,deliverable_id,type,title,url,captured_at,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,now()),$9,$10) RETURNING id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",deliverable_id AS "deliverableId",type,title,url,captured_at AS "capturedAt",notes,created_at AS "createdAt"`, [id, req.body.sponsorId, req.body.campaignId, req.body.deliverableId || null, String(req.body.type || 'proof'), String(req.body.title || 'Proof of performance'), String(req.body.url || ''), req.body.capturedAt || null, String(req.body.notes || ''), req.user.id]);
    await audit(client, req.user, 'create', 'proof', id, { campaignId: req.body.campaignId, deliverableId: req.body.deliverableId || null });
    await client.query('COMMIT');
    res.status(201).json({ item: out.rows[0] });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.get('/api/reports', auth, async (req, res, next) => {
  try { const s = sponsorScope(req.user); const r = await pool.query(`SELECT id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",title,status,period_start AS "periodStart",period_end AS "periodEnd",summary,generated_data AS "generatedData",created_at AS "createdAt" FROM reports WHERE ${s.sql} ORDER BY created_at DESC`, s.params); res.json({ items: r.rows }); } catch (e) { next(e); }
});
app.post('/api/reports/generate', auth, requireRoles('operations','admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const campaignResult = await client.query('SELECT * FROM campaigns WHERE id=$1 AND sponsor_id=$2', [req.body.campaignId, req.body.sponsorId]);
    if (!campaignResult.rowCount) return res.status(400).json({ error: 'Valid sponsorId and campaignId required' });
    const campaign = campaignResult.rows[0];
    const deliverables = await client.query('SELECT id,name,type,status,planned_start,planned_end,inventory_assignment,notes FROM deliverables WHERE campaign_id=$1 AND sponsor_id=$2 ORDER BY created_at', [campaign.id, campaign.sponsor_id]);
    const proofs = await client.query('SELECT id,deliverable_id,type,title,url,captured_at,notes FROM proofs WHERE campaign_id=$1 AND sponsor_id=$2 ORDER BY captured_at', [campaign.id, campaign.sponsor_id]);
    const fulfilled = deliverables.rows.filter(d => d.status === 'fulfilled').length;
    const exceptions = deliverables.rows.filter(d => ['exception','make-good'].includes(d.status)).length;
    const summary = `${fulfilled} of ${deliverables.rowCount} deliverables fulfilled; ${proofs.rowCount} proof records; ${exceptions} exception/make-good records.`;
    const id = randomId('rpt');
    await client.query('BEGIN');
    const out = await client.query(`INSERT INTO reports(id,sponsor_id,campaign_id,title,status,period_start,period_end,summary,generated_data,created_by) VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8::jsonb,$9) RETURNING id,sponsor_id AS "sponsorId",campaign_id AS "campaignId",title,status,period_start AS "periodStart",period_end AS "periodEnd",summary,generated_data AS "generatedData",created_at AS "createdAt"`, [id, campaign.sponsor_id, campaign.id, String(req.body.title || 'Campaign Closeout Report'), campaign.start_date, campaign.end_date, summary, JSON.stringify({ deliverables: deliverables.rows, proofs: proofs.rows }), req.user.id]);
    await audit(client, req.user, 'generate', 'report', id, { campaignId: campaign.id });
    await client.query('COMMIT');
    res.status(201).json({ item: out.rows[0] });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); next(e); } finally { client.release(); }
});

app.get('/api/renewals', auth, async (req, res, next) => {
  try { const s = sponsorScope(req.user); const r = await pool.query(`SELECT r.id,r.sponsor_id AS "sponsorId",r.campaign_id AS "campaignId",r.status,r.target_date AS "targetDate",COALESCE(u.name,r.owner_user_id,'') AS owner,r.notes,r.created_at AS "createdAt",r.updated_at AS "updatedAt" FROM renewals r LEFT JOIN users u ON u.id=r.owner_user_id WHERE ${sponsorScope(req.user,'r.').sql} ORDER BY r.target_date NULLS LAST`, sponsorScope(req.user,'r.').params); res.json({ items: r.rows }); } catch (e) { next(e); }
});

app.get('/api/audit', auth, requireRoles('operations','admin'), async (req, res, next) => {
  try { const r = await pool.query('SELECT id,actor_id AS "actorId",actor_role AS "actorRole",action,entity_type AS "entityType",entity_id AS "entityId",details,created_at AS timestamp FROM audit_log ORDER BY created_at DESC LIMIT 200'); res.json({ items: r.rows }); } catch (e) { next(e); }
});
app.post('/api/users', auth, requireRoles('admin'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '');
    const sponsorId = req.body.sponsorId || null;
    if (!email || password.length < 10 || !ROLES.has(role)) return res.status(400).json({ error: 'Valid email, role, and password of at least 10 characters are required' });
    if (['sponsor_viewer','sponsor_approver'].includes(role) && !sponsorId) return res.status(400).json({ error: 'Sponsor users require sponsorId' });
    if (STAFF.has(role) && sponsorId) return res.status(400).json({ error: 'Staff users cannot be assigned sponsorId' });
    if (sponsorId) { const sponsor = await client.query('SELECT id FROM sponsors WHERE id=$1', [sponsorId]); if (!sponsor.rowCount) return res.status(400).json({ error: 'Sponsor ID not found' }); }
    const { salt, hash } = hashPassword(password);
    const id = randomId('usr');
    await client.query('BEGIN');
    const out = await client.query(`INSERT INTO users(id,email,name,role,sponsor_id,salt,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,name,role,sponsor_id`, [id, email, String(req.body.name || email), role, sponsorId, salt, hash]);
    await audit(client, req.user, 'create', 'user', id, { role, sponsorId });
    await client.query('COMMIT');
    res.status(201).json({ user: safeUser(out.rows[0]) });
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' }); next(e); } finally { client.release(); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
app.use(express.static(PUBLIC_DIR, { index: 'index.html', fallthrough: true }));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`Mirroried LED Sponsor Portal production server listening on :${PORT}`));
