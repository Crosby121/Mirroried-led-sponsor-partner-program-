const $ = (s) => document.querySelector(s);
const state = { user:null, page:'dashboard', demoMode:false };
const basePages = [
  ['dashboard','Dashboard'],['campaigns','Campaigns'],['deliverables','Deliverables'],['approvals','Approvals'],['assets','Creative Assets'],['proofs','Proof'],['reports','Reports'],['renewals','Renewals']
];
function visiblePages(){
  const pages=[...basePages];
  if(['sales','admin'].includes(state.user?.role)) pages.splice(1,0,['opportunities','Opportunities']);
  return pages;
}
async function api(url, options={}) {
  const res = await fetch(url,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const body = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error||`Request failed (${res.status})`);
  return body;
}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function badge(v){return `<span class="status status-${esc(v)}">${esc(v||'—')}</span>`;}
function showLogin(){ $('#loginView').classList.remove('hidden'); $('#appView').classList.add('hidden'); }
function showApp(){
  $('#loginView').classList.add('hidden'); $('#appView').classList.remove('hidden');
  $('#userBadge').innerHTML=`<strong>${esc(state.user.name)}</strong><span>${esc(state.user.role.replaceAll('_',' '))}</span>`;
  $('#nav').innerHTML=visiblePages().map(([id,label])=>`<button class="nav-btn ${state.page===id?'active':''}" data-page="${id}">${label}</button>`).join('');
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;showApp();loadPage();});
}
function cards(summary){return `<div class="cards">
  <article><span>Active / Scheduled</span><strong>${summary.activeCampaigns}</strong></article>
  <article><span>Pending approvals</span><strong>${summary.pendingApprovals}</strong></article>
  <article><span>Fulfilled</span><strong>${summary.fulfilled}</strong></article>
  <article><span>Proof records</span><strong>${summary.proofRecords}</strong></article>
  <article><span>Renewals</span><strong>${summary.upcomingRenewals}</strong></article>
</div>`;}
function table(items, cols){
  if(!items.length) return `<div class="empty">No records in this view.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${cols.map(c=>`<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${items.map(item=>`<tr>${cols.map(([_,key,fn])=>`<td>${fn?fn(item[key],item):esc(item[key]??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
async function loadPage(){
  const titles={dashboard:'Dashboard',opportunities:'Opportunities',campaigns:'Campaigns',deliverables:'Deliverables',approvals:'Approvals',assets:'Creative Assets',proofs:'Proof of Performance',reports:'Reports',renewals:'Renewals'};
  $('#pageTitle').textContent=titles[state.page]||'Portal'; $('#content').innerHTML='<div class="loading">Loading…</div>';
  try{
    if(state.page==='dashboard'){
      const d=await api('/api/dashboard');
      $('#content').innerHTML=cards(d.summary)+`<div class="grid-2"><section class="panel"><h2>Campaigns</h2>${table(d.campaigns,[['Campaign','name'],['Status','status',badge],['Start','startDate'],['End','endDate']])}</section><section class="panel"><h2>Needs attention</h2>${table(d.approvals,[['Approval','title'],['Status','status',badge],['Requested','requestedAt']])}</section></div><section class="panel"><h2>Deliverables</h2>${table(d.deliverables,[['Deliverable','name'],['Status','status',badge],['Start','plannedStart'],['End','plannedEnd'],['Placement','inventoryAssignment']])}</section>`;
      return;
    }
    const data=await api(`/api/${state.page}`); const items=data.items||[];
    if(state.page==='opportunities') renderOpportunities(items);
    if(state.page==='campaigns') $('#content').innerHTML=`<section class="panel">${table(items,[['Campaign','name'],['Objective','objective'],['Status','status',badge],['Start','startDate'],['End','endDate'],['Contract','contractRef']])}</section>`;
    if(state.page==='deliverables') $('#content').innerHTML=`<section class="panel">${table(items,[['Deliverable','name'],['Type','type'],['Status','status',badge],['Placement','inventoryAssignment'],['Notes','notes']])}</section>`;
    if(state.page==='approvals') renderApprovals(items);
    if(state.page==='assets') renderAssets(items);
    if(state.page==='proofs') $('#content').innerHTML=`<section class="panel">${table(items,[['Proof','title'],['Type','type'],['Captured','capturedAt'],['Notes','notes'],['Link','url',(v)=>v?`<a href="${esc(v)}" target="_blank" rel="noopener">Open</a>`:'—']])}</section>`;
    if(state.page==='reports') renderReports(items);
    if(state.page==='renewals') $('#content').innerHTML=`<section class="panel">${table(items,[['Status','status',badge],['Target date','targetDate'],['Owner','owner'],['Notes','notes']])}</section>`;
  }catch(e){$('#content').innerHTML=`<div class="error-box">${esc(e.message)}</div>`;}
}
function renderOpportunities(items){
  const rows=table(items,[['Opportunity','name'],['Sponsor ID','sponsorId'],['Status','status',badge],['Value','estimatedValue',(v)=>`$${Number(v||0).toLocaleString()}`],['Decision maker','decisionMaker'],['Next step','nextStep'],['Campaign','campaignId'],['Action','id',(_,i)=>!['won','lost'].includes(i.status)?`<button data-win="${esc(i.id)}">Mark won + handoff</button>`:'—']]);
  $('#content').innerHTML=`<div class="grid-2"><section class="panel"><h2>Sales pipeline</h2>${rows}</section><section class="panel"><h2>Create opportunity</h2><form id="oppForm" class="stack"><label>Sponsor ID<input id="oppSponsor" required placeholder="spn-..."></label><label>Opportunity name<input id="oppName" required></label><label>Objective<input id="oppObjective"></label><label>Estimated value<input id="oppValue" type="number" min="0" step="1"></label><label>Decision maker<input id="oppDecision"></label><label>Next step<input id="oppNext"></label><button type="submit">Create opportunity</button></form></section></div>`;
  $('#oppForm').onsubmit=createOpportunity;
  document.querySelectorAll('[data-win]').forEach(b=>b.onclick=()=>winOpportunity(b.dataset.win));
}
async function createOpportunity(e){
  e.preventDefault();
  const body={sponsorId:$('#oppSponsor').value.trim(),name:$('#oppName').value.trim(),objective:$('#oppObjective').value.trim(),estimatedValue:Number($('#oppValue').value||0),decisionMaker:$('#oppDecision').value.trim(),nextStep:$('#oppNext').value.trim(),status:'target'};
  try{await api('/api/opportunities',{method:'POST',body:JSON.stringify(body)});loadPage();}catch(err){alert(err.message);}
}
async function winOpportunity(id){
  const campaignName=prompt('Campaign name for the handoff:')||''; if(!campaignName)return;
  const startDate=prompt('Campaign start date (YYYY-MM-DD), optional:')||'';
  const endDate=prompt('Campaign end date (YYYY-MM-DD), optional:')||'';
  const contractRef=prompt('Contract / SOW reference, optional:')||'';
  try{await api(`/api/opportunities/${id}`,{method:'PATCH',body:JSON.stringify({status:'won',campaignName,startDate,endDate,contractRef})});alert('Opportunity marked won and draft campaign created.');loadPage();}catch(err){alert(err.message);}
}
function renderApprovals(items){
  const canDecide=['sponsor_approver','operations','admin'].includes(state.user.role);
  $('#content').innerHTML=`<section class="panel">${table(items,[['Approval','title'],['Status','status',badge],['Comment','comment'],['Requested','requestedAt'],['Action','id',(_,i)=>canDecide&&i.status==='pending'?`<div class="row-actions"><button data-approve="${esc(i.id)}">Approve</button><button class="danger" data-reject="${esc(i.id)}">Reject</button></div>`:'—']])}</section>`;
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>decide(b.dataset.approve,'approved'));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>decide(b.dataset.reject,'rejected'));
}
async function decide(id,status){
  const comment=prompt(`Optional comment for ${status}:`)||'';
  try{await api(`/api/approvals/${id}`,{method:'PATCH',body:JSON.stringify({status,comment})});loadPage();}catch(e){alert(e.message);}
}
function renderAssets(items){
  const rows=table(items,[['Asset','name'],['Status','status',badge],['Uploaded','uploadedAt'],['File','url',(v)=>v?`<a href="${esc(v)}" target="_blank" rel="noopener">Open</a>`:'Demo/reference']]);
  $('#content').innerHTML=`<div class="grid-2"><section class="panel"><h2>Creative library</h2>${rows}</section><section class="panel"><h2>Upload creative</h2><form id="assetForm" class="stack"><label>Campaign ID<input id="assetCampaign" required placeholder="cmp-..."></label>${['sales','operations','admin'].includes(state.user.role)?'<label>Sponsor ID<input id="assetSponsor" required placeholder="spn-..."></label>':''}<label>File<input id="assetFile" type="file" required></label><label>Asset name<input id="assetName" placeholder="Logo / campaign creative"></label><button type="submit">Upload asset</button><p class="muted">Max file size: 2 MB.</p></form></section></div>`;
  $('#assetForm').onsubmit=uploadAsset;
}
async function uploadAsset(e){
  e.preventDefault(); const file=$('#assetFile').files[0]; if(!file)return;
  if(file.size>2*1024*1024)return alert('File exceeds 2 MB limit.');
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  const body={campaignId:$('#assetCampaign').value.trim(),fileName:file.name,name:$('#assetName').value.trim()||file.name,dataUrl};
  if($('#assetSponsor'))body.sponsorId=$('#assetSponsor').value.trim();
  try{await api('/api/assets',{method:'POST',body:JSON.stringify(body)});loadPage();}catch(err){alert(err.message);}
}
function renderReports(items){
  const canGenerate=['operations','admin'].includes(state.user.role);
  const rows=table(items,[['Report','title'],['Status','status',badge],['Period start','periodStart'],['Period end','periodEnd'],['Summary','summary']]);
  $('#content').innerHTML=canGenerate?`<div class="grid-2"><section class="panel"><h2>Reports</h2>${rows}</section><section class="panel"><h2>Generate closeout report</h2><form id="reportForm" class="stack"><label>Sponsor ID<input id="reportSponsor" required placeholder="spn-..."></label><label>Campaign ID<input id="reportCampaign" required placeholder="cmp-..."></label><label>Report title<input id="reportTitle" placeholder="Campaign Closeout Report"></label><button type="submit">Generate from fulfillment records</button><p class="muted">Uses current deliverable statuses and proof records.</p></form></section></div>`:`<section class="panel">${rows}</section>`;
  if(canGenerate) $('#reportForm').onsubmit=generateReport;
}
async function generateReport(e){
  e.preventDefault();const body={sponsorId:$('#reportSponsor').value.trim(),campaignId:$('#reportCampaign').value.trim(),title:$('#reportTitle').value.trim()};
  try{await api('/api/reports/generate',{method:'POST',body:JSON.stringify(body)});loadPage();}catch(err){alert(err.message);}
}
async function boot(){
  try{const cfg=await api('/api/config');state.demoMode=cfg.demoMode;if(cfg.demoMode)$('#demoBox').classList.remove('hidden');}catch{}
  try{const me=await api('/api/me');state.user=me.user;showApp();loadPage();}catch{showLogin();}
}
$('#loginForm').onsubmit=async(e)=>{e.preventDefault();$('#loginError').textContent='';try{const r=await api('/api/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})});state.user=r.user;showApp();loadPage();}catch(err){$('#loginError').textContent=err.message;}};
document.querySelectorAll('[data-demo]').forEach(b=>b.onclick=()=>{$('#email').value=b.dataset.demo;$('#password').value='demo';$('#loginForm').requestSubmit();});
$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'}).catch(()=>{});state.user=null;state.page='dashboard';showLogin();};
boot();
