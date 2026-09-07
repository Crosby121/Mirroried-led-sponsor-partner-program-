const STORAGE_KEY = 'mirroried-led-advertising-on-the-go-v1';

const seedData = {
  campaigns: [
    {
      id: 'CMP-1001',
      name: 'West Coast Sports Launch',
      advertiser: 'Acme Demo Co.',
      status: 'Live',
      start: 'Sep 1, 2026',
      end: 'Sep 30, 2026',
      placements: ['Exterior Left LED Wall', 'Interior 36×36 Mirror #1', 'YouTube / Social'],
      deliverables: '3 / 5 complete'
    },
    {
      id: 'CMP-1002',
      name: 'October Event Push',
      advertiser: 'Acme Demo Co.',
      status: 'Scheduled',
      start: 'Oct 1, 2026',
      end: 'Oct 31, 2026',
      placements: ['36×22 Exterior Window', 'Interior 24×24 Mirror'],
      deliverables: '0 / 4 complete'
    },
    {
      id: 'CMP-1003',
      name: 'Local Partner Spotlight',
      advertiser: 'Demo Tire & Auto',
      status: 'Reserved',
      start: 'Sep 15, 2026',
      end: 'Dec 15, 2026',
      placements: ['Exterior Right LED Wall'],
      deliverables: '0 / 6 complete'
    }
  ],
  inventory: [
    { id:'SP-001', asset:'Trailer 001', name:'Exterior Left LED Wall', category:'Exterior', status:'Live', format:'Digital LED' },
    { id:'SP-002', asset:'Trailer 001', name:'Exterior Right LED Wall', category:'Exterior', status:'Reserved', format:'Digital LED' },
    { id:'SP-003', asset:'Trailer 001', name:'36×22 Exterior Window', category:'Exterior', status:'Reserved', format:'Infinity Mirror' },
    { id:'SP-004', asset:'Trailer 001', name:'26×18 Exterior Window', category:'Exterior', status:'Available', format:'Infinity Mirror' },
    { id:'SP-005', asset:'Trailer 001', name:'Interior 36×36 Mirror #1', category:'Interior', status:'Live', format:'Sponsor Mirror' },
    { id:'SP-006', asset:'Trailer 001', name:'Interior 36×36 Mirror #2', category:'Interior', status:'Available', format:'Sponsor Mirror' },
    { id:'SP-007', asset:'Trailer 001', name:'Interior 24×24 Mirror', category:'Interior', status:'Scheduled', format:'Sponsor Mirror' },
    { id:'SP-008', asset:'Digital Network', name:'YouTube / Social', category:'Digital', status:'Available', format:'Digital Content' }
  ],
  creative: [
    { id:'CR-1001', campaign:'CMP-1001', type:'Logo', file:'acme-primary-logo.svg', notes:'Primary campaign mark', status:'Approved', submitted:'Aug 28, 2026' },
    { id:'CR-1002', campaign:'CMP-1002', type:'Static Image', file:'october-campaign.jpg', notes:'Exterior window concept', status:'Pending', submitted:'Sep 6, 2026' }
  ],
  proof: [
    { id:'PF-1001', campaign:'West Coast Sports Launch', title:'Exterior LED placement', detail:'Trailer 001 • Approved event placement', date:'Sep 2, 2026', type:'Photo / log verified' },
    { id:'PF-1002', campaign:'West Coast Sports Launch', title:'Interior sponsor mirror', detail:'36×36 interior showroom placement', date:'Sep 2, 2026', type:'Photo verified' },
    { id:'PF-1003', campaign:'West Coast Sports Launch', title:'Digital mention', detail:'Approved social/video deliverable', date:'Sep 4, 2026', type:'Publication verified' }
  ]
};

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...structuredClone(seedData), ...JSON.parse(saved) } : structuredClone(seedData);
  } catch {
    return JSON.parse(JSON.stringify(seedData));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function slug(value='') { return value.toLowerCase().replace(/\s+/g,'-'); }
function pill(status) { return `<span class="status-pill ${slug(status)}">${esc(status.toUpperCase())}</span>`; }

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
}

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`${name}View`);
  if (target) target.classList.add('active');
  document.getElementById('mainNav')?.classList.remove('open');
  document.getElementById('navToggle')?.setAttribute('aria-expanded','false');
  window.scrollTo({top:0, behavior:'instant'});
  renderAll();
}

function switchPanel(panelId) {
  const target = document.getElementById(panelId);
  if (!target) return;
  const shell = target.closest('.portal-shell');
  shell.querySelectorAll('.portal-panel').forEach(p => p.classList.remove('active'));
  target.classList.add('active');
  shell.querySelectorAll('.portal-nav button').forEach(b => b.classList.toggle('active', b.dataset.panel === panelId));
  const titleMap = {
    'client-dashboard':'Dashboard','client-campaigns':'Campaigns','client-placements':'Advertising Spaces','client-creative':'Creative Upload','client-proof':'Proof of Delivery','client-billing':'Billing',
    'admin-dashboard':'Advertising Dashboard','admin-campaigns':'Campaign Management','admin-inventory':'Advertising Inventory','admin-creative':'Creative Approval','admin-network':'Fleet / Network'
  };
  if (panelId.startsWith('client-')) document.getElementById('clientTitle').textContent = titleMap[panelId];
  else document.getElementById('adminTitle').textContent = titleMap[panelId];
}

function renderStats() {
  const acmeCampaigns = state.campaigns.filter(c => c.advertiser === 'Acme Demo Co.');
  const active = acmeCampaigns.filter(c => ['Live','Scheduled','Reserved'].includes(c.status)).length;
  const clientStats = [
    ['ACTIVE / UPCOMING', active, 'campaigns in workflow'],
    ['PLACEMENTS', acmeCampaigns.reduce((n,c)=>n+c.placements.length,0), 'approved campaign spaces'],
    ['VERIFIED PROOF', state.proof.length, 'delivery records'],
    ['CREATIVE', state.creative.filter(c=>c.status==='Pending').length, 'awaiting review']
  ];
  document.getElementById('clientStats').innerHTML = clientStats.map(s => `<div class="stat-card"><small>${s[0]}</small><strong>${s[1]}</strong><span>${s[2]}</span></div>`).join('');

  const live = state.campaigns.filter(c=>c.status==='Live').length;
  const pendingCreative = state.creative.filter(c=>c.status==='Pending').length;
  const utilized = state.inventory.filter(i=>i.status!=='Available').length;
  const adminStats = [
    ['LIVE CAMPAIGNS', live, 'currently active'],
    ['CAMPAIGN PIPELINE', state.campaigns.length, 'total managed'],
    ['INVENTORY USED', `${utilized}/${state.inventory.length}`, 'reserved, scheduled or live'],
    ['CREATIVE QUEUE', pendingCreative, 'awaiting decision']
  ];
  document.getElementById('adminStats').innerHTML = adminStats.map(s => `<div class="stat-card"><small>${s[0]}</small><strong>${s[1]}</strong><span>${s[2]}</span></div>`).join('');
}

function renderCampaigns() {
  const client = state.campaigns.filter(c=>c.advertiser==='Acme Demo Co.');
  document.getElementById('clientCampaignSummary').innerHTML = client.slice(0,3).map(c => `<div class="summary-row"><span><strong>${esc(c.name)}</strong><small>${esc(c.start)} — ${esc(c.end)}</small></span>${pill(c.status)}</div>`).join('') || '<p>No campaigns yet.</p>';
  document.getElementById('clientCampaignTable').innerHTML = client.map(c => `<tr><td><strong>${esc(c.name)}</strong><br><small>${esc(c.id)}</small></td><td>${pill(c.status)}</td><td>${esc(c.start)}<br>${esc(c.end)}</td><td>${c.placements.length}</td><td>${esc(c.deliverables)}</td></tr>`).join('');

  document.getElementById('adminCampaignSummary').innerHTML = state.campaigns.map(c => `<div class="summary-row"><span><strong>${esc(c.name)}</strong><small>${esc(c.advertiser)} • ${esc(c.start)}</small></span>${pill(c.status)}</div>`).join('');

  const statusOptions = ['Reserved','Scheduled','Live','Completed'];
  document.getElementById('adminCampaignTable').innerHTML = state.campaigns.map(c => `<tr><td><strong>${esc(c.name)}</strong><br><small>${esc(c.id)}</small></td><td>${esc(c.advertiser)}</td><td>${pill(c.status)}</td><td>${esc(c.start)} — ${esc(c.end)}</td><td><select class="campaign-status" data-id="${esc(c.id)}">${statusOptions.map(s=>`<option ${s===c.status?'selected':''}>${s}</option>`).join('')}</select></td></tr>`).join('');

  document.getElementById('creativeCampaign').innerHTML = client.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

function inventoryCard(item, admin=false) {
  return `<article class="inventory-card"><div class="inventory-top"><div><h4>${esc(item.name)}</h4><small>${esc(item.id)} • ${esc(item.asset)}</small></div>${pill(item.status)}</div><p>${esc(item.format)} advertising placement.</p><div class="inventory-meta"><span>${esc(item.category)}</span><span>${esc(item.asset)}</span></div>${admin ? `<select class="inventory-status" data-id="${esc(item.id)}"><option ${item.status==='Available'?'selected':''}>Available</option><option ${item.status==='Reserved'?'selected':''}>Reserved</option><option ${item.status==='Scheduled'?'selected':''}>Scheduled</option><option ${item.status==='Live'?'selected':''}>Live</option></select>` : ''}</article>`;
}

function renderInventory() {
  document.getElementById('clientInventory').innerHTML = state.inventory.map(i=>inventoryCard(i,false)).join('');
  document.getElementById('adminInventory').innerHTML = state.inventory.map(i=>inventoryCard(i,true)).join('');
  const upcoming = state.inventory.filter(i=>['Reserved','Scheduled','Live'].includes(i.status)).slice(0,4);
  document.getElementById('clientPlacementSummary').innerHTML = upcoming.map(i=>`<div class="summary-row"><span><strong>${esc(i.name)}</strong><small>${esc(i.asset)} • ${esc(i.format)}</small></span>${pill(i.status)}</div>`).join('');

  const counts = ['Available','Reserved','Scheduled','Live'].map(s => ({s,n:state.inventory.filter(i=>i.status===s).length}));
  const total = Math.max(1,state.inventory.length);
  document.getElementById('utilizationChart').innerHTML = counts.map(x => `<div style="margin:14px 0"><div style="display:flex;justify-content:space-between;font-size:11px"><span>${x.s}</span><b>${x.n}</b></div><div class="meter"><span style="width:${Math.round((x.n/total)*100)}%"></span></div></div>`).join('');
}

function renderCreative() {
  const clientItems = state.creative.filter(c => state.campaigns.find(x=>x.id===c.campaign)?.advertiser === 'Acme Demo Co.');
  document.getElementById('creativeSubmissions').innerHTML = clientItems.map(c => `<div><span><strong>${esc(c.file)}</strong><small>${esc(c.type)} • ${esc(c.submitted)}</small></span>${pill(c.status)}</div>`).join('') || '<p>No creative submissions yet.</p>';

  const queue = state.creative.filter(c=>c.status==='Pending');
  document.getElementById('adminCreativeQueue').innerHTML = queue.map(c => {
    const campaign = state.campaigns.find(x=>x.id===c.campaign);
    return `<div><span><strong>${esc(c.file)}</strong><small>${esc(c.type)} • ${esc(campaign?.name || c.campaign)} • ${esc(c.notes)}</small></span><span style="display:flex;gap:8px"><button class="btn btn-primary creative-action" data-id="${esc(c.id)}" data-status="Approved">Approve</button><button class="btn btn-outline creative-action" data-id="${esc(c.id)}" data-status="Rejected">Reject</button></span></div>`;
  }).join('') || '<p style="color:var(--muted)">No creative is currently awaiting approval.</p>';
}

function renderProof() {
  document.getElementById('proofList').innerHTML = state.proof.map(p => `<article class="proof-card"><div class="proof-icon">✓</div><h4>${esc(p.title)}</h4><p>${esc(p.campaign)}<br>${esc(p.detail)}</p><small>${esc(p.date)} • ${esc(p.type)}</small></article>`).join('');
}

function renderAll() {
  renderStats();
  renderCampaigns();
  renderInventory();
  renderCreative();
  renderProof();
}

document.addEventListener('click', e => {
  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) switchView(viewBtn.dataset.view);

  const panelBtn = e.target.closest('[data-panel]');
  if (panelBtn) switchPanel(panelBtn.dataset.panel);

  const jumpBtn = e.target.closest('[data-panel-jump]');
  if (jumpBtn) switchPanel(jumpBtn.dataset.panelJump);

  const creativeAction = e.target.closest('.creative-action');
  if (creativeAction) {
    const item = state.creative.find(c=>c.id===creativeAction.dataset.id);
    if (item) {
      item.status = creativeAction.dataset.status;
      saveState();
      renderAll();
      showToast(`Creative ${item.status.toLowerCase()}.`);
    }
  }

  if (e.target.closest('#addCampaignBtn')) {
    const n = state.campaigns.length + 1;
    state.campaigns.push({
      id:`CMP-10${String(n).padStart(2,'0')}`,
      name:`New Campaign ${n}`,
      advertiser:'New Advertiser',
      status:'Reserved',
      start:'TBD',
      end:'TBD',
      placements:[],
      deliverables:'0 / 0 complete'
    });
    saveState();
    renderAll();
    showToast('Demo campaign added.');
  }
});

document.addEventListener('change', e => {
  if (e.target.matches('.campaign-status')) {
    const campaign = state.campaigns.find(c=>c.id===e.target.dataset.id);
    if (campaign) {
      campaign.status = e.target.value;
      saveState();
      renderAll();
      showToast('Campaign status updated.');
    }
  }
  if (e.target.matches('.inventory-status')) {
    const item = state.inventory.find(i=>i.id===e.target.dataset.id);
    if (item) {
      item.status = e.target.value;
      saveState();
      renderAll();
      showToast('Advertising space updated.');
    }
  }
});

document.getElementById('creativeForm').addEventListener('submit', e => {
  e.preventDefault();
  const fileInput = document.getElementById('creativeFile');
  const file = fileInput.files[0];
  const id = `CR-${1000 + state.creative.length + 1}`;
  state.creative.push({
    id,
    campaign:document.getElementById('creativeCampaign').value,
    type:document.getElementById('creativeType').value,
    file:file ? file.name : 'Creative details / URL submission',
    notes:document.getElementById('creativeNotes').value || 'No notes provided',
    status:'Pending',
    submitted:new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
  });
  saveState();
  e.target.reset();
  renderAll();
  showToast('Creative submitted for review.');
});

document.getElementById('navToggle').addEventListener('click', () => {
  const nav = document.getElementById('mainNav');
  const open = nav.classList.toggle('open');
  document.getElementById('navToggle').setAttribute('aria-expanded', String(open));
});

renderAll();
