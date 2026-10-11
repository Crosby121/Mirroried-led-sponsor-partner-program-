function checklistRows(deliverables, proofs, today = new Date().toISOString().slice(0,10)) {
  return deliverables.map(item => {
    const evidence = proofs.filter(p => p.deliverableId === item.id && p.sponsorId === item.sponsorId && p.campaignId === item.campaignId);
    const complete = item.status === 'fulfilled' && evidence.length > 0;
    const cancelled = item.status === 'cancelled';
    const overdue = !complete && !cancelled && item.status !== 'fulfilled' && item.plannedEnd && String(item.plannedEnd).slice(0,10) < today;
    return {...item, evidence, complete, nextAction: cancelled ? 'Cancelled' : complete ? 'Complete' : item.status === 'fulfilled' ? 'Add proof' : overdue ? 'Overdue' : 'Deliver promise'};
  });
}

// Browser integration
basePages.splice(1,0,['checklist','Partnership Checklist']);
const checklistOriginalLoadPage = loadPage;
loadPage = async function () {
  if(state.page !== 'checklist') return checklistOriginalLoadPage();
  $('#pageTitle').textContent = 'Partnership Checklist';
  $('#content').innerHTML = '<div class="loading">Loading…</div>';
  try {
    const [campaignData, deliverableData, proofData] = await Promise.all([api('/api/campaigns'), api('/api/deliverables'), api('/api/proofs')]);
    const campaigns = campaignData.items || [];
    const rows = checklistRows(deliverableData.items || [], proofData.items || []);
    const canEdit = ['operations','admin'].includes(state.user.role);
    $('#content').innerHTML = `<section class="panel"><h2>Agreements and promised benefits</h2><p>Track each promise independently. Review partner contributions in Partner Value.</p>${campaigns.map(c => {
      const promises = rows.filter(d => d.campaignId === c.id && d.sponsorId === c.sponsorId);
      return `<article class="panel"><h3>${esc(c.name)}</h3><p>Agreement: ${esc(c.contractRef || 'No agreement reference recorded')} · ${badge(c.status)}</p>${canEdit && c.status !== 'cancelled' ? `<button data-generate-checklist="${esc(c.id)}">Generate agreement checklist</button>` : ''}${table(promises,[['Promise','name'],['Due','plannedEnd'],['Status','status',badge],['Next action','nextAction'],['Proof','evidence',v => v.map(p => esc(p.title)).join('<br>') || 'No proof attached'],['Action','id',(_,d) => canEdit && d.status !== 'cancelled' ? `<button data-checklist-proof="${esc(d.id)}">Add proof</button>` : '—']])}</article>`;
    }).join('') || '<div class="empty">No partnerships yet.</div>'}</section>`;
    document.querySelectorAll('[data-generate-checklist]').forEach(button => {
      button.onclick=()=>{
        const campaign=campaigns.find(c=>c.id===button.dataset.generateChecklist);
        $('#content').innerHTML=`<section class="panel"><h2>Generate checklist: ${esc(campaign.name)}</h2><form id="agreementChecklistForm" class="stack"><label>Approved agreement reference<input name="contractRef" required maxlength="200" value="${esc(campaign.contractRef || '')}"></label><label>Promises: one per line, name | due date (YYYY-MM-DD)<textarea name="promises" rows="8" required placeholder="Publish sponsor video | 2026-11-01&#10;Deliver sponsor mirror | 2026-11-15"></textarea></label><label><input name="approved" type="checkbox" required> I confirm these promises match the approved agreement.</label><p>Creates planned items without changing existing promises. Repeat submissions do not create duplicates. Amendments need separate review.</p><button type="submit">Generate checklist</button><button type="button" id="agreementBack">Back</button><p id="agreementError" role="alert"></p></form></section>`;
        $('#agreementBack').onclick=loadPage;
        $('#agreementChecklistForm').onsubmit=async event=>{
          event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('[type="submit"]');submit.disabled=true;
          try{
            const promises=form.elements.promises.value.split(/\r?\n/).filter(line=>line.trim()).map(line=>{
              const parts=line.split('|');if(parts.length!==2)throw new Error('Use name | YYYY-MM-DD on each line.');
              return {name:parts[0].trim(),dueDate:parts[1].trim()};
            });
            await api(`/api/campaigns/${encodeURIComponent(campaign.id)}/checklist`,{method:'POST',body:JSON.stringify({contractRef:form.elements.contractRef.value.trim(),agreementApproved:form.elements.approved.checked,promises})});
            await loadPage();
          }catch(error){$('#agreementError').textContent=error.message;submit.disabled=false;}
        };
      };
    });
    document.querySelectorAll('[data-checklist-proof]').forEach(button => {
      button.onclick = () => {
        const item = rows.find(d => d.id === button.dataset.checklistProof);
        $('#content').innerHTML = `<section class="panel"><h2>Proof for ${esc(item.name)}</h2><form id="checklistProofForm" class="stack"><label>Title<input name="title" required maxlength="200"></label><label>Evidence URL<input name="url" type="url" required placeholder="https://…"></label><label>Notes<textarea name="notes" maxlength="4000"></textarea></label><button type="submit">Save proof</button><button type="button" id="proofBack">Back to checklist</button><p id="proofError" role="alert"></p></form></section>`;
        $('#proofBack').onclick = loadPage;
        $('#checklistProofForm').onsubmit = async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const submit = form.querySelector('[type="submit"]');
          submit.disabled = true;
          try {
            const evidenceUrl = new URL(form.elements.url.value.trim());
            if(!['https:','http:'].includes(evidenceUrl.protocol)) throw new Error('Use an HTTP or HTTPS evidence link.');
            if(!form.elements.title.value.trim()) throw new Error('Enter a proof title.');
            await api('/api/proofs',{method:'POST',body:JSON.stringify({sponsorId:item.sponsorId,campaignId:item.campaignId,deliverableId:item.id,type:'delivery',title:form.elements.title.value.trim(),url:form.elements.url.value.trim(),notes:form.elements.notes.value.trim()})});
            await loadPage();
          } catch(error) { $('#proofError').textContent = error.message; submit.disabled = false; }
        };
      };
    });
  } catch(error) { $('#content').innerHTML = `<div class="error-box">${esc(error.message)}</div>`; }
};
