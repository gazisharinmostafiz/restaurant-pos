import * as api from './api.js';
import * as ui from './ui.js';
import { getState, setState, setCurrentOrder, addItemToOrder, clearCurrentOrder } from './state.js';

let salesChart = null;

function roleBoot(role) {
  const all = ['#menu-section', '#pending-orders-section', '#order-section', '#queue-section', '#admin-dashboard-section'];
  const adminOnlySidebar = ['#manage-stock-sidebar-item', '#manage-users-sidebar-item'];
  const adminOnlyHeader = ['#z-report-btn', '#profit-loss-btn'];
  [...all, ...adminOnlySidebar, ...adminOnlyHeader, '#add-order-btn', '#view-old-orders-btn'].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.style.display = 'none';
  });
  let vis = [];
  switch (role) {
    case 'admin':
    case 'superadmin':
      vis = ['#admin-dashboard-section', ...adminOnlySidebar, ...adminOnlyHeader];
      break;
    case 'front': vis = ['#menu-section', '#pending-orders-section', '#order-section', '#add-order-btn', '#view-old-orders-btn']; break;
    case 'waiter': vis = ['#menu-section', '#order-section', '#add-order-btn']; break;
    case 'kitchen': vis = ['#queue-section']; break;
  }
  vis.forEach(sel => { const el = document.querySelector(sel); if (el) el.style.display = ''; });
  if (role === 'admin' || role === 'superadmin') adminOnlySidebar.forEach(sel => { const el = document.querySelector(sel); if (el) el.style.display = 'list-item'; });

  const superLinks = document.querySelectorAll("#sidebar-nav a[href^='/admin/']");
  const superTitle = Array.from(document.querySelectorAll('#sidebar-nav .nav-title')).find(title => (title.textContent || '').toLowerCase().includes('super admin'));
  const showSuper = role === 'superadmin';
  superLinks.forEach(link => { const li = link.closest('.nav-item'); if (li) li.style.display = showSuper ? '' : 'none'; });
  if (superTitle) superTitle.style.display = showSuper ? '' : 'none';
}

export async function initializeApp() {
  try {
    const data = await api.checkSession();
    if (data.loggedIn) {
      setState({ currentUser: data.user, currentUserRole: data.user.role });
      ui.showDashboard();
      const role = data.user.role;
      roleBoot(role);
      await fetchMenu();
      if (role === 'admin' || role === 'superadmin') fetchAdminDashboardData();
      if (role === 'admin' || role === 'superadmin' || role === 'front') { fetchPendingOrdersForPayment(); setInterval(fetchPendingOrdersForPayment, 15000); }
      if (role === 'admin' || role === 'superadmin' || role === 'kitchen') { fetchOrderQueue(); setInterval(fetchOrderQueue, 10000); }
    } else {
      ui.showLoginScreen();
    }
  } catch {
    ui.showToast('Cannot connect to server.', 'error');
  }
}

async function fetchAdminDashboardData() {
  try { const summary = await api.getAdminDashboardSummary(); ui.renderAdminDashboard(summary); } catch {}
}

export async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const data = await api.login(username, password);
    if (data.success) await initializeApp(); else ui.showToast(data.error || 'Login failed.', 'error');
  } catch { ui.showToast('Error during login.', 'error'); }
}

export async function handleLogout() { await api.logout(); setState({ currentUser: null, currentUserRole: '', currentOrder: [], selectedOrderId: null }); ui.showLoginScreen(); ui.renderOrder(); }

export function handleNewOrder() { clearCurrentOrder(); document.querySelectorAll('.pending-order-item.selected').forEach(el => el.classList.remove('selected')); document.getElementById('place-order-btn').disabled = false; ui.showToast('Ready to create a new order.'); ui.renderOrder(); }

export async function handlePlaceOrder() {
  const { currentOrder } = getState();
  if (!currentOrder.length) return ui.showToast('Cannot place an empty order.', 'error');
  const orderType = document.getElementById('order-type-select').value;
  const destination = (orderType === 'table') ? `Table ${document.getElementById('table-select').value}` : 'Takeaway';
  const orderData = { orderType, destination, items: currentOrder };
  if (orderType === 'table') {
    try {
      const data = await api.getPendingOrders();
      const open = (data.orders||[]).find(o => o.destination===destination && (o.status==='pending'||o.status==='ready'));
      if (open) {
        setState({ tableOrderDecision: { existingOrderId: open.id, orderData } });
        const m=document.getElementById('table-order-confirm-modal');
        const t=document.getElementById('table-order-confirm-text');
        if (t) t.textContent = `${destination} already has an open order (#${open.id}). Add items to existing order or create a new order?`;
        if (m) m.style.display='block';
        // auto-append when user initiated "Add to Existing" from table card
        const prefer = (getState().preferAppend || window.preferAppend);
        if (prefer) { setState({ preferAppend: false }); window.preferAppend = false; await confirmAddToExistingTableOrder(); }
        return;
      }
    } catch {}
  }
  try {
    const result = await api.placeOrder(orderData);
    if (result.orderId) { ui.showToast(`Order #${result.orderId} sent to the kitchen!`, 'success'); clearCurrentOrder(); ui.renderOrder(); await fetchMenu(); }
    else ui.showToast(result.error || 'Failed to place order.', 'error');
  } catch { ui.showToast('Error connecting to the server to place order.', 'error'); }
}

export async function confirmAddToExistingTableOrder() {
  const decision = getState().tableOrderDecision; if (!decision) return; try { const res = await api.appendOrderItems(decision.existingOrderId, decision.orderData.items); if (res && res.success) { ui.showToast(`Items added to order #${decision.existingOrderId}.`, 'success'); clearCurrentOrder(); ui.renderOrder(); } else ui.showToast(res.error || 'Failed to append items.', 'error'); } catch { ui.showToast('Error connecting to server.', 'error'); } finally { const m=document.getElementById('table-order-confirm-modal'); if (m) m.style.display='none'; }
}

export async function confirmCreateNewTableOrder() {
  const decision = getState().tableOrderDecision; if (!decision) return; try { const result = await api.placeOrder(decision.orderData); if (result.orderId) { ui.showToast(`Order #${result.orderId} sent to the kitchen!`, 'success'); clearCurrentOrder(); ui.renderOrder(); } else ui.showToast(result.error || 'Failed to place order.', 'error'); } catch { ui.showToast('Error connecting to the server to place order.', 'error'); } finally { const m=document.getElementById('table-order-confirm-modal'); if (m) m.style.display='none'; }
}

export function handleCategorySelect(category) { ui.activateCategoryPane(category); ui.displayCategoryTabItems(category); ui.updateActiveTabStockBadges?.(); document.querySelectorAll('.menu-categories .nav-link').forEach(l=>l.classList.remove('active')); const el=document.querySelector(`.menu-categories .nav-link[data-category="${category}"]`); if (el) el.classList.add('active'); }

export function handleLookupAdd() { const input=document.getElementById('lookup-input'); if (!input) return; const term=(input.value||'').trim().toLowerCase(); if (!term) return; const { menu }=getState(); const all=Object.values(menu||{}).flat(); let found=null; if (/^\d+$/.test(term)) { const idNum=parseInt(term,10); found=all.find(i=>i.id===idNum); } if (!found) found=all.find(i=>(i.name||'').toLowerCase().includes(term)); if (!found) return ui.showToast('Item not found.', 'error'); addItemToOrder(found); ui.renderOrder(); input.value=''; }

export function suspendCurrentSale() { const { currentOrder }=getState(); if (!currentOrder || !currentOrder.length) return ui.showToast('No items to suspend.', 'error'); const key='suspendedSales'; const list=JSON.parse(localStorage.getItem(key)||'[]'); list.push({ id: Date.now(), at: new Date().toISOString(), order: currentOrder }); localStorage.setItem(key, JSON.stringify(list)); clearCurrentOrder(); ui.renderOrder(); ui.showToast('Sale suspended.'); }

export function openSuspendedSalesModal() { const modal=document.getElementById('suspended-sales-modal'); const listEl=document.getElementById('suspended-sales-list'); if (!modal||!listEl) return; const list=JSON.parse(localStorage.getItem('suspendedSales')||'[]'); listEl.innerHTML=''; if (!list.length) { listEl.innerHTML='<li class="list-group-item">No suspended sales.</li>'; } else { list.forEach(t=>{ const li=document.createElement('li'); li.className='list-group-item d-flex justify-content-between align-items-center'; const total=t.order.reduce((s,it)=>s+it.price*it.quantity,0); li.innerHTML=`<span>Ticket ${t.id} — ${new Date(t.at).toLocaleString()} — Total £${total.toFixed(2)}</span><div class="btn-group"><button class="btn btn-sm btn-primary" data-action="resume" data-id="${t.id}">Resume</button><button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${t.id}">Delete</button></div>`; listEl.appendChild(li); }); listEl.onclick=(e)=>{ const btn=e.target.closest('button'); if (!btn) return; const id=parseInt(btn.dataset.id,10); let list=JSON.parse(localStorage.getItem('suspendedSales')||'[]'); const idx=list.findIndex(x=>x.id===id); if (idx===-1) return; if (btn.dataset.action==='resume') { setState({ currentOrder: list[idx].order }); ui.renderOrder(); list.splice(idx,1); localStorage.setItem('suspendedSales', JSON.stringify(list)); modal.style.display='none'; ui.showToast('Sale resumed.'); } else if (btn.dataset.action==='delete') { list.splice(idx,1); localStorage.setItem('suspendedSales', JSON.stringify(list)); btn.closest('li').remove(); } }; }
  modal.style.display='block'; }

function receiptText(orderItems, title='Receipt') { const lines=[title,'------------------------------']; let total=0; orderItems.forEach(it=>{ lines.push(`${it.name} x ${it.quantity} = £${(it.price*it.quantity).toFixed(2)}`); total+=it.price*it.quantity; }); lines.push('------------------------------'); lines.push(`Total: £${total.toFixed(2)}`); return lines.join('\n'); }
export function printReceipt() { const { currentOrder }=getState(); if (!currentOrder||!currentOrder.length) return ui.showToast('No items to print.', 'error'); const text=receiptText(currentOrder,'Tong POS - Provisional Receipt'); const w=window.open('','PRINT','height=650,width=900,top=100,left=150'); if (!w) return; w.document.write(`<pre style="font-family:monospace">${text}</pre>`); w.document.close(); w.focus(); w.print(); w.close(); }
export function emailReceipt() { const { currentOrder }=getState(); if (!currentOrder||!currentOrder.length) return ui.showToast('No items to email.', 'error'); const text=encodeURIComponent(receiptText(currentOrder,'Tong POS - Receipt')); window.location.href=`mailto:?subject=Your%20Tong%20POS%20Receipt&body=${text}`; }

export function handleAddItemToOrder(itemElement) { const { menu }=getState(); const name=itemElement.dataset.name; for (const cat in menu) { const item=menu[cat].find(i=>i.name===name); if (item) { addItemToOrder(item); ui.renderOrder(); ui.updateActiveTabStockBadges?.(); return; } } }
export function handleRemoveItem(index) { const { currentOrder }=getState(); currentOrder.splice(index,1); ui.renderOrder(); ui.updateActiveTabStockBadges?.(); }
export function handleUpdateQuantity(index, action) { const { currentOrder }=getState(); const item=currentOrder[index]; if (action==='increment') item.quantity++; else if (item.quantity>1) item.quantity--; else handleRemoveItem(index); ui.renderOrder(); ui.updateActiveTabStockBadges?.(); }

export function handleSelectPendingOrder(target) { const orderId=target.dataset.orderId; const orderItems=JSON.parse(target.dataset.items||'[]'); document.querySelectorAll('.pending-order-item.selected').forEach(el=>el.classList.remove('selected')); target.classList.add('selected'); setState({ selectedOrderId: orderId }); setCurrentOrder(orderItems); const btn=document.getElementById('place-order-btn'); if (btn) btn.disabled=true; ui.renderOrder(); (async()=>{ try{ const data=await api.getPendingOrders(); const match=(data.orders||[]).find(o=>String(o.id)===String(orderId)); if (match && typeof match.balance!=='undefined') setState({ selectedOrderBalance: Number(match.balance) }); } catch {} })(); }

// Multi-order (same table)
export async function openPaySelectedModal() { const { selectedOrderId }=getState(); if (!selectedOrderId) return ui.showToast('Select an order first.', 'error'); try{ const data=await api.getPendingOrders(); const list=data.orders||[]; const selected=list.find(o=>String(o.id)===String(selectedOrderId)); if (!selected) return ui.showToast('Order not found in pending list.', 'error'); const group=list.filter(o=>o.destination===selected.destination && (o.status==='pending'||o.status==='ready')); setState({ selectedGroupOrderIds: group.map(o=>o.id) }); const m=document.getElementById('pay-selected-modal'); if (m) m.style.display='block'; } catch { ui.showToast('Could not open Pay Selected.', 'error'); } }
export async function processPaySelectedFull() { const ids=(getState().selectedGroupOrderIds)||[]; if (!ids.length) return ui.showToast('No orders selected.', 'error'); const method=(document.querySelector('input[name="pay-selected-method"]:checked')||{value:'cash'}).value; try{ const data=await api.getPendingOrders(); const list=data.orders||[]; for (const id of ids){ const o=list.find(x=>String(x.id)===String(id)); if (!o) continue; const bal=Number(o.balance||0); if (bal>0) await api.addOrderPayment(id, method, bal); } ui.showToast('Selected orders paid in full.', 'success'); } catch { ui.showToast('Failed to pay selected orders.', 'error'); } finally { const m=document.getElementById('pay-selected-modal'); if (m) m.style.display='none'; setState({ selectedGroupOrderIds: [], selectedOrderId: null, selectedOrderBalance: null, activePaymentMethod: null }); clearCurrentOrder(); ui.renderOrder(); if (typeof fetchPendingOrdersForPayment==='function') fetchPendingOrdersForPayment(); } }
export async function processPaySelectedPartial() { const ids=(getState().selectedGroupOrderIds)||[]; if (!ids.length) return ui.showToast('No orders selected.', 'error'); const method=(document.querySelector('input[name="pay-selected-method"]:checked')||{value:'cash'}).value; const amtInput=document.getElementById('pay-selected-amount'); const totalAmt=parseFloat(amtInput&&amtInput.value||''); if (!(totalAmt>0)) return ui.showToast('Enter amount to distribute.', 'error'); try{ const data=await api.getPendingOrders(); const list=data.orders||[]; let remaining=totalAmt; for (const id of ids){ if (remaining<=0) break; const o=list.find(x=>String(x.id)===String(id)); if (!o) continue; const bal=Number(o.balance||0); if (bal<=0) continue; const apply=Math.min(bal, remaining); await api.addOrderPayment(id, method, apply); remaining-=apply; } ui.showToast(`Paid £${(totalAmt-remaining).toFixed(2)} across selected orders.`, 'success'); } catch { ui.showToast('Failed to pay selected orders.', 'error'); } finally { const m=document.getElementById('pay-selected-modal'); if (m) m.style.display='none'; setState({ selectedGroupOrderIds: [], selectedOrderId: null, selectedOrderBalance: null, activePaymentMethod: null }); clearCurrentOrder(); ui.renderOrder(); if (typeof fetchPendingOrdersForPayment==='function') fetchPendingOrdersForPayment(); } }

export function openPaymentModal(method) { const { selectedOrderId, currentOrder }=getState(); if (!selectedOrderId) return ui.showToast('Please select a pending order first.', 'error'); if (!currentOrder.length) return ui.showToast('No items to pay for.', 'error'); setState({ activePaymentMethod: method }); updatePaymentDetails(true); document.getElementById('payment-modal').style.display='block'; }

export function updatePaymentDetails(reset=false) { const { currentOrder, selectedOrderBalance }=getState(); const amountTenderedInput=document.getElementById('amount-tendered'); const dpEl=document.getElementById('discount-percent'); const dcEl=document.getElementById('discount-cash'); if (reset){ if (dpEl) dpEl.value=''; if (dcEl) dcEl.value=''; if (amountTenderedInput) amountTenderedInput.value=''; } const baseDue=(typeof selectedOrderBalance==='number')?selectedOrderBalance:currentOrder.reduce((s,i)=>s+i.price*i.quantity,0); const discountPercent=dpEl?(parseFloat(dpEl.value)||0):0; const discountCash=dcEl?(parseFloat(dcEl.value)||0):0; const discount=Math.max(0, (baseDue*(discountPercent/100))+discountCash); const finalTotal=Math.max(0, baseDue-discount); const amountTendered=parseFloat(amountTenderedInput?.value)||0; const changeDue=Math.max(0, amountTendered-finalTotal); document.getElementById('payment-total-due').textContent=`£${finalTotal.toFixed(2)}`; document.getElementById('payment-change-due').textContent=`£${changeDue.toFixed(2)}`; }

export async function processPayment() { const { selectedOrderId, activePaymentMethod, currentOrder, selectedOrderBalance }=getState(); if (!selectedOrderId || !activePaymentMethod) return ui.showToast('Payment details are missing.', 'error'); const dpEl=document.getElementById('discount-percent'); const dcEl=document.getElementById('discount-cash'); let amountTendered=parseFloat(document.getElementById('amount-tendered').value)||0; const baseDue=(typeof selectedOrderBalance==='number')?selectedOrderBalance:currentOrder.reduce((s,i)=>s+i.price*i.quantity,0); const discountPercent=dpEl?(parseFloat(dpEl.value)||0):0; const discountCash=dcEl?(parseFloat(dcEl.value)||0):0; const discount=Math.max(0, (baseDue*(discountPercent/100))+discountCash); const finalTotal=Math.max(0, baseDue-discount); if (amountTendered<=0) amountTendered=finalTotal; if (discount===0 && amountTendered>0 && amountTendered<finalTotal){ try{ const applied=amountTendered; const res=await api.addOrderPayment(selectedOrderId, activePaymentMethod, applied); if (!res.success) return ui.showToast(res.error||'Failed to add payment.', 'error'); ui.showToast(`Paid £${applied.toFixed(2)} via ${activePaymentMethod}. Remaining £${Number(res.balance).toFixed(2)}.`, 'success'); clearCurrentOrder(); ui.renderOrder(); document.getElementById('payment-modal').style.display='none'; setState({ selectedOrderId: null, activePaymentMethod: null, selectedOrderBalance: null }); fetchPendingOrdersForPayment(); return; } catch { return ui.showToast('Error processing partial payment.', 'error'); } } try{ const result=await api.completeOrder(selectedOrderId, { paymentMethod: activePaymentMethod, discount }); if (result.success){ const changeDue=Math.max(0, amountTendered-finalTotal); let msg=`Payment of £${finalTotal.toFixed(2)} successful via ${activePaymentMethod}.`; if (activePaymentMethod==='cash' && changeDue>0){ msg+=` Change due: £${changeDue.toFixed(2)}.`; } ui.showToast(msg,'success'); clearCurrentOrder(); ui.renderOrder(); document.getElementById('payment-modal').style.display='none'; setState({ selectedOrderId: null, activePaymentMethod: null, selectedOrderBalance: null }); fetchPendingOrdersForPayment(); } else ui.showToast(result.error||'Payment failed.','error'); } catch { ui.showToast('Error processing payment.','error'); } }

export async function updateOrderStatus(orderId, status) { try{ await api.updateOrderStatus(orderId, status); await fetchOrderQueue(); } catch { ui.showToast('Failed to update order status.', 'error'); } }

async function fetchMenu(){ try{ const data=await api.getMenu(); const newMenu={}; data.menu.forEach(item=>{ if(!newMenu[item.category]) newMenu[item.category]=[]; newMenu[item.category].push(item); }); setState({ menu: newMenu }); ui.populateMenuCategories(newMenu); ui.buildCategoryTabPanes?.(newMenu); const first=Object.keys(newMenu)[0]; if (first) handleCategorySelect(first); } catch { ui.showToast('Failed to load menu.','error'); } }
async function fetchOrderQueue(){ try{ const data=await api.getPendingOrders(); const kitchenOrders=data.orders.filter(o=>o.status==='pending'); ui.renderOrderQueue(kitchenOrders); } catch {} }
async function fetchPendingOrdersForPayment(){ try{ const data=await api.getPendingOrders(); const ready=data.orders.filter(o=>o.status==='ready'); ui.renderPendingOrders(ready); } catch {} }

export async function fetchAndShowOldOrders(date=null, paymentMethod=null){ try{ if (date===null && paymentMethod===null){ const d=document.getElementById('old-orders-date-filter'); const p=document.getElementById('old-orders-payment-filter'); if (d) d.value=''; if (p) p.value=''; } const data=await api.getCompletedOrders(date, paymentMethod); ui.renderOldOrders(data.orders); } catch { ui.showToast('Failed to fetch old orders.','error'); } }
export async function generateZReport(){ try{ const report=await api.getZReport(); ui.renderZReport(report, salesChart); } catch { ui.showToast('Failed to generate Z-Report.','error'); } }

export async function handleMenuItemFormSubmit(e){ e.preventDefault(); const id=document.getElementById('menu-item-id').value; const name=(document.getElementById('menu-item-name').value||'').trim(); const price=parseFloat(document.getElementById('menu-item-price').value); const category=(document.getElementById('menu-item-category').value||'').trim(); const stock=parseInt(document.getElementById('menu-item-stock').value,10); const cost=parseFloat((document.getElementById('menu-item-cost')||{}).value||'0'); const sku=(document.getElementById('menu-item-sku')||{}).value||null; const barcode=(document.getElementById('menu-item-barcode')||{}).value||null; if(!name){ return ui.showToast('Item name is required.','error'); } if(!(price>=0)){ return ui.showToast('Price must be a number ≥ 0.','error'); } if(!category){ return ui.showToast('Category is required.','error'); } if(!(stock>=0)){ return ui.showToast('Stock must be 0 or more.','error'); } if (isNaN(cost) || cost<0) { return ui.showToast('Cost must be 0 or more.','error'); } const itemData={ name, price, category, stock, cost, sku, barcode }; try{ if (id){ await api.updateMenuItem(id, itemData); ui.showToast('Menu item updated successfully!','success'); } else { await api.addMenuItem(itemData); ui.showToast('Menu item added successfully!','success'); } ui.clearMenuItemForm(); await fetchMenu(); await openStockModal(); } catch (error){ ui.showToast(error.message||'Failed to save menu item.','error'); } }

export async function openStockModal(){ const { menu }=getState(); ui.renderStockModal(menu); const inp=document.getElementById('stock-search-input'); if (inp) inp.addEventListener('input', handleStockSearch); }
export function handleStockSearch(){ const { menu }=getState(); const term=document.getElementById('stock-search-input').value; ui.renderStockModal(menu, term); }
export function handleStockAdjustment(button){ const action=button.dataset.action; const stockItem=button.closest('.stock-item'); const input=stockItem.querySelector('.stock-quantity-input'); let v=parseInt(input.value,10); if (action==='increase') input.value=v+1; else if (action==='decrease'&&v>0) input.value=v-1; }
export function handleSetStock(button){ const stockItem=button.closest('.stock-item'); const input=stockItem.querySelector('.stock-quantity-input'); const nv=prompt('Enter new stock quantity:', input.value); if (nv!==null && !isNaN(nv) && nv>=0) input.value=parseInt(nv,10); }
export async function saveStockChanges(){ const updates=[]; document.querySelectorAll('#stock-list-accordion .stock-quantity-input').forEach(input=>{ updates.push({ name: input.dataset.name, stock: parseInt(input.value,10) }); }); try{ await api.saveStock(updates); ui.showToast('Stock updated successfully!','success'); document.getElementById('stock-modal').style.display='none'; await fetchMenu(); const active=document.querySelector('.menu-categories .nav-link.active')?.dataset.category; if (active) ui.displayMenuItems(active); } catch (e){ ui.showToast(e.message||'Failed to update stock.','error'); } }

export function openProfitLossModal(){ const modal=document.getElementById('profit-loss-modal'); const today=new Date().toISOString().slice(0,10); const sd=document.getElementById('profit-loss-start-date'); const ed=document.getElementById('profit-loss-end-date'); if (sd) sd.value=today; if (ed) ed.value=today; const res=document.getElementById('profit-loss-results'); if (res) res.innerHTML=''; modal.style.display='block'; }
export async function handleGenerateProfitLossReport(){ const sd=document.getElementById('profit-loss-start-date').value; const ed=document.getElementById('profit-loss-end-date').value; try{ const report=await api.getProfitLossReport(sd, ed); ui.renderProfitLossReport(report); } catch { ui.showToast('Failed to generate Profit/Loss report.','error'); } }

// --- Menu item CRUD helpers used by events.js ---
export function handleEditMenuItem(itemId){
  try {
    const { menu } = getState();
    let item = null;
    for (const cat in menu){ const found=(menu[cat]||[]).find(i=>String(i.id)===String(itemId)); if(found){ item = found; break; } }
    if (item) ui.populateMenuItemForm(item);
  } catch {}
}

export async function handleDeleteMenuItem(itemId){
  if (!confirm('Delete this menu item?')) return;
  try { await api.deleteMenuItem(itemId); ui.showToast('Menu item deleted.','success'); await fetchMenu(); await openStockModal(); } catch (e){ ui.showToast(e.message||'Delete failed.','error'); }
}
