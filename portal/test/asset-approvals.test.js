const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const vm=require('node:vm');

test('asset requests enforce scope, reuse pending approvals, and synchronize decisions',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asset-approvals-'));
 const db=JSON.parse(fs.readFileSync('portal/data/seed.json'));
 db.assets.push({id:'ast-test',sponsorId:'spn-demo',campaignId:'cmp-demo-fall',name:'Test creative',status:'submitted'},
 {id:'ast-other',sponsorId:'other',campaignId:'other',name:'Private creative',status:'submitted'},
 {id:'ast-archived',sponsorId:'spn-demo',campaignId:'cmp-demo-fall',status:'archived'});
 const dataFile=path.join(dir,'db.json');fs.writeFileSync(dataFile,JSON.stringify(db));
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,['portal/server.js'],{env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',PORT:String(port),DATA_FILE:dataFile,UPLOAD_DIR:path.join(dir,'uploads')},stdio:'ignore'});
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,20));}
 const login=async email=>{const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'demo'})});assert.equal(r.status,200);return {'Content-Type':'application/json',Cookie:r.headers.get('set-cookie').split(';')[0]};};
 const ops=await login('ops@demo.mirroriedled.local'),partner=await login('approver@demo.mirroriedled.local'),viewer=await login('viewer@demo.mirroriedled.local');
 const request=(id,headers=ops)=>fetch(`${base}/api/assets/${id}/approval`,{method:'POST',headers,body:'{}'});
 assert.equal((await request('ast-test',{})).status,401);
 assert.equal((await request('ast-test',viewer)).status,403);
 assert.equal((await request('ast-other',partner)).status,404);
 assert.equal((await request('missing')).status,404);
 assert.equal((await request('ast-archived')).status,409);
 const attempts=await Promise.all(Array.from({length:5},()=>request('ast-test')));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,200,200,200,201]);
 const items=await Promise.all(attempts.map(r=>r.json()));const approval=items[0].item;
 assert.ok(items.every(r=>r.item.id===approval.id));assert.equal(approval.assetId,'ast-test');assert.equal(approval.status,'pending');
 let saved=JSON.parse(fs.readFileSync(dataFile));assert.equal(saved.approvals.filter(a=>a.assetId==='ast-test').length,1);assert.equal(saved.audit.filter(a=>a.action==='request-approval').length,1);
 assert.ok((await (await fetch(base+'/api/approvals',{headers:partner})).json()).items.some(a=>a.id===approval.id));
 const decide=(id,status,headers=ops)=>fetch(`${base}/api/approvals/${id}`,{method:'PATCH',headers,body:JSON.stringify({status})});
 assert.equal((await decide(approval.id,'approved',viewer)).status,403);
 assert.equal((await decide(approval.id,'rejected')).status,200);
 saved=JSON.parse(fs.readFileSync(dataFile));assert.equal(saved.assets.find(a=>a.id==='ast-test').status,'rejected');
 const again=await request('ast-test',partner);assert.equal(again.status,201);const next=(await again.json()).item;assert.notEqual(next.id,approval.id);
 assert.equal((await decide(approval.id,'approved')).status,409,'A past decision cannot change a resubmitted asset');
 assert.equal((await decide(next.id,'approved',partner)).status,200);
 assert.equal((await decide(next.id,'approved',partner)).status,200,'Retrying the same decision is idempotent');
 assert.equal((await decide(next.id,'rejected')).status,409);
 assert.equal((await request('ast-test')).status,409);
 saved=JSON.parse(fs.readFileSync(dataFile));assert.equal(saved.assets.find(a=>a.id==='ast-test').status,'approved');
});

test('creative library exposes request actions only to permitted roles and eligible assets',()=>{
 const content={innerHTML:'',closest:()=>({remove(){}})};const context={$:()=>content,state:{user:{role:'admin'}},document:{querySelectorAll:()=>[]},uploadAsset:()=>{}};vm.createContext(context);
 const source=fs.readFileSync('portal/public/app.js','utf8');
 vm.runInContext(source.slice(source.indexOf('function esc('),source.indexOf('function showMarketing('))+source.slice(source.indexOf('function table('),source.indexOf('function placementCategory('))+source.slice(source.indexOf('function renderAssets('),source.indexOf('async function uploadAsset(')),context);
 const assets=[{id:'submitted',status:'submitted'},{id:'pending',status:'submitted'},{id:'approved',status:'approved'},{id:'archived',status:'archived'}];
 context.renderAssets(assets,[{assetId:'pending',status:'pending'}]);
 assert.ok(content.innerHTML.includes('data-request-approval="submitted"'));
 assert.ok(!content.innerHTML.includes('data-request-approval="pending"'));assert.ok(content.innerHTML.includes('Approval pending'));
 assert.ok(!content.innerHTML.includes('data-request-approval="approved"'));assert.ok(!content.innerHTML.includes('data-request-approval="archived"'));
 context.state.user.role='sponsor_viewer';context.renderAssets(assets,[]);assert.ok(!content.innerHTML.includes('data-request-approval'));
});
