const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function prepare(body){
 const sandbox={module:{exports:{}},require};vm.runInNewContext(fs.existsSync('portal/lib/agreement-checklist.js')?fs.readFileSync('portal/lib/agreement-checklist.js','utf8'):'',sandbox);
 assert.equal(typeof sandbox.module.exports.prepareChecklist,'function','Agreement checklist validation missing');
 return sandbox.module.exports.prepareChecklist(body);
}
test('requires confirmation of an approved agreement and its reference',()=>{
 assert.throws(()=>prepare({contractRef:'SOW-1',promises:[{name:'Video',dueDate:'2026-10-30'}]}),/approved agreement/i);
});
test('normalizes promises and produces stable retry fingerprint',()=>{
 const body={agreementApproved:true,contractRef:'SOW-1',promises:[{name:'Video',dueDate:'2026-10-30'}]};
 const result=prepare(body);assert.equal(result.promises[0].plannedEnd,'2026-10-30');assert.equal(result.fingerprint,prepare(body).fingerprint);
 assert.notEqual(result.fingerprint,prepare({...body,contractRef:'SOW-2'}).fingerprint);
});
test('invalid dates and blank promises are rejected before any batch is written',()=>{
 assert.throws(()=>prepare({agreementApproved:true,contractRef:'SOW-1',promises:[{name:'Video',dueDate:'2026-02-30'}]}),/date/i);
 assert.throws(()=>prepare({agreementApproved:true,contractRef:'SOW-1',promises:[{name:' ',dueDate:'2026-10-30'}]}),/name/i);
});
