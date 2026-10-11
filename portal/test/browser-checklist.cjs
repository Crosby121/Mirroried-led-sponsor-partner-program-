const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
async function run(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'checklist-browser-'));
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'3199',DEMO_MODE:'true',NODE_ENV:'test',DATA_FILE:dir+'/db.json',UPLOAD_DIR:dir+'/uploads'},stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3199/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  browser=await chromium.launch();
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:3199/sponsor.html');
   await page.locator('#publicLoginBtn').click();
   await page.locator('#email').fill('ops@demo.mirroriedled.local');await page.locator('#password').fill('demo');await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.getByRole('button',{name:'Partnership Checklist',exact:true}).click();
   await page.getByRole('button',{name:'Generate agreement checklist',exact:true}).click();
   const name="Browser video";
   await page.locator('[name="promises"]').fill(`${name} | 2026-11-01`);await page.locator('[name="approved"]').check();
   await page.getByRole('button',{name:'Generate checklist',exact:true}).click();
   let row=page.locator('tr').filter({hasText:name});await row.getByRole('button',{name:'Update status'}).click();
   await page.locator('[name="status"]').selectOption('fulfilled');await page.locator('[name="notes"]').fill('Delivered');await page.getByRole('button',{name:'Save status'}).click();
   await row.getByRole('button',{name:'Update status'}).click();assert.equal(await page.locator('[name="status"]').inputValue(),'fulfilled');
   await page.locator('[name="notes"]').fill('Notes-only update');await page.getByRole('button',{name:'Save status'}).click();
   await row.getByRole('button',{name:'Add proof'}).click();await page.locator('[name="title"]').fill('Published video');await page.locator('[name="url"]').fill('https://example.com/video');await page.getByRole('button',{name:'Save proof'}).click();
   await row.getByText('Complete',{exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Page should not overflow horizontally');
   await page.evaluate(()=>document.querySelector('#logoutBtn').click());await page.locator('#publicLoginBtn').click();
   await page.locator('#email').fill('viewer@demo.mirroriedled.local');await page.locator('#password').fill('demo');await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.getByRole('button',{name:'Partnership Checklist',exact:true}).click();await page.getByText(name,{exact:true}).waitFor();
   assert.equal(await page.locator('[data-checklist-status],[data-checklist-proof],[data-generate-checklist]').count(),0);
   assert.deepEqual(errors,[]);await context.close();console.log(`PASS checklist Chromium ${viewport.width}x${viewport.height}`);
  }
 }finally{await browser?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1});
