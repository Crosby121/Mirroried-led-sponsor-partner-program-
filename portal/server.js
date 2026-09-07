const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = process.env.DATA_FILE || path.join(DATA_DIR, 'db.json');
const SEED_PATH = path.join(DATA_DIR, 'seed.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY = 3 * 1024 * 1024;

if (NODE_ENV === 'production' && DEMO_MODE) throw new Error('DEMO_MODE must be disabled in production.');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.copyFileSync(SEED_PATH, DB_PATH);

const sessions = new Map();
const STATUS = {
  opportunity: new Set(['target','contacted','discovery','qualified','proposal','negotiation','won','lost','nurture']),
  campaign: new Set(['draft','awaiting-assets','awaiting-approval','scheduled','active','paused','completed','cancelled']),
  deliverable: new Set(['planned','ready','active','fulfilled','exception','make-good','cancelled'])
};
const ROLES = new Set(['sponsor_viewer','sponsor_approver','sales','operations','admin']);
const STAFF = new Set(['sales','operations','admin']);
const COLLECTIONS = ['users','sponsors','opportunities','campaigns','deliverables','assets','approvals','proofs','reports','renewals','audit'];

function readDb(){ return JSON.parse(fs.readFileSync(DB_PATH,'utf8')); }
function writeDb(db){ const tmp=`${DB_PATH}.tmp`; fs.writeFileSync(tmp,JSON.stringify(db,null,2)); fs.renameSync(tmp,DB_PATH); }
function now(){ return new Date().toISOString(); }
function id(prefix){ return `${prefix}-${crypto.randomUUID()}`; }
function ensureSchema(){ const db=readDb(); let changed=false; for(const k of COLLECTIONS){ if(!Array.isArray(db[k])){db[k]=[];changed=true;} } if(changed)writeDb(db); }
ensureSchema();
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){ return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')}; }
function verifyPassword(password,salt,hash){ const a=crypto.scryptSync(password,salt,64); const b=Buffer.from(hash,'hex'); return a.length===b.length&&crypto.timingSafeEqual(a,b); }
function bootstrapAdmin(){
  const email=process.env.ADMIN_EMAIL,password=process.env.ADMIN_PASSWORD; if(!email||!password)return;
  const db=readDb(), normalized=email.trim().toLowerCase();
  if(db.users.some(u=>u.email.toLowerCase()===normalized&&!u.demoOnly))return;
  const pw=hashPassword(password); db.users.push({id:id('usr'),email:normalized,name:process.env.ADMIN_NAME||'Mirroried LED Administrator',role:'admin',sponsorId:null,salt:pw.salt,passwordHash:pw.hash,demoOnly:false,createdAt:now()}); writeDb(db);
}
bootstrapAdmin();

function json(res,status,payload,headers={}){ res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(payload)); }
function text(res,status,body,type='text/plain; charset=utf-8'){ res.writeHead(status,{'Content-Type':type}); res.end(body); }
function parseCookies(req){ return Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return[decodeURIComponent(v.slice(0,i)),decodeURIComponent(v.slice(i+1))];})); }
function getSession(req){ const token=parseCookies(req).mirroried_session;if(!token)return null;const s=sessions.get(token);if(!s||s.expiresAt<Date.now()){sessions.delete(token);return null;}return{token,...s}; }
function currentUser(req){ const s=getSession(req); if(!s)return null; return readDb().users.find(u=>u.id===s.userId)||null; }
function requireUser(req,res){ const u=currentUser(req);if(!u){json(res,401,{error:'Authentication required'});return null;}return u; }
function safeUser(u){ return{id:u.id,email:u.email,name:u.name,role:u.role,sponsorId:u.sponsorId||null}; }
function canSee(u,r){ return STAFF.has(u.role)||(!!u.sponsorId&&r.sponsorId===u.sponsorId); }
function scoped(u,rows){ return STAFF.has(u.role)?rows:rows.filter(r=>canSee(u,r)); }
function allow(u,roles){ return roles.includes(u.role); }
function audit(db,u,action,entityType,entityId,details={}){ db.audit.push({id:id('aud'),actorId:u.id,actorRole:u.role,action,entityType,entityId,details,timestamp:now()}); }
function readBody(req){ return new Promise((resolve,reject)=>{let size=0,body='';req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY){reject(new Error('Request body too large'));req.destroy();return;}body+=chunk;});req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);}); }
function cleanName(name){ return String(name||'upload.bin').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120); }
function saveDataUrl(dataUrl,originalName){ const m=/^data:([^;]+);base64,(.+)$/.exec(dataUrl||'');if(!m)throw new Error('Expected a base64 data URL');const buffer=Buffer.from(m[2],'base64');if(buffer.length>2*1024*1024)throw new Error('File exceeds 2 MB upload limit');const fileName=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${cleanName(originalName)}`;fs.writeFileSync(path.join(UPLOAD_DIR,fileName),buffer);return{fileName,mimeType:m[1],url:`/uploads/${fileName}`}; }

async function api(req,res,pathname){
  if(pathname==='/api/config'&&req.method==='GET')return json(res,200,{demoMode:DEMO_MODE});
  if(pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'mirroried-led-sponsor-portal',environment:NODE_ENV});
  if(pathname==='/api/login'&&req.method==='POST'){
    const body=await readBody(req),db=readDb(),email=String(body.email||'').trim().toLowerCase(),user=db.users.find(u=>u.email.toLowerCase()===email);let valid=false;
    if(user?.demoOnly&&DEMO_MODE)valid=body.password===(process.env.DEMO_PASSWORD||'demo');
    if(user&&!user.demoOnly&&user.salt&&user.passwordHash)valid=verifyPassword(String(body.password||''),user.salt,user.passwordHash);
    if(!user||!valid)return json(res,401,{error:'Invalid email or password'});
    const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{userId:user.id,expiresAt:Date.now()+SESSION_TTL_MS});return json(res,200,{user:safeUser(user)},{'Set-Cookie':`mirroried_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS/1000}${NODE_ENV==='production'?'; Secure':''}`});
  }
  if(pathname==='/api/logout'&&req.method==='POST'){const s=getSession(req);if(s)sessions.delete(s.token);return json(res,200,{ok:true},{'Set-Cookie':'mirroried_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}

  const user=requireUser(req,res);if(!user)return;
  if(pathname==='/api/me'&&req.method==='GET')return json(res,200,{user:safeUser(user)});
  const db=readDb();

  if(pathname==='/api/dashboard'&&req.method==='GET'){
    const campaigns=scoped(user,db.campaigns),deliverables=scoped(user,db.deliverables),approvals=scoped(user,db.approvals),proofs=scoped(user,db.proofs),renewals=scoped(user,db.renewals);
    return json(res,200,{summary:{activeCampaigns:campaigns.filter(c=>['scheduled','active'].includes(c.status)).length,pendingApprovals:approvals.filter(a=>a.status==='pending').length,fulfilled:deliverables.filter(d=>d.status==='fulfilled').length,proofRecords:proofs.length,upcomingRenewals:renewals.filter(r=>r.status!=='closed').length},campaigns:campaigns.slice(0,5),approvals:approvals.filter(a=>a.status==='pending').slice(0,5),deliverables:deliverables.slice(0,8),renewals:renewals.slice(0,5)});
  }

  if(pathname==='/api/opportunities'&&req.method==='GET'){
    if(!allow(user,['sales','admin']))return json(res,403,{error:'Sales permission required'});
    return json(res,200,{items:db.opportunities});
  }
  if(pathname==='/api/opportunities'&&req.method==='POST'){
    if(!allow(user,['sales','admin']))return json(res,403,{error:'Sales permission required'});
    const body=await readBody(req);if(!body.sponsorId||!db.sponsors.some(s=>s.id===body.sponsorId))return json(res,400,{error:'Valid sponsorId required'});
    const item={id:id('opp'),sponsorId:body.sponsorId,name:String(body.name||'New sponsorship opportunity'),objective:String(body.objective||''),status:STATUS.opportunity.has(body.status)?body.status:'target',owner:body.owner||user.id,estimatedValue:Number(body.estimatedValue||0),contributionType:String(body.contributionType||'cash'),decisionMaker:String(body.decisionMaker||''),nextStep:String(body.nextStep||''),campaignId:null,createdAt:now(),updatedAt:now()};db.opportunities.push(item);audit(db,user,'create','opportunity',item.id,{sponsorId:item.sponsorId});writeDb(db);return json(res,201,{item});
  }
  const oppMatch=pathname.match(/^\/api\/opportunities\/([^/]+)$/);
  if(oppMatch&&req.method==='PATCH'){
    if(!allow(user,['sales','admin']))return json(res,403,{error:'Sales permission required'});const body=await readBody(req),item=db.opportunities.find(o=>o.id===oppMatch[1]);if(!item)return json(res,404,{error:'Opportunity not found'});if(body.status&&!STATUS.opportunity.has(body.status))return json(res,400,{error:'Invalid opportunity status'});
    for(const k of ['name','objective','status','owner','contributionType','decisionMaker','nextStep'])if(body[k]!==undefined)item[k]=String(body[k]);if(body.estimatedValue!==undefined)item.estimatedValue=Number(body.estimatedValue||0);item.updatedAt=now();
    if(item.status==='won'&&!item.campaignId){const campaign={id:id('cmp'),sponsorId:item.sponsorId,name:String(body.campaignName||item.name),objective:item.objective,startDate:String(body.startDate||''),endDate:String(body.endDate||''),status:'draft',contractRef:String(body.contractRef||''),creativeStatus:'awaiting-assets',renewalDate:String(body.renewalDate||''),renewalStatus:'not-started',createdAt:now(),updatedAt:now()};db.campaigns.push(campaign);item.campaignId=campaign.id;audit(db,user,'handoff','opportunity',item.id,{campaignId:campaign.id});}
    audit(db,user,'update','opportunity',item.id,{fields:Object.keys(body),status:item.status});writeDb(db);return json(res,200,{item,campaign:item.campaignId?db.campaigns.find(c=>c.id===item.campaignId):null});
  }

  const collections={campaigns:'campaigns',deliverables:'deliverables',approvals:'approvals',assets:'assets',proofs:'proofs',reports:'reports',renewals:'renewals'};
  const collectionKey=pathname.split('/')[2];if(pathname===`/api/${collectionKey}`&&req.method==='GET'&&collections[collectionKey])return json(res,200,{items:scoped(user,db[collections[collectionKey]])});

  if(pathname==='/api/audit'&&req.method==='GET'){if(!allow(user,['operations','admin']))return json(res,403,{error:'Forbidden'});return json(res,200,{items:db.audit.slice(-200).reverse()});}
  if(pathname==='/api/users'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Admin role required'});const body=await readBody(req),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');if(!email||password.length<10||!ROLES.has(body.role))return json(res,400,{error:'Valid email, role, and password of at least 10 characters are required'});if(['sponsor_viewer','sponsor_approver'].includes(body.role)&&!body.sponsorId)return json(res,400,{error:'Sponsor users require sponsorId'});if(db.users.some(u=>u.email.toLowerCase()===email))return json(res,409,{error:'Email already exists'});const pw=hashPassword(password),created={id:id('usr'),email,name:String(body.name||email),role:body.role,sponsorId:body.sponsorId||null,salt:pw.salt,passwordHash:pw.hash,demoOnly:false,createdAt:now()};db.users.push(created);audit(db,user,'create','user',created.id,{role:created.role,sponsorId:created.sponsorId});writeDb(db);return json(res,201,{user:safeUser(created)});
  }
  if(pathname==='/api/assets'&&req.method==='POST'){
    const body=await readBody(req),sponsorId=STAFF.has(user.role)?body.sponsorId:user.sponsorId;if(!sponsorId||!body.campaignId||!body.dataUrl)return json(res,400,{error:'sponsorId/campaignId and file data are required'});const campaign=db.campaigns.find(c=>c.id===body.campaignId&&c.sponsorId===sponsorId);if(!campaign)return json(res,404,{error:'Campaign not found in sponsor scope'});let file;try{file=saveDataUrl(body.dataUrl,body.fileName);}catch(e){return json(res,400,{error:e.message});}const asset={id:id('ast'),sponsorId,campaignId:campaign.id,name:String(body.name||body.fileName||'Creative asset'),fileName:file.fileName,mimeType:file.mimeType,url:file.url,status:'submitted',uploadedBy:user.id,uploadedAt:now()};db.assets.push(asset);audit(db,user,'upload','asset',asset.id,{campaignId:campaign.id});writeDb(db);return json(res,201,{item:asset});
  }
  const approvalMatch=pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if(approvalMatch&&req.method==='PATCH'){
    if(!allow(user,['sponsor_approver','operations','admin']))return json(res,403,{error:'Approval permission required'});const body=await readBody(req);if(!['approved','rejected'].includes(body.status))return json(res,400,{error:'status must be approved or rejected'});const item=db.approvals.find(a=>a.id===approvalMatch[1]);if(!item||!canSee(user,item))return json(res,404,{error:'Approval not found'});item.status=body.status;item.comment=String(body.comment||item.comment||'');item.decidedAt=now();item.decidedBy=user.id;audit(db,user,'decision','approval',item.id,{status:item.status});writeDb(db);return json(res,200,{item});
  }
  const campaignMatch=pathname.match(/^\/api\/campaigns\/([^/]+)$/);
  if(campaignMatch&&req.method==='PATCH'){
    if(!allow(user,['sales','operations','admin']))return json(res,403,{error:'Staff permission required'});const body=await readBody(req),item=db.campaigns.find(c=>c.id===campaignMatch[1]);if(!item)return json(res,404,{error:'Campaign not found'});if(body.status&&!STATUS.campaign.has(body.status))return json(res,400,{error:'Invalid campaign status'});for(const k of ['name','objective','startDate','endDate','status','contractRef','creativeStatus','renewalDate','renewalStatus'])if(body[k]!==undefined)item[k]=String(body[k]);item.updatedAt=now();audit(db,user,'update','campaign',item.id,{fields:Object.keys(body)});writeDb(db);return json(res,200,{item});
  }
  const deliverableMatch=pathname.match(/^\/api\/deliverables\/([^/]+)$/);
  if(deliverableMatch&&req.method==='PATCH'){
    if(!allow(user,['operations','admin']))return json(res,403,{error:'Operations permission required'});const body=await readBody(req),item=db.deliverables.find(d=>d.id===deliverableMatch[1]);if(!item)return json(res,404,{error:'Deliverable not found'});if(body.status&&!STATUS.deliverable.has(body.status))return json(res,400,{error:'Invalid deliverable status'});for(const k of ['status','plannedStart','plannedEnd','inventoryAssignment','notes'])if(body[k]!==undefined)item[k]=String(body[k]);audit(db,user,'update','deliverable',item.id,{fields:Object.keys(body),status:item.status});writeDb(db);return json(res,200,{item});
  }
  if(pathname==='/api/proofs'&&req.method==='POST'){
    if(!allow(user,['operations','admin']))return json(res,403,{error:'Operations permission required'});const body=await readBody(req),campaign=db.campaigns.find(c=>c.id===body.campaignId&&c.sponsorId===body.sponsorId);if(!campaign)return json(res,400,{error:'Valid sponsorId and campaignId required'});const proof={id:id('prf'),sponsorId:body.sponsorId,campaignId:body.campaignId,deliverableId:body.deliverableId||null,type:String(body.type||'proof'),title:String(body.title||'Proof of performance'),url:String(body.url||''),capturedAt:body.capturedAt||now(),notes:String(body.notes||''),createdBy:user.id,createdAt:now()};db.proofs.push(proof);audit(db,user,'create','proof',proof.id,{campaignId:proof.campaignId,deliverableId:proof.deliverableId});writeDb(db);return json(res,201,{item:proof});
  }
  if(pathname==='/api/reports/generate'&&req.method==='POST'){
    if(!allow(user,['operations','admin']))return json(res,403,{error:'Operations permission required'});const body=await readBody(req),campaign=db.campaigns.find(c=>c.id===body.campaignId&&c.sponsorId===body.sponsorId);if(!campaign)return json(res,400,{error:'Valid sponsorId and campaignId required'});const deliverables=db.deliverables.filter(d=>d.campaignId===campaign.id),proofs=db.proofs.filter(p=>p.campaignId===campaign.id),fulfilled=deliverables.filter(d=>d.status==='fulfilled').length,exceptions=deliverables.filter(d=>['exception','make-good'].includes(d.status));const report={id:id('rpt'),sponsorId:campaign.sponsorId,campaignId:campaign.id,title:String(body.title||`${campaign.name} Closeout Report`),status:'generated',periodStart:campaign.startDate,periodEnd:campaign.endDate,summary:`${fulfilled} of ${deliverables.length} deliverables fulfilled; ${proofs.length} proof records; ${exceptions.length} exception/make-good records.`,deliverableSnapshot:deliverables.map(d=>({id:d.id,name:d.name,status:d.status})),proofIds:proofs.map(p=>p.id),generatedAt:now(),createdAt:now()};db.reports.push(report);audit(db,user,'generate','report',report.id,{campaignId:campaign.id});writeDb(db);return json(res,201,{item:report});
  }
  return json(res,404,{error:'API route not found'});
}

function serveStatic(req,res,pathname){
  if(pathname.startsWith('/uploads/')){
    const user=currentUser(req);if(!user)return json(res,401,{error:'Authentication required'});const db=readDb(),asset=db.assets.find(a=>a.url===pathname);if(!asset||!canSee(user,asset))return json(res,404,{error:'File not found'});const file=path.join(UPLOAD_DIR,path.basename(pathname));if(!fs.existsSync(file))return json(res,404,{error:'File not found'});res.writeHead(200,{'Content-Type':asset.mimeType||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});fs.createReadStream(file).pipe(res);return;
  }
  let rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');const root=path.resolve(PUBLIC_DIR),file=path.resolve(PUBLIC_DIR,rel);if(!file.startsWith(root))return text(res,403,'Forbidden');if(!fs.existsSync(file)||fs.statSync(file).isDirectory())rel='index.html';const finalFile=path.resolve(PUBLIC_DIR,rel),ext=path.extname(finalFile).toLowerCase(),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};if(!fs.existsSync(finalFile))return text(res,404,'Not found');res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"});fs.createReadStream(finalFile).pipe(res);
}

const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url.pathname);return serveStatic(req,res,url.pathname);}catch(e){console.error(e);if(!res.headersSent)json(res,500,{error:'Internal server error'});else res.end();}});
server.listen(PORT,()=>console.log(`Mirroried LED Sponsor Portal running on http://localhost:${PORT}`));
