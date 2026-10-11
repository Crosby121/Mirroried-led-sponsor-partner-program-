const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const crypto=require('node:crypto');
const {hashPassword}=require('../lib/security');

test('PostgreSQL checklist generation handles concurrent retries and rolls back failed batches', {skip:!process.env.TEST_DATABASE_URL,timeout:30000},async t=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const db=await pool.query('SELECT current_database() AS name');
 assert.ok(db.rows[0].name.endsWith('_test'),'Requires a disposable database ending in _test');
 const key=crypto.randomBytes(6).toString('hex');
 const sponsor=`spn-check-${key}`,user=`usr-check-${key}`,campaign=`cmp-check-${key}`,rollback=`cmp-rollback-${key}`;
 const fn=`checklist_failure_${key}`,trigger=`checklist_trigger_${key}`;
 const password=crypto.randomBytes(24).toString('hex'),email=`check-${key}@example.test`,pw=hashPassword(password);
 await pool.query('INSERT INTO sponsors(id,name) VALUES($1,$2)',[sponsor,'Checklist test sponsor']);
 await pool.query("INSERT INTO users(id,email,name,role,salt,password_hash) VALUES($1,$2,'Checklist CI','admin',$3,$4)",[user,email,pw.salt,pw.hash]);
 await pool.query("INSERT INTO campaigns(id,sponsor_id,name,contract_ref) VALUES($1,$3,'Concurrent test','TEST-AGREEMENT'),($2,$3,'Rollback test','TEST-ROLLBACK')",[campaign,rollback,sponsor]);
 t.after(async()=>{
  try {
  await pool.query(`DROP TRIGGER IF EXISTS ${trigger} ON deliverables; DROP FUNCTION IF EXISTS ${fn}()`);
  await pool.query('DELETE FROM audit_log WHERE actor_id=$1',[user]);
  await pool.query('DELETE FROM campaigns WHERE sponsor_id=$1',[sponsor]);
  await pool.query('DELETE FROM sessions WHERE user_id=$1',[user]);
  await pool.query('DELETE FROM users WHERE id=$1',[user]);
  await pool.query('DELETE FROM sponsors WHERE id=$1',[sponsor]);
  } finally { await pool.end(); }
 });
 const base=process.env.TEST_PORTAL_URL || 'http://127.0.0.1:3000';
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
 const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0]};
 const body={agreementApproved:true,contractRef:'TEST-AGREEMENT',promises:[{name:'Publish video',dueDate:'2099-11-01'},{name:'Deliver mirror',dueDate:'2099-11-15'}]};
 const generate=(id,payload)=>fetch(`${base}/api/campaigns/${id}/checklist`,{method:'POST',headers,body:JSON.stringify(payload)});
 const responses=await Promise.all(Array.from({length:6},()=>generate(campaign,body)));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,200,200,200,200,201]);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM deliverables WHERE campaign_id=$1',[campaign])).rows[0].n,2);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1 AND action='generate-checklist'",[campaign])).rows[0].n,1);
 assert.equal((await generate(campaign,{...body,contractRef:'CHANGED'})).status,409);
 await pool.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.campaign_id='${rollback}' AND NEW.name='Force rollback' THEN RAISE EXCEPTION 'Injected checklist test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${trigger} BEFORE INSERT ON deliverables FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
 const failed=await generate(rollback,{...body,contractRef:'TEST-ROLLBACK',promises:[{name:'First promise',dueDate:'2099-11-01'},{name:'Force rollback',dueDate:'2099-11-15'}]});assert.equal(failed.status,500);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM deliverables WHERE campaign_id=$1',[rollback])).rows[0].n,0);
 const state=await pool.query('SELECT checklist_fingerprint,checklist_generated_at FROM campaigns WHERE id=$1',[rollback]);
 assert.equal(state.rows[0].checklist_fingerprint,null);assert.equal(state.rows[0].checklist_generated_at,null);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE entity_id=$1 AND action='generate-checklist'",[rollback])).rows[0].n,0);
 await pool.query(`DROP TRIGGER ${trigger} ON deliverables`);
 assert.equal((await generate(rollback,{...body,contractRef:'TEST-ROLLBACK'})).status,201,'Retry succeeds after rollback');
});
