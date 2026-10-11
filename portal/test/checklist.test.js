const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function rows(deliverables,proofs){
 const context={};vm.createContext(context);
 const source=fs.existsSync('portal/public/checklist.js')?fs.readFileSync('portal/public/checklist.js','utf8'):'';
 vm.runInContext(source.split('// Browser integration')[0],context);
 assert.equal(typeof context.checklistRows,'function','Checklist projection is missing');
 return context.checklistRows(deliverables,proofs,'2026-10-11');
}
test('fulfilled promise still needs its own proof',()=>{
 const result=rows([{id:'d1',sponsorId:'s1',campaignId:'c1',status:'fulfilled',plannedEnd:'2026-10-01'}],[]);
 assert.equal(result[0].nextAction,'Add proof');assert.equal(result[0].complete,false);
});
test('proof from another campaign or sponsor cannot complete a promise',()=>{
 const result=rows([{id:'d1',sponsorId:'s1',campaignId:'c1',status:'fulfilled'}],[{deliverableId:'d1',sponsorId:'s2',campaignId:'c2'}]);
 assert.equal(result[0].complete,false);
});
test('matching proof and fulfillment complete only that promise',()=>{
 const result=rows([{id:'d1',sponsorId:'s1',campaignId:'c1',status:'fulfilled'},{id:'d2',status:'planned',plannedEnd:'2026-10-01'}],[{deliverableId:'d1',sponsorId:'s1',campaignId:'c1'}]);
 assert.equal(result[0].complete,true);assert.equal(result[1].nextAction,'Overdue');
});
test('sponsor entrypoint loads checklist after authenticated application scripts',()=>{
 const html=fs.readFileSync('portal/public/sponsor.html','utf8');
 assert.ok(html.indexOf('/checklist.js')>html.indexOf('/partner-value.js'));
 assert.ok(!fs.readFileSync('portal/public/index.html','utf8').includes('/checklist.js'));
});
function statusOptions(status,role){
 const context={};vm.createContext(context);
 vm.runInContext(fs.readFileSync('portal/public/checklist.js','utf8').split('// Browser integration')[0],context);
 assert.equal(typeof context.checklistStatusOptions,'function','Checklist status controls are missing');
 return Array.from(context.checklistStatusOptions({status},role),o=>o.value);
}
test('sponsors and cancelled promises have no status actions',()=>{
 assert.deepEqual(statusOptions('planned','sponsor_viewer'),[]);
 assert.deepEqual(statusOptions('cancelled','admin'),[]);
});
test('operations can start, fulfill or flag a promise without repeating its current status',()=>{
 assert.deepEqual(statusOptions('planned','operations'),['active','fulfilled','exception']);
 assert.deepEqual(statusOptions('active','admin'),['fulfilled','exception']);
});
