const {createHash}=require('node:crypto');
function prepareChecklist(body = {}) {
  if(body.agreementApproved !== true) throw new Error('Confirm the approved agreement before generating its checklist');
  const contractRef=String(body.contractRef || '').trim();
  if(!contractRef || contractRef.length>200) throw new Error('Agreement reference is required (maximum 200 characters)');
  if(!Array.isArray(body.promises) || !body.promises.length || body.promises.length>50) throw new Error('Provide between 1 and 50 promises');
  const promises=body.promises.map(p=>{
    if(!p || typeof p!=='object') throw new Error('Each promise must have a name and due date');
    const name=String(p.name || '').trim();
    if(!name || name.length>200) throw new Error('Promise name is required (maximum 200 characters)');
    const date=String(p.dueDate || '');
    const parsed=new Date(date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) throw new Error('Each promise needs a valid due date');
    const type=String(p.type || 'agreement-benefit').trim();
    if(!type || type.length>80) throw new Error('Promise type must have 1 to 80 characters');
    return {name,type,plannedEnd:date};
  });
  const fingerprint=createHash('sha256').update(JSON.stringify({contractRef,promises})).digest('hex');
  return {contractRef,promises,fingerprint};
}
module.exports={prepareChecklist};
