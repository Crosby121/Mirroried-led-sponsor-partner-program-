const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
test('proof API rejects mismatched promises without writing records',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sponsor-proof-'));
 const data=JSON.parse(fs.readFileSync('portal/data/seed.json'));
 data.deliverables.push({id:'foreign-sponsor',sponsorId:'other',campaignId:'cmp-demo-fall'}, {id:'foreign-campaign',sponsorId:'spn-demo',campaignId:'other'});
 const dataFile=path.join(dir,'db.json');fs.writeFileSync(dataFile,JSON.stringify(data));
 const reservation=net.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const child=spawn(process.execPath,['portal/server.js'],{env:{...process.env,NODE_ENV:'test',DEMO_MODE:'true',PORT:String(port),DATA_FILE:dataFile,UPLOAD_DIR:path.join(dir,'uploads')},stdio:'ignore'});
 t.after(async()=>{child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`;
 for(let attempt=0;attempt<100;attempt++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,20));}
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'ops@demo.mirroriedled.local',password:'demo'})});assert.equal(login.status,200);
 const headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0]};
 const post=id=>fetch(base+'/api/proofs',{method:'POST',headers,body:JSON.stringify({sponsorId:'spn-demo',campaignId:'cmp-demo-fall',deliverableId:id,title:'Evidence',url:'https://example.com/proof'})});
 const before=JSON.parse(fs.readFileSync(dataFile)).proofs.length;
 const auditBefore=JSON.parse(fs.readFileSync(dataFile)).audit.length;
 for(const id of ['foreign-sponsor','foreign-campaign','missing'])assert.equal((await post(id)).status,400,id);
 assert.equal(JSON.parse(fs.readFileSync(dataFile)).proofs.length,before);
 assert.equal(JSON.parse(fs.readFileSync(dataFile)).audit.length,auditBefore);
 assert.equal((await post('del-window-01')).status,201);
 assert.equal((await post(null)).status,201,'Campaign-level proof remains supported');
});
