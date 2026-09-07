const $ = (s) => document.querySelector(s);
const state = { user:null, advertiser:null, page:'dashboard', packages:[], events:[], bookings:[], campaigns:[], proofs:[], showrooms:[], selectedPackage:null, selectedEvent:null, selectedShowrooms:new Set() };
const STAFF = new Set(['sales','operations','admin']);

async function api(url, options={}) {
  const res = await fetch(url, { headers:{'Content-Type':'application/json',...(options.headers||{})}, ...options });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));}
function date(v){if(!v)return '—';const d=new Date(`${v}T12:00:00`);return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function status(v){return `<span class="status status-${esc(v)}">${esc(String(v||'—').replaceAll('-',' '))}</span>`;}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600);}

function showLogin(){ $('#adLogin').classList.remove('hidden'); $('#adApp').classList.add('hidden'); }
function pages(){
  if(STAFF.has(state.user?.role)) return [['setup','Setup','⚙'],['approvals','Creative Approval','✓'],['calendar','Event Calendar','▣']];
  return [['dashboard','Dashboard','⌂'],['book','Book Event','▣'],['campaigns','Campaigns','↑'],['proof','Proof','✓']];
}
function showApp(){
  $('#adLogin').classList.add('hidden'); $('#adApp').classList.remove('hidden');
  $('#adUser').innerHTML=`<strong>${esc(state.advertiser?.name||state.user.name)}</strong><small>${esc(state.user.role.replaceAll('_',' '))}</small>`;
  $('#adNav').innerHTML=pages().map(([id,label,icon])=>`<button class="nav-btn ${state.page===id?'active':''}" data-page="${id}" data-short="${icon}">${icon} ${label}</button>`).join('');
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;showApp();loadPage();});
}

async function refreshCore(){
  if(STAFF.has(state.user.role)) {
    const [packages,events,showrooms]=await Promise.all([api('/api/advertising/packages'),api('/api/advertising/events'),api('/api/advertising/showrooms')]);
    state.packages=packages.items;state.events=events.items;state.showrooms=showrooms.items;
  } else {
    const [packages,events,bookings,campaigns,proofs]=await Promise.all([api('/api/advertising/packages'),api('/api/advertising/events'),api('/api/advertising/bookings'),api('/api/advertising/campaigns'),api('/api/advertising/proofs')]);
    state.packages=packages.items;state.events=events.items;state.bookings=bookings.items;state.campaigns=campaigns.items;state.proofs=proofs.items;
  }
}

async function loadPage(){
  const titles={dashboard:'Advertising Dashboard',book:'Book an Event',campaigns:'Campaign Creative',proof:'Proof of Delivery',setup:'Advertising Setup',approvals:'Creative Approval',calendar:'Event Calendar'};
  $('#adTitle').textContent=titles[state.page]||'Advertising on the Go';
  $('#adContent').innerHTML='<div class="panel">Loading…</div>';
  try {
    await refreshCore();
    if(state.page==='dashboard') renderDashboard();
    if(state.page==='book') renderBook();
    if(state.page==='campaigns') renderCampaigns();
    if(state.page==='proof') renderProof();
    if(state.page==='setup') renderSetup();
    if(state.page==='approvals') await renderApprovals();
    if(state.page==='calendar') renderCalendar();
  } catch(error){ $('#adContent').innerHTML=`<div class="panel error">${esc(error.message)}</div>`; }
}

function renderDashboard(){
  const upcoming=state.bookings.filter(b=>!['cancelled','completed'].includes(b.status));
  const pending=state.bookings.filter(b=>b.status==='payment-pending').length;
  const submitted=state.campaigns.filter(c=>['submitted','approved','scheduled','live'].includes(c.status)).length;
  $('#adContent').innerHTML=`
    <div class="cards">
      <article class="card"><small>UPCOMING BOOKINGS</small><strong>${upcoming.length}</strong></article>
      <article class="card"><small>PAYMENT PENDING</small><strong>${pending}</strong></article>
      <article class="card"><small>CAMPAIGNS SUBMITTED</small><strong>${submitted}</strong></article>
      <article class="card"><small>PROOF RECORDS</small><strong>${state.proofs.length}</strong></article>
    </div>
    <div class="grid-2">
      <section class="panel"><h2>Upcoming events</h2>${upcoming.length?upcoming.slice(0,6).map(bookingRow).join(''):'<p class="muted">No upcoming event bookings yet.</p>'}</section>
      <section class="panel"><h2>Campaign status</h2>${state.campaigns.length?state.campaigns.slice(0,6).map(c=>`<div class="summary-row"><span><strong>${esc(c.name)}</strong><small>${esc(c.eventName)} • ${date(c.eventDate)}</small></span>${status(c.creativeStatus)}</div>`).join(''):'<p class="muted">No advertising campaigns yet.</p>'}</section>
    </div>
    <div class="policy"><strong>Booking sequence:</strong> Package → approved event calendar → Showroom 1 / Showroom 2 / both → campaign upload → Mirroried LED approval → scheduled display → verified proof.</div>`;
}
function bookingRow(b){return `<div class="summary-row"><span><strong>${esc(b.eventName)}</strong><small>${date(b.eventDate)} • ${esc(b.packageName)} • ${(b.showrooms||[]).map(s=>esc(s.publicLabel)).join(', ')}</small></span>${status(b.status)}</div>`;}

function renderBook(){
  const pkg=state.packages.find(p=>p.id===state.selectedPackage);
  const evt=state.events.find(e=>e.id===state.selectedEvent);
  $('#adContent').innerHTML=`
    <div class="stepbar"><span class="${!pkg?'active':''}">1 Package</span><span class="${pkg&&!evt?'active':''}">2 Event</span><span class="${pkg&&evt?'active':''}">3 Showroom + Campaign</span></div>
    <section class="panel"><h2>1. Choose your advertising package</h2><p class="muted">Your tier determines whether you can book one showroom or both showrooms for the selected event.</p>${state.packages.length?`<div class="package-grid">${state.packages.map(p=>`<article class="package-card ${p.id===state.selectedPackage?'selected':''}"><h3>${esc(p.name)}</h3><div class="price">${money(p.price)}</div><p class="muted">${esc(p.description||'Event advertising package')}</p><div class="meta"><span>Up to ${p.maxShowrooms} showroom${p.maxShowrooms===1?'':'s'}</span><span>${p.campaignUploadLimit?`${p.campaignUploadLimit} campaign upload(s)`:'Campaign upload included'}</span></div><button class="${p.id===state.selectedPackage?'secondary':'primary'}" data-pkg="${p.id}">${p.id===state.selectedPackage?'Selected':'Choose package'}</button></article>`).join('')}</div>`:'<p class="error">No advertising packages are currently available. Mirroried LED must configure package tiers first.</p>'}</section>
    ${pkg?`<section class="panel"><h2>2. Select an approved event</h2><p class="muted">Only dates Mirroried LED has made public for advertising appear here.</p>${state.events.length?`<div class="event-grid">${state.events.map(e=>`<article class="event-card ${e.id===state.selectedEvent?'selected':''}"><div>${status(e.status)}</div><h3>${esc(e.name)}</h3><p>${date(e.eventDate)}</p><p class="muted">${esc([e.venue,e.city,e.stateRegion].filter(Boolean).join(' • '))}</p><div class="meta"><span>${(e.showrooms||[]).filter(s=>s.status!=='sold-out').length} showroom option(s)</span></div><button class="${e.id===state.selectedEvent?'secondary':'primary'}" data-event="${e.id}">${e.id===state.selectedEvent?'Selected':'Choose event'}</button></article>`).join('')}</div>`:'<p class="muted">No public event dates are currently open for advertising.</p>'}</section>`:''}
    ${pkg&&evt?bookingFinal(pkg,evt):''}`;
  document.querySelectorAll('[data-pkg]').forEach(b=>b.onclick=()=>{state.selectedPackage=b.dataset.pkg;state.selectedEvent=null;state.selectedShowrooms.clear();renderBook();});
  document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>{state.selectedEvent=b.dataset.event;state.selectedShowrooms.clear();renderBook();});
  document.querySelectorAll('[data-showroom]').forEach(b=>b.onclick=()=>toggleShowroom(b.dataset.showroom,pkg));
  if($('#bookingForm')) $('#bookingForm').onsubmit=submitBooking;
}
function bookingFinal(pkg,evt){
  const rooms=(evt.showrooms||[]);
  return `<section class="panel"><h2>3. Select showroom(s) and name the campaign</h2><p class="muted">This package allows up to ${pkg.maxShowrooms} showroom${pkg.maxShowrooms===1?'':'s'} at this event.</p><div class="showroom-grid">${rooms.map(r=>{const blocked=['sold-out','unavailable','cancelled'].includes(r.status)||(r.availableSlots!==null&&r.availableSlots<=0);return `<article class="showroom-card ${state.selectedShowrooms.has(r.id)?'selected':''}"><div>${status(blocked?'sold-out':r.status)}</div><h3>${esc(r.publicLabel||r.name)}</h3><p class="muted">${r.availableSlots===null?'Availability managed by Mirroried LED':`${r.availableSlots} ad slot(s) remaining`}</p><button ${blocked?'disabled':''} class="${state.selectedShowrooms.has(r.id)?'secondary':'primary'}" data-showroom="${r.id}">${blocked?'Sold out':state.selectedShowrooms.has(r.id)?'Selected':'Select'}</button></article>`}).join('')}</div><form id="bookingForm" class="stack"><label>Campaign name<input id="bookingCampaignName" placeholder="Example: Fall Game Day Campaign" required></label><label>Campaign objective<textarea id="bookingObjective" rows="3" placeholder="What should this campaign communicate?"></textarea></label><label>Booking notes<textarea id="bookingNotes" rows="2" placeholder="Optional notes"></textarea></label><button class="primary" type="submit">Reserve Selected Event</button><p class="muted">${Number(pkg.price)>0?'This creates a reservation with payment-pending status. Payment processing is not yet connected to the portal.':'This package currently has no configured charge.'}</p></form></section>`;
}
function toggleShowroom(id,pkg){
  if(state.selectedShowrooms.has(id)) state.selectedShowrooms.delete(id);
  else {
    if(state.selectedShowrooms.size>=pkg.maxShowrooms){toast(`This package allows ${pkg.maxShowrooms} showroom(s).`);return;}
    state.selectedShowrooms.add(id);
  }
  renderBook();
}
async function submitBooking(e){
  e.preventDefault();
  if(!state.selectedShowrooms.size)return toast('Select at least one showroom.');
  try{
    const result=await api('/api/advertising/bookings',{method:'POST',body:JSON.stringify({packageId:state.selectedPackage,eventId:state.selectedEvent,showroomIds:[...state.selectedShowrooms],campaignName:$('#bookingCampaignName').value.trim(),objective:$('#bookingObjective').value.trim(),notes:$('#bookingNotes').value.trim()})});
    toast(result.status==='payment-pending'?'Event reserved — payment pending.':'Event reserved.');
    state.selectedEvent=null;state.selectedShowrooms.clear();state.page='campaigns';showApp();loadPage();
  }catch(error){toast(error.message);await loadPage();}
}

function renderCampaigns(){
  if(!state.campaigns.length){$('#adContent').innerHTML='<section class="panel"><h2>Campaign Creative</h2><p class="muted">Book an event first. A campaign record is created automatically with the reservation.</p></section>';return;}
  $('#adContent').innerHTML=`<section class="panel"><h2>Campaign Creative</h2><p class="muted">Upload the ad that should run for the booked event. Mirroried LED reviews the creative before scheduling.</p>${state.campaigns.map(c=>`<article class="panel"><div class="summary-row"><span><strong>${esc(c.name)}</strong><small>${esc(c.eventName)} • ${date(c.eventDate)}</small></span>${status(c.creativeStatus)}</div><div>${(c.assets||[]).length?(c.assets||[]).map(a=>`<div class="summary-row"><span><strong>${esc(a.name)}</strong><small>${esc(a.fileName)}</small></span>${status(a.status)}</div>`).join(''):'<p class="muted">No creative uploaded yet.</p>'}</div>${state.user.role==='advertiser_approver'?`<form class="uploadForm stack" data-campaign="${c.id}"><label>Creative name<input class="assetName" placeholder="Logo, video, display ad..."></label><label>File<input class="assetFile" type="file" accept="image/*,video/*,.pdf" required></label><button class="primary" type="submit">Upload for Review</button><small class="muted">Maximum file size: 2 MB.</small></form>`:''}</article>`).join('')}</section>`;
  document.querySelectorAll('.uploadForm').forEach(f=>f.onsubmit=uploadCreative);
}
async function uploadCreative(e){
  e.preventDefault();const form=e.currentTarget;const file=form.querySelector('.assetFile').files[0];if(!file)return;if(file.size>2*1024*1024)return toast('File exceeds 2 MB.');
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
  try{await api(`/api/advertising/campaigns/${form.dataset.campaign}/assets`,{method:'POST',body:JSON.stringify({fileName:file.name,name:form.querySelector('.assetName').value.trim()||file.name,dataUrl})});toast('Creative submitted for review.');loadPage();}catch(error){toast(error.message);}
}

function renderProof(){
  $('#adContent').innerHTML=`<section class="panel"><h2>Verified Proof of Delivery</h2><p class="muted">Only evidence recorded by Mirroried LED appears here.</p>${state.proofs.length?state.proofs.map(p=>`<div class="summary-row"><span><strong>${esc(p.title)}</strong><small>${esc(p.showroom||'Showroom')} • ${p.capturedAt?new Date(p.capturedAt).toLocaleString():'—'}${p.notes?` • ${esc(p.notes)}`:''}</small></span>${p.url?`<a href="${esc(p.url)}" target="_blank" rel="noopener">Open</a>`:status('completed')}</div>`).join(''):'<p class="muted">No proof records have been posted yet.</p>'}</section>`;
}

function renderCalendar(){
  $('#adContent').innerHTML=`<section class="panel"><h2>Advertising Event Calendar</h2><p class="muted">Staff view of configured events and showroom availability.</p><div class="event-grid">${state.events.map(e=>`<article class="event-card"><div>${status(e.status)}</div><h3>${esc(e.name)}</h3><p>${date(e.eventDate)}</p><p class="muted">${esc([e.venue,e.city,e.stateRegion].filter(Boolean).join(' • '))}</p>${(e.showrooms||[]).map(r=>`<div class="summary-row"><span><strong>${esc(r.publicLabel)}</strong><small>${r.availableSlots===null?'No numeric capacity':`${r.availableSlots} available / ${r.capacity}`}</small></span>${status(r.status)}</div>`).join('')}</article>`).join('')}</div></section>`;
}

function renderSetup(){
  const eventOptions=state.events.map(e=>`<option value="${e.id}">${esc(e.name)} — ${date(e.eventDate)}</option>`).join('');
  const showroomOptions=state.showrooms.map(s=>`<option value="${s.id}">${esc(s.publicLabel||s.name)}</option>`).join('');
  $('#adContent').innerHTML=`<div class="grid-2"><section class="panel"><h2>Create Package Tier</h2><form id="packageForm" class="admin-form"><label>Name<input id="pkgName" required></label><div class="row"><label>Price<input id="pkgPrice" type="number" min="0" step="0.01" required></label><label>Maximum showrooms<select id="pkgMax"><option value="1">1 showroom</option><option value="2">2 showrooms</option></select></label></div><label>Description<textarea id="pkgDesc" rows="3"></textarea></label><button class="primary">Create package</button></form></section><section class="panel"><h2>Add Showroom</h2><form id="showroomForm" class="admin-form"><label>Internal name<input id="shrName" required></label><label>Public label<input id="shrLabel" placeholder="Showroom 1" required></label><label>Type<select id="shrType"><option value="trailer">Trailer</option><option value="van">Van</option><option value="truck">Truck</option><option value="showroom">Showroom</option></select></label><button class="primary">Add showroom</button></form></section></div><div class="grid-2"><section class="panel"><h2>Add Event</h2><form id="eventForm" class="admin-form"><label>Event name<input id="evtName" required></label><div class="row"><label>Date<input id="evtDate" type="date" required></label><label>Status<select id="evtStatus"><option value="planned">Planned / private</option><option value="public">Public / bookable</option></select></label></div><label>Venue<input id="evtVenue"></label><div class="row"><label>City<input id="evtCity"></label><label>State / region<input id="evtState"></label></div><button class="primary">Create event</button></form></section><section class="panel"><h2>Assign Showroom to Event</h2>${state.events.length&&state.showrooms.length?`<form id="assignForm" class="admin-form"><label>Event<select id="assignEvent">${eventOptions}</select></label><label>Showroom<select id="assignShowroom">${showroomOptions}</select></label><label>Advertising slot capacity<input id="assignCapacity" type="number" min="0" placeholder="Leave blank if capacity is managed manually"></label><button class="primary">Make showroom bookable</button></form>`:'<p class="muted">Create at least one event and one showroom first.</p>'}</section></div><section class="panel"><h2>Current Package Tiers</h2>${state.packages.length?state.packages.map(p=>`<div class="summary-row"><span><strong>${esc(p.name)}</strong><small>${p.maxShowrooms} showroom max</small></span><b>${money(p.price)}</b></div>`).join(''):'<p class="muted">No packages configured.</p>'}</section>`;
  $('#packageForm').onsubmit=createPackage;$('#showroomForm').onsubmit=createShowroom;$('#eventForm').onsubmit=createEvent;if($('#assignForm'))$('#assignForm').onsubmit=assignShowroom;
}
async function createPackage(e){e.preventDefault();try{await api('/api/advertising/admin/packages',{method:'POST',body:JSON.stringify({name:$('#pkgName').value.trim(),price:Number($('#pkgPrice').value),maxShowrooms:Number($('#pkgMax').value),description:$('#pkgDesc').value.trim()})});toast('Package created.');loadPage();}catch(error){toast(error.message);}}
async function createShowroom(e){e.preventDefault();try{await api('/api/advertising/admin/showrooms',{method:'POST',body:JSON.stringify({name:$('#shrName').value.trim(),publicLabel:$('#shrLabel').value.trim(),assetType:$('#shrType').value})});toast('Showroom added.');loadPage();}catch(error){toast(error.message);}}
async function createEvent(e){e.preventDefault();try{await api('/api/advertising/admin/events',{method:'POST',body:JSON.stringify({name:$('#evtName').value.trim(),eventDate:$('#evtDate').value,venue:$('#evtVenue').value.trim(),city:$('#evtCity').value.trim(),stateRegion:$('#evtState').value.trim(),status:$('#evtStatus').value})});toast('Event created.');loadPage();}catch(error){toast(error.message);}}
async function assignShowroom(e){e.preventDefault();try{await api(`/api/advertising/admin/events/${$('#assignEvent').value}/showrooms`,{method:'POST',body:JSON.stringify({showroomId:$('#assignShowroom').value,adSlotCapacity:$('#assignCapacity').value})});toast('Showroom assigned to event.');loadPage();}catch(error){toast(error.message);}}

async function renderApprovals(){
  const data=await api('/api/advertising/admin/assets');
  $('#adContent').innerHTML=`<section class="panel"><h2>Creative Approval Queue</h2><p class="muted">Approve only creative that is ready to be scheduled on the booked showroom display.</p>${data.items.length?data.items.map(a=>`<div class="summary-row"><span><strong>${esc(a.advertiserName)} — ${esc(a.campaignName)}</strong><small>${esc(a.eventName)} • ${date(a.eventDate)} • ${esc(a.fileName)}</small></span><div><a href="${esc(a.url)}" target="_blank" rel="noopener">View</a> ${status(a.status)} ${a.status==='submitted'?`<button class="primary" data-approve="${a.id}">Approve</button> <button class="secondary" data-reject="${a.id}">Request Changes</button>`:''}</div></div>`).join(''):'<p class="muted">No advertising creative has been submitted.</p>'}</section>`;
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>decideAsset(b.dataset.approve,'approved'));
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>decideAsset(b.dataset.reject,'rejected'));
}
async function decideAsset(id,statusValue){try{await api(`/api/advertising/admin/assets/${id}`,{method:'PATCH',body:JSON.stringify({status:statusValue})});toast(statusValue==='approved'?'Creative approved.':'Changes requested.');renderApprovals();}catch(error){toast(error.message);}}

$('#adLoginForm').onsubmit=async(e)=>{
  e.preventDefault();$('#adLoginError').textContent='';
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify({email:$('#adEmail').value,password:$('#adPassword').value})});
    const me=await api('/api/advertising/me');state.user=me.user;state.advertiser=me.advertiser;state.page=STAFF.has(state.user.role)?'setup':'dashboard';showApp();loadPage();
  }catch(error){$('#adLoginError').textContent=error.message;}
};
$('#adLogout').onclick=async()=>{await api('/api/logout',{method:'POST'}).catch(()=>{});state.user=null;state.advertiser=null;showLogin();};

(async function boot(){
  try{const me=await api('/api/advertising/me');state.user=me.user;state.advertiser=me.advertiser;state.page=STAFF.has(state.user.role)?'setup':'dashboard';showApp();loadPage();}catch{showLogin();}
})();
