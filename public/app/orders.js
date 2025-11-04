import { getState, setState, setCurrentOrder, clearCurrentOrder, addItemToOrder } from './state.js';
const CURRENCY = '\u00A3';
import * as api from './api.js';
import { updatePaymentDetails, openPaymentModal, processPayment } from './payments.js';

export async function initSession(){
  try {
    const s = await api.checkSession();
    if (s.loggedIn) {
      setState({ currentUser: s.user, currentUserRole: s.user.role });
      updateHeaderUser();
      show('#main-dashboard');
      hide('#login-screen');
      await loadMenu();
      await refreshPending();
      await refreshKitchen();
      // ensure category menu renders
      try { const first = Object.keys(getState().menu||{})[0]; if (first) window.displayMenuItems?.(first); } catch {}
    } else {
      setHeaderDefault();
      show('#login-screen');
      hide('#main-dashboard');
    }
  } catch {
    alert('Cannot connect to server.');
  }
}

export async function loadMenu(){
  const data = await api.getMenu();
  const byCat = {};
  (data.menu||[]).forEach(item=>{ if(!byCat[item.category]) byCat[item.category]=[]; byCat[item.category].push(item); });
  setState({ menu: byCat });
  renderCategories(byCat);
}

export async function placeOrder(){
  const { currentOrder } = getState();
  if (!currentOrder.length) return toast('Cannot place an empty order.');
  const type = val('#order-type-select');
  const dest = (type==='table')? `Table ${val('#table-select')}` : 'Takeaway';
  const order = { orderType:type, destination:dest, items: currentOrder };
  // check existing for table
  if (type==='table'){
    const data=await api.getPendingOrders();
    const open=(data.orders||[]).find(o=>o.destination===dest && (o.status==='pending'||o.status==='ready'));
    if (open){ setState({ tableDecision:{ existingOrderId: open.id, order } }); show('#table-order-confirm-modal'); return; }
  }
  const res=await api.placeOrder(order);
  if (res.orderId){ toast(`Order #${res.orderId} sent to the kitchen!`); clearCurrentOrder(); renderOrder(); await loadMenu(); }
  else toast(res.error||'Failed to place order.');
}

export async function addToExisting(){
  const d=getState().tableDecision; if (!d) return;
  const r=await api.appendOrderItems(d.existingOrderId, d.order.items);
  if (r&&r.success){ toast(`Items added to order #${d.existingOrderId}.`); clearCurrentOrder(); renderOrder(); }
  else toast(r.error||'Failed to append items.');
  hide('#table-order-confirm-modal');
}

export async function newOrderForTable(){
  const d=getState().tableDecision; if (!d) return;
  const r=await api.placeOrder(d.order);
  if (r.orderId){ toast(`Order #${r.orderId} sent to the kitchen!`); clearCurrentOrder(); renderOrder(); }
  else toast(r.error||'Failed to place order.');
  hide('#table-order-confirm-modal');
}

export function handleNewOrder(){
  clearCurrentOrder();
  $$('.pending-order-item.selected').forEach(el=>el.classList.remove('selected'));
  disable('#place-order-btn', false);
  toast('Ready to create a new order.');
  renderOrder();
}

export function selectPending(target){
  const id=target.dataset.orderId;
  const items=JSON.parse(target.dataset.items||'[]');
  $$('.pending-order-item.selected').forEach(el=>el.classList.remove('selected'));
  target.classList.add('selected');
  setState({ selectedOrderId: id });
  setCurrentOrder(items);
  disable('#place-order-btn', true);
  renderOrder();
  (async()=>{
    const data=await api.getPendingOrders();
    const m=(data.orders||[]).find(o=>String(o.id)===String(id));
    if (m && typeof m.balance!=='undefined') setState({ selectedOrderBalance: Number(m.balance) });
  })();
}

export async function refreshPending(){
  const data=await api.getPendingOrders();
  const ready=(data.orders||[]).filter(o=>o.status==='ready');
  const ul=qs('#pending-orders-list');
  ul.innerHTML='';
  ready.forEach(o=>{
    const total=o.items.reduce((s,i)=>s+i.price*i.quantity,0);
    const bal=(typeof o.balance==='number')? Number(o.balance):total;
    const li=document.createElement('li');
    li.className='list-group-item pending-order-item';
    li.dataset.orderId=o.id;
    li.dataset.items=JSON.stringify(o.items);
    li.dataset.balance=String(bal);
    li.innerHTML=`<div class="d-flex justify-content-between align-items-center"><div>Order #${o.id} - ${o.destination}</div><div><strong>Due ${CURRENCY}${bal.toFixed(2)}</strong></div></div>`;
    ul.appendChild(li);
  });
}

export async function refreshKitchen(){ /* existing kitchen rendering handled elsewhere */ }

export function addItemFromClick(el){
  const { menu }=getState();
  const name=el.dataset.name;
  for (const cat in menu){
    const item=menu[cat].find(i=>i.name===name);
    if (item){ addItemToOrder(item); renderOrder(); return; }
  }
}

export function renderCategories(menu){
  const cont = qs('.menu-categories');
  if (!cont) return;
  cont.innerHTML = '';

  const categories = Object.keys(menu || {});
  const itemsContainer = document.getElementById('menu-items');

  const renderItems = (category) => {
    if (!itemsContainer) return;
    itemsContainer.innerHTML = '';
    (menu[category] || []).forEach(item => {
      const name = item?.name || '';
      const stock = Number(item?.stock ?? 0);
      const price = Number(item?.price ?? 0);
      const div = document.createElement('div');
      div.className = 'menu-item';
      div.dataset.name = name;
      div.dataset.price = String(price);
      div.dataset.stock = String(stock);
      div.innerHTML = '<div class="item-name">' + name + '</div>' +
        '<div class="item-meta"><span class="stock-badge">Stock: ' + stock + '</span>' +
        '<span class="item-price">' + CURRENCY + price.toFixed(2) + '</span></div>';
      itemsContainer.appendChild(div);
    });
  };

  // expose for other handlers
  window.displayMenuItems = renderItems;

  if (!categories.length) {
    if (itemsContainer) itemsContainer.innerHTML = '<div class="text-muted">No items available.</div>';
    return;
  }

  categories.forEach((cat, index) => {
    const li = document.createElement('li');
    li.className = 'nav-item';
    const active = index === 0 ? ' active' : '';
    li.innerHTML = '<a class="nav-link menu-category-btn' + active + '" href="#" data-category="' + cat + '">' + cat + '</a>';
    cont.appendChild(li);
  });

  const first = categories[0];
  if (first) renderItems(first);

  cont.onclick = (e) => {
    const link = e.target.closest('.menu-category-btn');
    if (!link) return;
    e.preventDefault();
    const category = link.dataset.category;
    if (!category) return;
    document.querySelectorAll('.menu-categories .menu-category-btn').forEach(btn => btn.classList.remove('active'));
    link.classList.add('active');
    renderItems(category);
  };
}

export function renderOrder(){
  const { currentOrder }=getState();
  const ul=qs('#order-list');
  ul.innerHTML='';
  let total=0;
  currentOrder.forEach((it,i)=>{
    total+=it.price*it.quantity;
    const li=document.createElement('li');
    li.className='list-group-item order-item';
    li.dataset.index=i;
    li.innerHTML=`<div class="item-info"><div>${it.name} x ${it.quantity}</div><div class="fw-bold">${CURRENCY}${(it.price*it.quantity).toFixed(2)}</div></div><div class="item-actions btn-group"><button class="btn btn-sm btn-outline-secondary quantity-btn" data-action="decrement">-</button><button class="btn btn-sm btn-outline-secondary quantity-btn" data-action="increment">+</button><button class="btn btn-sm btn-outline-danger remove-item-btn">X</button></div>`;
    ul.appendChild(li);
  });
  qs('#total-price').textContent=`${CURRENCY}${total.toFixed(2)}`;
}

export function suspendSale(){
  const { currentOrder }=getState();
  if (!currentOrder.length) return toast('No items to suspend.');
  const key='suspendedSales';
  const list=JSON.parse(localStorage.getItem(key)||'[]');
  list.push({ id: Date.now(), at: new Date().toISOString(), order: currentOrder });
  localStorage.setItem(key, JSON.stringify(list));
  clearCurrentOrder();
  renderOrder();
  toast('Sale suspended.');
}

export function resumeSale(){
  const key='suspendedSales';
  const list=JSON.parse(localStorage.getItem(key)||'[]');
  if (!list.length) return toast('No suspended sales.');
  setCurrentOrder(list[list.length-1].order);
  list.pop();
  localStorage.setItem(key, JSON.stringify(list));
  renderOrder();
  toast('Sale resumed.');
}

export function printReceipt(){
  const { currentOrder }=getState();
  if (!currentOrder.length) return toast('No items to print.');
  const w=window.open('','PRINT','height=700,width=900,top=100,left=150');
  const text=receipt(currentOrder,'Receipt');
  w.document.write(`<pre style="font-family:monospace">${text}</pre>`);
  w.document.close(); w.focus(); w.print(); w.close();
}

export function emailReceipt(){
  const { currentOrder }=getState();
  if (!currentOrder.length) return toast('No items to email.');
  const text=encodeURIComponent(receipt(currentOrder,'Receipt'));
  window.location.href=`mailto:?subject=Your%20Tong%20POS%20Receipt&body=${text}`;
}

function receipt(items, title){
  const headerName = (window.storeInfo && window.storeInfo.name) ? window.storeInfo.name : 'Tong POS';
  const now = new Date();
  const lines=[
    headerName,
    'Address: ',
    'Phone: ',
    '------------------------------',
    title+`  ${now.toLocaleString()}`,
    '------------------------------'
  ];
  let subtotal=0; items.forEach(it=>{ lines.push(`${it.name} x ${it.quantity}  ${CURRENCY}${(it.price*it.quantity).toFixed(2)}`); subtotal+=it.price*it.quantity; });
  const taxRate = (window.storeInfo && typeof window.storeInfo.taxRate==='number') ? window.storeInfo.taxRate : 0;
  const discount = (window.lastPayment && window.lastPayment.discount)||0;
  const tax = (subtotal - discount) * taxRate;
  const total = subtotal - discount + tax;
  lines.push('------------------------------');
  lines.push(`Subtotal: ${CURRENCY}${subtotal.toFixed(2)}`);
  if (discount>0) lines.push(`Discount: -${CURRENCY}${discount.toFixed(2)}`);
  if (taxRate>0) lines.push(`Tax (${(taxRate*100).toFixed(0)}%): ${CURRENCY}${tax.toFixed(2)}`);
  lines.push(`Total:   ${CURRENCY}${total.toFixed(2)}`);
  if (window.lastPayment){
    const p = window.lastPayment;
    lines.push('');
    lines.push(`Paid:    ${CURRENCY}${(p.tendered||total).toFixed(2)} via ${p.method}`);
    if (p.change>0) lines.push(`Change:  ${CURRENCY}${p.change.toFixed(2)}`);
    if (p.partial) lines.push(`Remaining: ${CURRENCY}${(p.remaining||0).toFixed(2)}`);
  }
  lines.push('');
  lines.push('Thank you for your business!');
  return lines.join('\n');
}

function qs(s){ return document.querySelector(s); }
function $$ (s){ return Array.from(document.querySelectorAll(s)); }
function val(s){ const el=qs(s); return el?el.value:''; }
function show(s){ const el=qs(s); if (el) el.style.display='block'; }
function hide(s){ const el=qs(s); if (el) el.style.display='none'; }
function disable(s, dis){ const el=qs(s); if (el) el.disabled=!!dis; }
function toast(m){ if (window.ui && window.ui.showToast) window.ui.showToast(m); else alert(m); }

export { updatePaymentDetails, openPaymentModal, processPayment };

function updateHeaderUser(){
  const { currentUser, currentUserRole } = getState();
  const el = document.querySelector('#user-role-display');
  if (el && currentUser) el.textContent = `${currentUser.username} (${currentUserRole})`;
}

function setHeaderDefault(){
  const el = document.querySelector('#user-role-display');
  if (el) el.textContent = 'Dashboard';
}

