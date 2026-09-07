const partnerStaffRoles = new Set(['sales','operations','admin']);
let partnerSelectedSponsorId = '';
const partnerOriginalLoadPage = loadPage;

if (!basePages.some(x=>x[0]==='partnerValue')) basePages.splice(1,0,['partnerValue','Partner Value']);

loadPage = async function partnerLoadPage(){
  if (state.page !== 'partnerValue') return partnerOriginalLoadPage();
  $('#pageTitle').textContent='Partner Contribution Value';
  $('#pageSub').textContent='Contribution → accepted value → sponsor placement allocation';
  $('#content').innerHTML='<div class="panel">Loading Sponsor Partner value ledger…</div>';
  try { await renderPartnerValue(); } catch (error) { $('#content').innerHTML=`<div class="error-box">${esc(error.message)}</div>`; }
};

function partnerMoney(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function partnerDate(v){if(!v)return '—';return new Date(v).toLocaleDateString();}

async function renderPartnerValue(){
  const isStaff=partnerStaffRoles.has(state.user.role);
  let accounts=[];
  if(isStaff){
    const result=await api('/api/commerce/sponsor/accounts');
    accounts=result.items||[];
  }
  const query=isStaff&&partnerSelectedSponsorId?`?sponsorId=${encodeURIComponent(partnerSelectedSponsorId)}`:'';
  const [contributionData,placementData]=await Promise.all([
    api(`/api/commerce/sponsor/contributions${query}`),
    api(`/api/commerce/sponsor/placements${query}`)
  ]);
  const contributions=contributionData.items||[];
  const placements=placementData.items||[];
  const accepted=contributions.reduce((n,c)=>n+Number(c.acceptedValue||0),0);
  const allocated=contributions.reduce((n,c)=>n+Number(c.allocatedValue||0),0);
  const remaining=contributions.reduce((n,c)=>n+Number(c.remainingValue||0),0);
  const offered=contributions.reduce((n,c)=>n+Number(c.offeredValue||0),0);

  $('#content').innerHTML=`
    <div class="reporting-rule"><strong>Value rule:</strong> Mirroried LED can assign sponsor placement value equal to or less than the contribution value it formally accepts. The system blocks allocation above the remaining accepted value.</div>
    ${isStaff?partnerSponsorFilter(accounts):''}
    <div class="cards">
      <article><span>Partner offered value</span><strong>${partnerMoney(offered)}</strong></article>
      <article><span>Accepted value</span><strong>${partnerMoney(accepted)}</strong></article>
      <article><span>Allocated sponsor value</span><strong>${partnerMoney(allocated)}</strong></article>
      <article><span>Remaining sponsor value</span><strong>${partnerMoney(remaining)}</strong></article>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Partner Contributions</h2><p class="muted">Products, equipment, materials or services offered to help keep the truck and mobile showrooms in showcase condition.</p>${contributions.length?contributions.map(c=>partnerContributionCard(c,isStaff)).join(''):'<div class="empty">No contribution records yet.</div>'}</section>
      <section class="panel"><h2>Offer a Contribution</h2>${partnerOfferForm(isStaff,accounts)}</section>
    </div>
    ${isStaff?`<section class="panel"><h2>Assign Sponsor Placement Value</h2>${partnerPlacementForm(contributions)}</section>`:''}
    <section class="panel"><h2>Sponsor Placements</h2><p class="muted">Placement value is drawn from an approved contribution and cannot exceed its remaining balance.</p>${placements.length?partnerPlacementTable(placements,isStaff):'<div class="empty">No sponsor placement value has been assigned yet.</div>'}</section>`;

  if($('#partnerFilter')) $('#partnerFilter').onchange=e=>{partnerSelectedSponsorId=e.target.value;renderPartnerValue();};
  if($('#partnerOfferForm')) $('#partnerOfferForm').onsubmit=submitPartnerContribution;
  document.querySelectorAll('[data-contribution-action]').forEach(b=>b.onclick=()=>updatePartnerContribution(b));
  if($('#partnerPlacementForm')) $('#partnerPlacementForm').onsubmit=submitPartnerPlacement;
  document.querySelectorAll('[data-placement-status]').forEach(s=>s.onchange=()=>updatePartnerPlacementStatus(s.dataset.placementStatus,s.value));
}

function partnerSponsorFilter(accounts){
  return `<section class="panel partner-filter"><label>Staff sponsor view<select id="partnerFilter"><option value="">All Sponsor Partners</option>${accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===partnerSelectedSponsorId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label></section>`;
}

function partnerContributionCard(c,isStaff){
  const available=Number(c.remainingValue||0);
  return `<article class="placement-card partner-value-card">
    <div>${badge(c.status)}</div>
    <h3>${esc(c.description)}</h3>
    <p class="muted">${esc(c.sponsorName||'Sponsor Partner')} • ${esc(c.contributionType)} • ${partnerDate(c.createdAt)}</p>
    <div class="partner-value-grid"><div><small>OFFERED</small><strong>${partnerMoney(c.offeredValue)}</strong></div><div><small>ACCEPTED</small><strong>${partnerMoney(c.acceptedValue)}</strong></div><div><small>ALLOCATED</small><strong>${partnerMoney(c.allocatedValue)}</strong></div><div><small>AVAILABLE</small><strong>${partnerMoney(available)}</strong></div></div>
    ${c.notes?`<p>${esc(c.notes)}</p>`:''}
    ${isStaff&&['offered','approved'].includes(c.status)?`<div class="partner-actions"><label>Accepted value<input data-accepted-value="${esc(c.id)}" type="number" min="0.01" step="0.01" max="${Number(c.offeredValue)}" value="${Number(c.acceptedValue||c.offeredValue).toFixed(2)}"></label>${c.status==='offered'?`<button data-contribution-action="approved" data-contribution-id="${esc(c.id)}">Approve</button><button class="danger" data-contribution-action="rejected" data-contribution-id="${esc(c.id)}">Reject</button>`:`<button data-contribution-action="received" data-contribution-id="${esc(c.id)}">Mark Received</button>`}</div>`:''}
  </article>`;
}

function partnerOfferForm(isStaff,accounts){
  const canOffer=isStaff||state.user.role==='sponsor_approver';
  if(!canOffer)return '<p class="muted">Your account can view contribution and placement value. A Partner Approver can submit a new contribution offer.</p>';
  return `<form id="partnerOfferForm" class="stack">
    ${isStaff?`<label>Sponsor Partner<select id="partnerOfferSponsor" required><option value="">Select partner</option>${accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===partnerSelectedSponsorId?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:''}
    <label>Contribution type<select id="partnerContributionType"><option value="product">Product</option><option value="equipment">Equipment</option><option value="material">Material</option><option value="service">Service</option><option value="other">Other</option></select></label>
    <label>What is being provided?<textarea id="partnerContributionDescription" rows="3" required placeholder="Example: detailing products for truck and showroom trailers"></textarea></label>
    <label>Partner offered value<input id="partnerOfferedValue" type="number" min="0.01" step="0.01" required placeholder="1000.00"></label>
    <label>Notes<input id="partnerContributionNotes" placeholder="Optional product list, model, quantity or terms"></label>
    <button type="submit">Submit Contribution Offer</button>
    <p class="muted">Submitting an offer does not create sponsor credit. Mirroried LED must approve the contribution and accepted value first.</p>
  </form>`;
}

async function submitPartnerContribution(e){
  e.preventDefault();
  const body={
    contributionType:$('#partnerContributionType').value,
    description:$('#partnerContributionDescription').value.trim(),
    offeredValue:Number($('#partnerOfferedValue').value),
    notes:$('#partnerContributionNotes').value.trim()
  };
  if($('#partnerOfferSponsor')) body.sponsorId=$('#partnerOfferSponsor').value;
  try{await api('/api/commerce/sponsor/contributions',{method:'POST',body:JSON.stringify(body)});alert('Contribution offer submitted.');renderPartnerValue();}catch(error){alert(error.message);}
}

async function updatePartnerContribution(button){
  const id=button.dataset.contributionId;
  const action=button.dataset.contributionAction;
  const input=document.querySelector(`[data-accepted-value="${CSS.escape(id)}"]`);
  const body={status:action};
  if(action!=='rejected') body.acceptedValue=Number(input?.value||0);
  try{await api(`/api/commerce/sponsor/contributions/${id}`,{method:'PATCH',body:JSON.stringify(body)});renderPartnerValue();}catch(error){alert(error.message);}
}

function partnerPlacementForm(contributions){
  const eligible=contributions.filter(c=>['approved','received'].includes(c.status)&&Number(c.remainingValue)>0);
  if(!eligible.length)return '<p class="muted">Approve and value a contribution before assigning sponsor placement.</p>';
  return `<form id="partnerPlacementForm" class="stack">
    <label>Contribution funding this placement<select id="partnerPlacementContribution" required>${eligible.map(c=>`<option value="${esc(c.id)}">${esc(c.sponsorName)} — ${esc(c.description)} — ${partnerMoney(c.remainingValue)} available</option>`).join('')}</select></label>
    <label>Placement name<input id="partnerPlacementName" required placeholder="Example: Interior showroom sponsor mirror"></label>
    <label>Placement type<input id="partnerPlacementType" required placeholder="Mirror, product display, wall placement, digital placement..."></label>
    <label>Location<input id="partnerPlacementLocation" placeholder="Example: Showroom 1 — interior left wall"></label>
    <label>Agreed sponsor value<input id="partnerPlacementValue" type="number" min="0.01" step="0.01" required></label>
    <div class="grid-2"><label>Start date<input id="partnerPlacementStart" type="date"></label><label>End date<input id="partnerPlacementEnd" type="date"></label></div>
    <label>Notes<input id="partnerPlacementNotes" placeholder="Written placement terms"></label>
    <button type="submit">Assign Sponsor Placement</button>
  </form>`;
}

async function submitPartnerPlacement(e){
  e.preventDefault();
  try{
    await api('/api/commerce/sponsor/placements',{method:'POST',body:JSON.stringify({
      contributionId:$('#partnerPlacementContribution').value,
      name:$('#partnerPlacementName').value.trim(),
      placementType:$('#partnerPlacementType').value.trim(),
      locationLabel:$('#partnerPlacementLocation').value.trim(),
      agreedValue:Number($('#partnerPlacementValue').value),
      startDate:$('#partnerPlacementStart').value,
      endDate:$('#partnerPlacementEnd').value,
      notes:$('#partnerPlacementNotes').value.trim()
    })});
    alert('Sponsor placement assigned within available contribution value.');renderPartnerValue();
  }catch(error){alert(error.message);}
}

function partnerPlacementTable(items,isStaff){
  return `<div class="table-wrap"><table><thead><tr><th>Partner</th><th>Placement</th><th>Location</th><th>Value</th><th>Status</th><th>Dates</th></tr></thead><tbody>${items.map(p=>`<tr><td>${esc(p.sponsorName)}</td><td><strong>${esc(p.name)}</strong><br><small>${esc(p.placementType)}</small></td><td>${esc(p.locationLabel||'—')}</td><td>${partnerMoney(p.agreedValue)}</td><td>${isStaff?`<select data-placement-status="${esc(p.id)}"><option value="planned" ${p.status==='planned'?'selected':''}>planned</option><option value="active" ${p.status==='active'?'selected':''}>active</option><option value="fulfilled" ${p.status==='fulfilled'?'selected':''}>fulfilled</option><option value="expired" ${p.status==='expired'?'selected':''}>expired</option><option value="cancelled" ${p.status==='cancelled'?'selected':''}>cancelled</option></select>`:badge(p.status)}</td><td>${esc(p.startDate||'—')} → ${esc(p.endDate||'—')}</td></tr>`).join('')}</tbody></table></div>`;
}

async function updatePartnerPlacementStatus(id,statusValue){
  try{await api(`/api/commerce/sponsor/placements/${id}`,{method:'PATCH',body:JSON.stringify({status:statusValue})});}catch(error){alert(error.message);renderPartnerValue();}
}
