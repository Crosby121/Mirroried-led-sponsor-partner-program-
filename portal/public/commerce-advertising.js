const commerceStaffRoles = new Set(['sales','operations','admin']);
const commerceOriginalPages = pages;
const commerceOriginalLoadPage = loadPage;

pages = function commercePages(){
  const items = commerceOriginalPages();
  if (commerceStaffRoles.has(state.user?.role)) {
    if (!items.some(x=>x[0]==='payments')) items.splice(1,0,['payments','Payments','$']);
  } else {
    if (!items.some(x=>x[0]==='checkout')) items.splice(2,0,['checkout','Checkout','$']);
  }
  return items;
};

loadPage = async function commerceLoadPage(){
  if (state.page === 'checkout') {
    $('#adTitle').textContent = 'Checkout & Payment';
    $('#adContent').innerHTML = '<div class="panel">Loading checkout…</div>';
    try { await renderAdvertisingCheckout(); } catch (error) { $('#adContent').innerHTML=`<div class="panel error">${esc(error.message)}</div>`; }
    return;
  }
  if (state.page === 'payments') {
    $('#adTitle').textContent = 'Advertising Payments';
    $('#adContent').innerHTML = '<div class="panel">Loading payment ledger…</div>';
    try { await renderAdvertisingPayments(); } catch (error) { $('#adContent').innerHTML=`<div class="panel error">${esc(error.message)}</div>`; }
    return;
  }
  return commerceOriginalLoadPage();
};

async function renderAdvertisingCheckout(){
  const data = await api('/api/commerce/advertising/checkout');
  const items = data.items || [];
  const outstanding = items.filter(x=>Number(x.balanceDue)>0 && !['cancelled','completed'].includes(x.status));
  $('#adContent').innerHTML = `
    <div class="policy"><strong>Payment safety:</strong> This portal does not collect or store raw card or bank credentials. Until a payment processor is connected, checkout creates an invoice/payment request and Mirroried LED records verified payment separately.</div>
    <div class="cards">
      <article class="card"><small>OUTSTANDING BOOKINGS</small><strong>${outstanding.length}</strong></article>
      <article class="card"><small>TOTAL BALANCE DUE</small><strong>${money(outstanding.reduce((n,x)=>n+Number(x.balanceDue||0),0))}</strong></article>
      <article class="card"><small>PROCESSOR</small><strong>${data.processorConnected?'CONNECTED':'NOT CONNECTED'}</strong></article>
    </div>
    <section class="panel">
      <h2>Booking Checkout</h2>
      <p class="muted">A booking becomes <strong>Confirmed</strong> only after the full package balance has been recorded as paid.</p>
      ${items.length ? items.map(checkoutBookingCard).join('') : '<p class="muted">No advertising bookings yet.</p>'}
    </section>`;
  document.querySelectorAll('[data-request-invoice]').forEach(b=>b.onclick=()=>requestAdvertisingInvoice(b.dataset.requestInvoice));
}

function checkoutBookingCard(item){
  const balance = Number(item.balanceDue||0);
  const requestStatus = item.paymentRequestStatus ? status(item.paymentRequestStatus) : '<span class="status">not requested</span>';
  return `<article class="checkout-card">
    <div class="summary-row"><span><strong>${esc(item.eventName)}</strong><small>${date(item.eventDate)} • ${esc(item.packageName)}</small></span>${status(item.status)}</div>
    <div class="checkout-totals">
      <div><small>PACKAGE</small><strong>${money(item.packagePrice)}</strong></div>
      <div><small>PAID</small><strong>${money(item.amountPaid)}</strong></div>
      <div><small>BALANCE</small><strong>${money(balance)}</strong></div>
    </div>
    <div class="summary-row"><span><strong>Invoice / payment request</strong><small>${item.paymentRequestReference?esc(item.paymentRequestReference):'No request created yet'}</small></span>${requestStatus}</div>
    ${balance>0 && state.user.role==='advertiser_approver' ? `<button class="primary" data-request-invoice="${esc(item.bookingId)}">${item.paymentRequestId?'View / Reuse Invoice Request':'Request Invoice / Payment Instructions'}</button>` : ''}
    ${balance<=0 ? '<p class="success-line">Paid in full. Booking payment requirement is complete.</p>' : ''}
  </article>`;
}

async function requestAdvertisingInvoice(bookingId){
  try {
    const result = await api(`/api/commerce/advertising/bookings/${bookingId}/request-invoice`, {method:'POST',body:JSON.stringify({})});
    toast(result.existing?'Existing payment request is still active.':'Invoice/payment request created.');
    await renderAdvertisingCheckout();
  } catch (error) { toast(error.message); }
}

async function renderAdvertisingPayments(){
  const data = await api('/api/commerce/advertising/admin/payments');
  const due = (data.bookings||[]).filter(x=>Number(x.balanceDue)>0 && !['cancelled','completed'].includes(x.status));
  $('#adContent').innerHTML = `
    <div class="policy"><strong>Staff payment rule:</strong> Record only a payment Mirroried LED has actually verified. Do not enter card numbers, bank credentials or other sensitive payment data here.</div>
    <div class="cards">
      <article class="card"><small>PAYMENT-PENDING</small><strong>${due.length}</strong></article>
      <article class="card"><small>OPEN BALANCE</small><strong>${money(due.reduce((n,x)=>n+Number(x.balanceDue||0),0))}</strong></article>
      <article class="card"><small>RECORDED PAYMENTS</small><strong>${(data.payments||[]).length}</strong></article>
    </div>
    <section class="panel"><h2>Outstanding Advertising Bookings</h2>
      ${due.length ? due.map(paymentAdminCard).join('') : '<p class="muted">No outstanding paid-package bookings.</p>'}
    </section>
    <section class="panel"><h2>Payment Ledger</h2>
      ${(data.payments||[]).length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Advertiser</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead><tbody>${data.payments.map(p=>`<tr><td>${p.paidAt?new Date(p.paidAt).toLocaleString():'—'}</td><td>${esc(p.advertiserName)}</td><td>${money(p.amount)}</td><td>${esc(p.paymentMethod)}</td><td>${esc(p.providerReference||'—')}</td><td>${status(p.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No payments recorded yet.</p>'}
    </section>`;
  document.querySelectorAll('.record-payment-form').forEach(f=>f.onsubmit=recordAdvertisingPayment);
}

function paymentAdminCard(item){
  return `<article class="checkout-card">
    <div class="summary-row"><span><strong>${esc(item.advertiserName)}</strong><small>${esc(item.eventName)} • ${date(item.eventDate)} • ${esc(item.packageName)}</small></span>${status(item.status)}</div>
    <div class="checkout-totals"><div><small>PACKAGE</small><strong>${money(item.packagePrice)}</strong></div><div><small>PAID</small><strong>${money(item.amountPaid)}</strong></div><div><small>DUE</small><strong>${money(item.balanceDue)}</strong></div></div>
    <div class="summary-row"><span><strong>Payment request</strong><small>${esc(item.paymentRequestReference||'Not requested')}</small></span>${item.paymentRequestStatus?status(item.paymentRequestStatus):''}</div>
    <form class="record-payment-form stack" data-booking="${esc(item.bookingId)}">
      <label>Verified amount received<input class="paymentAmount" type="number" min="0.01" step="0.01" max="${Number(item.balanceDue)}" value="${Number(item.balanceDue).toFixed(2)}" required></label>
      <label>Payment method<select class="paymentMethod"><option value="invoice">Invoice / external payment</option><option value="ach">ACH</option><option value="check">Check</option><option value="cash">Cash</option><option value="card">Card via external processor</option><option value="other">Other</option></select></label>
      <label>Provider / receipt reference<input class="paymentReference" placeholder="Receipt, transaction, check or processor reference"></label>
      <label>Internal note<input class="paymentNote" placeholder="Optional verification note"></label>
      <button class="primary" type="submit">Record Verified Payment</button>
    </form>
  </article>`;
}

async function recordAdvertisingPayment(e){
  e.preventDefault();
  const form=e.currentTarget;
  try {
    const result=await api(`/api/commerce/advertising/admin/bookings/${form.dataset.booking}/record-payment`, {
      method:'POST',
      body:JSON.stringify({
        amount:Number(form.querySelector('.paymentAmount').value),
        paymentMethod:form.querySelector('.paymentMethod').value,
        providerReference:form.querySelector('.paymentReference').value.trim(),
        notes:form.querySelector('.paymentNote').value.trim()
      })
    });
    toast(result.bookingStatus==='confirmed'?'Payment recorded — booking confirmed.':'Partial payment recorded.');
    await renderAdvertisingPayments();
  } catch (error) { toast(error.message); }
}

submitBooking = async function commerceSubmitBooking(e){
  e.preventDefault();
  if(!state.selectedShowrooms.size)return toast('Select at least one showroom.');
  try{
    const result=await api('/api/advertising/bookings',{method:'POST',body:JSON.stringify({packageId:state.selectedPackage,eventId:state.selectedEvent,showroomIds:[...state.selectedShowrooms],campaignName:$('#bookingCampaignName').value.trim(),objective:$('#bookingObjective').value.trim(),notes:$('#bookingNotes').value.trim()})});
    state.selectedEvent=null;state.selectedShowrooms.clear();
    state.page=result.status==='payment-pending'?'checkout':'campaigns';
    toast(result.status==='payment-pending'?'Event reserved — complete checkout next.':'Event reserved.');
    showApp();loadPage();
  }catch(error){toast(error.message);await loadPage();}
};
