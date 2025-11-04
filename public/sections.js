import * as api from './api.js';
import * as ui from './ui.js';
import { getState, setState } from './state.js';
import * as handlers from './handlers.clean.js';

const el = (id) => document.getElementById(id);

export function renderSales() {
  // Sales uses existing Home panels; ensure menu + pending queues are active
  // Re-fetch menu/categories if empty
  const { menu } = getState();
  if (!menu || Object.keys(menu).length === 0) {
    // handlers.initializeApp() will call fetches based on role
    // But to be safe, fetch menu only
    const fetchMenuOnly = async () => {
      try {
        const data = await api.getMenu();
        const newMenu = {};
        data.menu.forEach(item => {
          if (!newMenu[item.category]) newMenu[item.category] = [];
          newMenu[item.category].push(item);
        });
        setState({ menu: newMenu });
        ui.populateMenuCategories(newMenu);
        ui.buildCategoryTabPanes?.(newMenu);
        const firstCategory = Object.keys(newMenu)[0];
        if (firstCategory) handlers.handleCategorySelect(firstCategory);
      } catch {}
    };
    fetchMenuOnly();
  }
}

export async function renderOrders() {
  const root = el('orders-root');
  if (!root) return;
  root.innerHTML = '<div class="text-muted">Loading orders…</div>';
  try {
    const data = await api.getPendingOrders();
    const pending = data.orders || [];
    const html = `
      <div class="d-flex justify-content-between mb-2">
        <div><strong>Pending:</strong> ${pending.filter(o=>o.status==='pending').length}</div>
        <div><strong>Ready:</strong> ${pending.filter(o=>o.status==='ready').length}</div>
        <div><strong>Total:</strong> ${pending.length}</div>
      </div>
      <ul class="list-group">
        ${pending.map(o => `<li class="list-group-item d-flex justify-content-between align-items-center">
          <span>#${o.id} - ${o.destination} (${o.status})</span>
          <button class="btn btn-sm btn-outline-primary" data-action="view" data-id="${o.id}">View</button>
        </li>`).join('')}
      </ul>`;
    root.innerHTML = html;

    // Attach click for View buttons
    root.onclick = (e) => {
      const btn = e.target.closest('button[data-action="view"]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      const order = pending.find(o => o.id === id);
      if (!order) return;

      const container = document.getElementById('order-view-content');
      const title = document.getElementById('order-view-title');
      const modal = document.getElementById('order-view-modal');
      if (!container || !modal) return;
      if (title) title.textContent = `Order #${order.id} - ${order.destination} (${order.status})`;

      // Group items by added time (minute precision) and render with banners
      const baseTime = order.timestamp ? new Date(order.timestamp) : null;
      const getTime = (it) => (it.added_at ? new Date(it.added_at) : baseTime);
      const groups = new Map();
      (order.items || []).forEach(it => {
        const t = getTime(it);
        const key = t ? `${t.getFullYear()}-${t.getMonth()}-${t.getDate()} ${t.getHours()}:${t.getMinutes()}` : 'initial';
        if (!groups.has(key)) groups.set(key, { time: t, items: [] });
        groups.get(key).items.push(it);
      });
      const ordered = Array.from(groups.values()).sort((a,b)=>{
        if (a.time && b.time) return a.time - b.time;
        if (a.time && !b.time) return -1;
        if (!a.time && b.time) return 1;
        return 0;
      });
      const bodyHtml = ordered.map((grp, idx) => {
        const timeLabel = grp.time ? grp.time.toLocaleTimeString() : '';
        const header = idx === 0 ? '' : `<div class="text-muted mb-1">[new items added - ${timeLabel}]</div>`;
        const lines = grp.items.map(it => `<li class=\"list-group-item d-flex justify-content-between\"><span>${it.name || it.item_name} x ${it.quantity}</span><span>£${Number(it.price).toFixed(2)}</span></li>`).join('');
        return header + `<ul class="list-group mb-2">${lines}</ul>`;
      }).join('');

      container.innerHTML = bodyHtml || '<div class="text-muted">No items.</div>';
      modal.style.display = 'block';
    };
  } catch (e) {
    root.innerHTML = '<div class="text-danger">Failed to load orders.</div>';
  }
}

// --- Expenses ---
export function renderExpenseCategories() {
  const root = el('expense-categories-root');
  if (!root) return;
  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">Expense Categories</h5>
      <button id="exp-cat-add-btn" class="btn btn-sm btn-primary">Add Category</button>
    </div>
    <div class="text-muted">No categories loaded.</div>
  `;
}

export function renderExpenseList() {
  const root = el('expense-list-root');
  if (!root) return;
  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">Expense List</h5>
      <a class="btn btn-sm btn-success" href="/expenses/add">Add Expense</a>
    </div>
    <div class="card">
      <div class="card-body">
        <div class="text-muted">No expenses found.</div>
      </div>
    </div>
  `;
}

export function renderExpenseAdd() {
  const root = el('expense-add-root');
  if (!root) return;
  root.innerHTML = `
    <form id="expense-form" class="row g-3">
      <div class="col-sm-6">
        <label class="form-label">Category</label>
        <select class="form-select" id="expense-category"></select>
      </div>
      <div class="col-sm-6">
        <label class="form-label">Date</label>
        <input type="date" class="form-control" id="expense-date" />
      </div>
      <div class="col-sm-8">
        <label class="form-label">Description</label>
        <input type="text" class="form-control" id="expense-desc" placeholder="e.g. Office supplies" />
      </div>
      <div class="col-sm-4">
        <label class="form-label">Amount</label>
        <input type="number" step="0.01" min="0" class="form-control" id="expense-amount" />
      </div>
      <div class="col-12">
        <button type="button" id="expense-save-btn" class="btn btn-primary">Save Expense</button>
        <a href="/expenses/list" class="btn btn-outline-secondary ms-2">Cancel</a>
      </div>
    </form>
  `;
  // Wire basic navigation for buttons if client router is present
  const saveBtn = document.getElementById('expense-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    // Placeholder save; return to list
    if (window.clientNavigate) window.clientNavigate('/expenses/list');
  });
}

export async function renderInventory() {
  const root = el('inventory-root');
  if (!root) return;
  const { menu } = getState();
  const items = Object.values(menu || {}).flat();
  const btn = '<button id="open-stock-modal-btn" class="btn btn-primary mb-3">Open Manage Stock</button>';
  if (!items.length) {
    root.innerHTML = btn + '<div class="text-muted">No items loaded. Open Manage Stock or go to Sales to load menu.</div>';
  } else {
    const rows = items.map(i => `<tr>
      <td>${i.category}</td><td>${i.name}</td><td>£${Number(i.price).toFixed(2)}</td><td>${i.stock}</td>
    </tr>`).join('');
    root.innerHTML = btn + `<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Category</th><th>Name</th><th>Price</th><th>Stock</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const btnEl = document.getElementById('open-stock-modal-btn');
  if (btnEl) btnEl.onclick = async () => {
    // Ensure menu is up to date then open modal
    try {
      const data = await api.getMenu();
      const newMenu = {};
      data.menu.forEach(item => {
        if (!newMenu[item.category]) newMenu[item.category] = [];
        newMenu[item.category].push(item);
      });
      setState({ menu: newMenu });
      ui.renderStockModal(newMenu);
    } catch {}
  };
}

// --- Product pages ---
export function renderProductCategories(){
  const root = el('product-categories-root'); if (!root) return;
  root.innerHTML = `
    <div class="d-flex justify-content-between mb-3">
      <h5 class="mb-0">Product Categories</h5>
      <a class="btn btn-sm btn-primary" href="/products/add">Add Product</a>
    </div>
    <div class="text-muted">No categories yet.</div>`;
}

export function renderProductList(){
  const root = el('product-list-root'); if (!root) return;
  root.innerHTML = `
    <div class="d-flex justify-content-between mb-3">
      <h5 class="mb-0">Product List</h5>
      <div>
        <a class="btn btn-sm btn-outline-secondary me-2" href="/products/barcodes">Print Barcode</a>
        <a class="btn btn-sm btn-primary" href="/products/add">Add Product</a>
      </div>
    </div>
    <div class="card"><div class="card-body"><div class="text-muted">No products found.</div></div></div>`;
}

export function renderProductAdd(){
  const root = el('product-add-root'); if (!root) return;
  root.innerHTML = `
    <form id="product-form" class="row g-3">
      <div class="col-sm-6"><label class="form-label">Name</label><input id="p-name" class="form-control" /></div>
      <div class="col-sm-3"><label class="form-label">Price</label><input id="p-price" type="number" step="0.01" class="form-control" /></div>
      <div class="col-sm-3"><label class="form-label">Stock</label><input id="p-stock" type="number" class="form-control" /></div>
      <div class="col-sm-6"><label class="form-label">Category</label><input id="p-cat" class="form-control" /></div>
      <div class="col-sm-6"><label class="form-label">Barcode</label><input id="p-barcode" class="form-control" /></div>
      <div class="col-12"><button type="button" id="p-save" class="btn btn-primary">Save</button>
        <a href="/products/list" class="btn btn-outline-secondary ms-2">Cancel</a></div>
    </form>`;
  const btn = document.getElementById('p-save');
  if (btn) btn.addEventListener('click', ()=>{ if (window.clientNavigate) window.clientNavigate('/products/list'); });
}

export function renderProductBarcodes(){
  const root = el('product-barcodes-root'); if (!root) return;
  root.innerHTML = `<div class="text-muted">Barcode printing setup coming soon.</div>`;
}

export function renderProductAdjustments(){
  const root = el('product-adjustments-root'); if (!root) return;
  root.innerHTML = `
    <div class="d-flex justify-content-between mb-3">
      <h5 class="mb-0">Adjustment List</h5>
      <a class="btn btn-sm btn-primary" href="/products/adjustments/add">Add Adjustment</a>
    </div>
    <div class="text-muted">No adjustments found.</div>`;
}

export function renderProductAdjustmentAdd(){
  const root = el('product-adjustment-add-root'); if (!root) return;
  root.innerHTML = `
    <form class="row g-3">
      <div class="col-sm-6"><label class="form-label">Product</label><input class="form-control" placeholder="Search product" /></div>
      <div class="col-sm-3"><label class="form-label">Quantity Change</label><input type="number" class="form-control" /></div>
      <div class="col-sm-3"><label class="form-label">Reason</label><input class="form-control" /></div>
      <div class="col-12"><a href="/products/adjustments" class="btn btn-primary">Save</a></div>
    </form>`;
}

export function renderProductStockCount(){
  const root = el('product-stock-count-root'); if (!root) return;
  root.innerHTML = `<div class="text-muted">Stock count screen coming soon.</div>`;
}

// --- Settings subpages ---
export function renderSettingsPrinters(){
  const root = el('settings-printers-root'); if (!root) return;
  root.innerHTML = `<div class="text-muted">Configure receipt printers here.</div>`;
}
export function renderSettingsInvoice(){
  const root = el('settings-invoice-root'); if (!root) return;
  root.innerHTML = `<div class="text-muted">Invoice settings coming soon.</div>`;
}
export function renderSettingsRoles(){
  const root = el('settings-roles-root'); if (!root) return;
  root.innerHTML = `<div class="text-muted">Role permissions management coming soon.</div>`;
}
export function renderSettingsDiscounts(){
  const root = el('settings-discounts-root'); if (!root) return;
  root.innerHTML = `
    <div class="d-flex justify-content-between mb-3">
      <h5 class="mb-0">Discount Plans</h5>
      <a class="btn btn-sm btn-primary" href="/settings/discounts/add">Add Discount</a>
    </div>
    <div class="text-muted">No discounts defined.</div>`;
}
export function renderSettingsDiscountAdd(){
  const root = el('settings-discount-add-root'); if (!root) return;
  root.innerHTML = `
    <form class="row g-3">
      <div class="col-sm-6"><label class="form-label">Name</label><input class="form-control" /></div>
      <div class="col-sm-3"><label class="form-label">Type</label><select class="form-select"><option value="percent">Percent</option><option value="fixed">Fixed</option></select></div>
      <div class="col-sm-3"><label class="form-label">Value</label><input type="number" step="0.01" class="form-control" /></div>
      <div class="col-12"><a href="/settings/discounts" class="btn btn-primary">Save</a></div>
    </form>`;
}

export function renderCustomers() {
  const root = el('customers-root');
  if (!root) return;
  root.innerHTML = `
    <div class="row g-2 mb-2">
      <div class="col-md-3"><input id="cust-name" class="form-control" placeholder="Customer Name"/></div>
      <div class="col-md-2"><input id="cust-phone" class="form-control" placeholder="Phone"/></div>
      <div class="col-md-3"><input id="cust-email" class="form-control" placeholder="Email"/></div>
      <div class="col-md-3"><input id="cust-notes" class="form-control" placeholder="Notes"/></div>
      <div class="col-md-1 d-grid"><button id="cust-save" class="btn btn-primary">Add</button></div>
    </div>
    <div class="input-group mb-2">
      <span class="input-group-text">Search</span>
      <input id="cust-search" class="form-control" placeholder="Name / Phone / Email"/>
      <button id="cust-search-btn" class="btn btn-outline-secondary">Go</button>
    </div>
    <div class="table-responsive"><table class="table table-sm" id="cust-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Notes</th><th></th></tr></thead><tbody></tbody></table></div>`;
  let all=[]; let page=1; const perPage=25;
  const renderPage=()=>{ const tb=root.querySelector('#cust-table tbody'); tb.innerHTML=''; const from=(page-1)*perPage; const to=from+perPage; (all.slice(from,to)).forEach(c=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${c.name}</td><td>${c.phone||''}</td><td>${c.email||''}</td><td>${c.notes||''}</td><td class="text-end"><button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="${c.id}">Edit</button> <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${c.id}">Delete</button></td>`; tb.appendChild(tr); }); };
  const load = async (term='')=>{ try{ const r = await fetch('/api/customers'+(term?`?term=${encodeURIComponent(term)}`:'')); const d=await r.json(); all=(d.customers||[]); page=1; renderPage(); }catch{} };
  load();
  root.querySelector('#cust-save').onclick = async()=>{
    const name=el('cust-name').value.trim(); const phone=el('cust-phone').value.trim(); const email=el('cust-email').value.trim(); const notes=el('cust-notes').value.trim();
    if(!name) return;
    try{ const r=await fetch('/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,email,notes})}); if(r.ok){ el('cust-name').value=''; el('cust-phone').value=''; el('cust-email').value=''; el('cust-notes').value=''; load(); } }catch{}
  };
  root.querySelector('#cust-search-btn').onclick = ()=> load(el('cust-search').value);
  const pager=document.createElement('div'); pager.className='d-flex justify-content-end gap-2 my-2'; pager.innerHTML='<button id="cust-prev" class="btn btn-sm btn-outline-secondary">Prev</button><button id="cust-next" class="btn btn-sm btn-outline-secondary">Next</button>'; root.appendChild(pager); pager.querySelector('#cust-prev').onclick=()=>{ if(page>1){ page--; renderPage(); } }; pager.querySelector('#cust-next').onclick=()=>{ const max=Math.ceil(all.length/perPage); if(page<max){ page++; renderPage(); } };
  root.querySelector('#cust-table').onclick = async (e)=>{
    const btn = e.target.closest('button[data-act]'); if(!btn) return; const id=btn.dataset.id; const act=btn.dataset.act;
    if (act==='del'){ if(confirm('Delete this customer?')){ await fetch('/api/customers/'+id,{method:'DELETE'}); load(); } }
    if (act==='edit'){
      const name=prompt('Name?'); if(name==null) return; const phone=prompt('Phone?')||''; const email=prompt('Email?')||''; const notes=prompt('Notes?')||'';
      await fetch('/api/customers/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,email,notes})}); load();
    }
  };
}

export function renderEmployees() {
  const root = el('employees-root');
  if (!root) return;
  const role = (window?.appState?.currentUserRole || (window.getState? window.getState().currentUserRole: '')) || '';
  const lower = String(role).toLowerCase();
  const isAdmin = ['admin','superadmin'].includes(lower);
  root.innerHTML = `<div class="row g-3">
    <div class="col-md-4">
      <div class="card mb-3"><div class="card-header">My Shift</div><div class="card-body">
        <div class="d-grid gap-2">
          <button id="emp-clock-in" class="btn btn-success">Clock In</button>
          <button id="emp-clock-out" class="btn btn-warning">Clock Out</button>
          <div id="emp-msg" class="text-muted">Ready.</div>
        </div>
      </div></div>
      <div class="card"><div class="card-header">My Profile</div><div class="card-body">
        <div class="mb-2"><label class="form-label">Name</label><input id="prof-name" class="form-control" type="text"/></div>
        <div class="mb-3"><label class="form-label">Email</label><input id="prof-email" class="form-control" type="email"/></div>
        <div class="d-grid gap-2 mb-3"><button id="prof-save" class="btn btn-primary">Update Profile</button></div>
        <hr/>
        <div class="mb-2"><label class="form-label">Current Password</label><input id="pwd-old" class="form-control" type="password"/></div>
        <div class="mb-3"><label class="form-label">New Password</label><input id="pwd-new" class="form-control" type="password"/></div>
        <div class="d-grid gap-2"><button id="pwd-save" class="btn btn-outline-primary">Change Password</button></div>
      </div></div>
    </div>
    <div class="col-md-8" ${isAdmin? '': 'style="display:none"'}>
      <div class="card h-100"><div class="card-header">Performance (7 days)</div><div class="card-body">
        <div class="table-responsive"><table class="table table-sm" id="emp-perf"><thead><tr><th>User</th><th>Hours</th></tr></thead><tbody></tbody></table></div>
      </div></div>
    </div>
  </div>`;
  const msg = el('emp-msg');
  const loadPerf = async()=>{ try{ const r=await fetch('/api/employees/performance'); const d=await r.json(); const tb=root.querySelector('#emp-perf tbody'); tb.innerHTML=''; (d.performance||[]).forEach(p=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${p.username}</td><td>${(Number(p.hours)||0).toFixed(2)}</td>`; tb.appendChild(tr); }); }catch{}};
  el('emp-clock-in').onclick = async ()=>{ try{ const r=await fetch('/api/employees/clock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'in'})}); if(r.ok){ msg.textContent='Clocked in.'; loadPerf(); } }catch{ msg.textContent='Error.'; } };
  el('emp-clock-out').onclick = async ()=>{ try{ const r=await fetch('/api/employees/clock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'out'})}); if(r.ok){ msg.textContent='Clocked out.'; loadPerf(); } }catch{ msg.textContent='Error.'; } };
  if (isAdmin) loadPerf();

  // Load and wire profile actions
  const nameInput = el('prof-name');
  const emailInput = el('prof-email');
  const saveBtn = el('prof-save');
  const pwdOld = el('pwd-old');
  const pwdNew = el('pwd-new');
  const pwdSave = el('pwd-save');
  // Prefill profile
  fetch('/api/profile/me').then(r=>r.json()).then(d=>{ if (d && d.user){ if (nameInput) nameInput.value = d.user.name || ''; if (emailInput) emailInput.value = d.user.email || ''; }}).catch(()=>{});
  if (saveBtn) saveBtn.onclick = async ()=>{
    try {
      const r = await fetch('/api/profile/me', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: nameInput.value||null, email: emailInput.value||null }) });
      if (r.ok) msg.textContent = 'Profile updated.'; else msg.textContent = 'Profile update failed.';
    } catch { msg.textContent = 'Profile update failed.'; }
  };
  if (pwdSave) pwdSave.onclick = async ()=>{
    try {
      const r = await fetch('/api/profile/password', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ oldPassword: pwdOld.value, newPassword: pwdNew.value }) });
      if (r.ok) { msg.textContent = 'Password changed.'; pwdOld.value=''; pwdNew.value=''; } else { const d=await r.json().catch(()=>({})); msg.textContent = d.error||'Password change failed.'; }
    } catch { msg.textContent = 'Password change failed.'; }
  };
}

export function renderReports() {
  const root = el('reports-root');
  if (!root) return;
  root.innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-header">Sales Summary</div>
          <div class="card-body">
            <label class="form-label">Period</label>
            <select id="report-period" class="form-select mb-2">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button id="run-sales-summary" class="btn btn-primary w-100">Run</button>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-header">Product Performance</div>
          <div class="card-body">
            <label class="form-label">Start</label>
            <input id="prod-start" type="date" class="form-control mb-2"/>
            <label class="form-label">End</label>
            <input id="prod-end" type="date" class="form-control mb-2"/>
            <button id="run-product-performance" class="btn btn-secondary w-100">Run</button>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card h-100">
          <div class="card-header">Category Sales</div>
          <div class="card-body">
            <label class="form-label">Start</label>
            <input id="cat-start" type="date" class="form-control mb-2"/>
            <label class="form-label">End</label>
            <input id="cat-end" type="date" class="form-control mb-2"/>
            <button id="run-category-sales" class="btn btn-outline-primary w-100">Run</button>
          </div>
        </div>
      </div>
      <div class="col-md-12">
        <div class="card h-100">
          <div class="card-header">Business Day</div>
          <div class="card-body">
            <div class="d-flex flex-wrap gap-2 mb-2">
              <button id="btn-start-day" class="btn btn-success">Start Day (Snapshot)</button>
              <button id="btn-close-day" class="btn btn-warning">Close Day (Snapshot)</button>
              <button id="btn-estimate-sales" class="btn btn-outline-primary">Estimate Sales from Stock</button>
            </div>
            <div id="estimate-output" class="small text-muted">Start or close the day to snapshot inventory, then run estimate.</div>
          </div>
        </div>
      </div>
    </div>
    <div id="reports-output"></div>
  `;
  const out = el('reports-output');
  const currency = '£';
  const btn1 = el('run-sales-summary');
  const btn2 = el('run-product-performance');
  const btn3 = el('run-category-sales');
  if (btn1) btn1.onclick = async () => {
    const period = (el('report-period').value || 'daily');
    out.innerHTML = '<div class="text-muted">Running report…</div>';
    try {
      const res = await fetch(`/api/reports/sales-summary?period=${encodeURIComponent(period)}`);
      const data = await res.json();
      const rows = (data.data||[]).map(r=>({
        Label: r.label,
        Sales: `${currency}${Number(r.sales||0).toFixed(2)}`,
        'Cash Sales': `${currency}${Number(r.cash_sales||0).toFixed(2)}`,
        'Card Sales': `${currency}${Number(r.card_sales||0).toFixed(2)}`,
      }));
      renderTable(out, ['Label','Sales','Cash Sales','Card Sales'], rows);
      // chart
      const totals = (data.data||[]).slice().reverse();
      const cvs = document.createElement('canvas'); cvs.height=120; out.appendChild(cvs);
      const ctx = cvs.getContext('2d');
      new Chart(ctx, { type:'line', data:{ labels: totals.map(x=>x.label), datasets:[{ label:'Sales', data: totals.map(x=>Number(x.sales||0)), borderColor:'#0d6efd', backgroundColor:'rgba(13,110,253,0.2)', tension:0.2 }]}, options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true }}}});
      // CSV export
      const btn = document.createElement('button'); btn.className='btn btn-sm btn-outline-secondary mt-2'; btn.textContent='Export CSV'; btn.onclick=()=>{
        const header=['Label','Sales','Cash Sales','Card Sales'];
        const lines=[header.join(',')].concat(rows.map(r=> header.map(h=> String(r[h]).replaceAll(',', ' ')).join(',')));
        const blob=new Blob([lines.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`sales-summary-${period}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
      }; out.appendChild(btn);
    } catch { out.innerHTML = '<div class="text-danger">Failed to load sales summary.</div>'; }
  };
  if (btn2) btn2.onclick = async () => {
    const s = el('prod-start').value; const e = el('prod-end').value;
    const qs = new URLSearchParams(); if (s) qs.append('startDate', s); if (e) qs.append('endDate', e);
    out.innerHTML = '<div class="text-muted">Running report…</div>';
    try {
      const res = await fetch(`/api/reports/product-performance${qs.toString()?`?${qs.toString()}`:''}`);
      const data = await res.json();
      const rows = (data.products||[]).map(r=>({ Name: r.name, Quantity: r.quantity, Revenue: `${currency}${Number(r.revenue||0).toFixed(2)}` }));
      renderTable(out, ['Name','Quantity','Revenue'], rows);
    } catch { out.innerHTML = '<div class="text-danger">Failed to load product performance.</div>'; }
  };
  if (btn3) btn3.onclick = async () => {
    const s = el('cat-start').value; const e = el('cat-end').value;
    const qs = new URLSearchParams(); if (s) qs.append('startDate', s); if (e) qs.append('endDate', e);
    out.innerHTML = '<div class="text-muted">Running report…</div>';
    try {
      const res = await fetch(`/api/reports/category-sales${qs.toString()?`?${qs.toString()}`:''}`);
      const data = await res.json();
      const rows = (data.categories||[]).map(r=>({ Category: r.category, Quantity: r.quantity, Revenue: `${currency}${Number(r.revenue||0).toFixed(2)}` }));
      renderTable(out, ['Category','Quantity','Revenue'], rows);
    } catch { out.innerHTML = '<div class="text-danger">Failed to load category sales.</div>'; }
  };
  // Business Day buttons
  const estOut = el('estimate-output');
  const startBtn = el('btn-start-day');
  const closeBtn = el('btn-close-day');
  const estBtn = el('btn-estimate-sales');
  if (startBtn) startBtn.onclick = async ()=>{ estOut.textContent='Starting day…'; try{ const r=await fetch('/api/reports/start-day',{method:'POST'}); const d=await r.json(); if (r.ok) estOut.textContent = `Business day started (ID ${d.businessDayId}).`; else estOut.textContent = d.error||'Failed to start day.'; }catch{ estOut.textContent='Failed to start day.'; }};
  if (closeBtn) closeBtn.onclick = async ()=>{ estOut.textContent='Closing day…'; try{ const r=await fetch('/api/reports/close-day',{method:'POST'}); const d=await r.json(); if (r.ok) estOut.textContent = `Business day closed (ID ${d.businessDayId}).`; else estOut.textContent = d.error||'Failed to close day.'; }catch{ estOut.textContent='Failed to close day.'; }};
  if (estBtn) estBtn.onclick = async ()=>{ estOut.textContent='Estimating…'; try{ const r=await fetch('/api/reports/estimate-sales'); const d=await r.json(); if (!r.ok){ estOut.textContent=d.error||'Estimate failed.'; return; } const rows=(d.items||[]).map(x=>({ ItemId:x.item_id, 'Start':x.start_stock, 'End':x.end_stock, Sold:x.sold_qty, Price:`£${Number(x.price).toFixed(2)}`, Revenue:`£${Number(x.est_revenue).toFixed(2)}`, Cost:`£${Number(x.est_cost).toFixed(2)}` })); renderTable(estOut, ['ItemId','Start','End','Sold','Price','Revenue','Cost'], rows); const tot=d.totals||{sold_qty:0,est_revenue:0,est_cost:0,est_gross:0}; const footer=document.createElement('div'); footer.className='mt-2'; footer.innerHTML = `<strong>Sold Items:</strong> ${tot.sold_qty} &nbsp; <strong>Est Revenue:</strong> £${Number(tot.est_revenue).toFixed(2)} &nbsp; <strong>Est Cost:</strong> £${Number(tot.est_cost).toFixed(2)} &nbsp; <strong>Est Gross:</strong> £${Number(tot.est_gross).toFixed(2)}`; estOut.appendChild(footer); }catch{ estOut.textContent='Estimate failed.'; }};
}

function renderTable(container, headers, rows){
  if (!rows || !rows.length){ container.innerHTML = '<div class="text-muted">No data.</div>'; return; }
  let filtered = rows.slice();
  let page = 1; const perPage = 25;
  const controls = document.createElement('div');
  controls.className='d-flex justify-content-between align-items-center mb-2';
  controls.innerHTML = `<div class="input-group" style="max-width:320px"><span class="input-group-text">Filter</span><input id="rpt-filter" class="form-control" placeholder="Search..."/></div><div><button id="rpt-prev" class="btn btn-sm btn-outline-secondary me-1">Prev</button><button id="rpt-next" class="btn btn-sm btn-outline-secondary">Next</button></div>`;
  const tableWrap = document.createElement('div'); tableWrap.className='table-responsive';
  const table = document.createElement('table'); table.className='table table-sm table-striped';
  tableWrap.appendChild(table);
  container.innerHTML=''; container.appendChild(controls); container.appendChild(tableWrap);
  const renderPage = ()=>{
    const from = (page-1)*perPage; const to = from+perPage;
    const pageRows = filtered.slice(from,to);
    const thead = `<thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${pageRows.map(r=> `<tr>${headers.map(h=>`<td>${r[h]??''}</td>`).join('')}</tr>`).join('')}</tbody>`;
    table.innerHTML = thead+tbody;
  };
  const filterEl = controls.querySelector('#rpt-filter');
  filterEl.addEventListener('input', ()=>{ const q=filterEl.value.toLowerCase(); filtered = rows.filter(row=> headers.some(h=> String(row[h]||'').toLowerCase().includes(q))); page=1; renderPage(); });
  controls.querySelector('#rpt-prev').addEventListener('click', ()=>{ if (page>1){ page--; renderPage(); }});
  controls.querySelector('#rpt-next').addEventListener('click', ()=>{ const max = Math.ceil(filtered.length/perPage); if (page<max){ page++; renderPage(); }});
  renderPage();
}

export function renderSettings() {
  const root = el('settings-root');
  if (!root) return;
  root.innerHTML = `<div class="row g-3">
    <div class="col-md-7">
      <div class="card h-100"><div class="card-header">Store Information</div><div class="card-body">
        <div class="row g-2">
          <div class="col-md-6"><label class="form-label">Name</label><input id="set-name" class="form-control"/></div>
          <div class="col-md-6"><label class="form-label">Phone</label><input id="set-phone" class="form-control"/></div>
          <div class="col-md-12"><label class="form-label">Address</label><textarea id="set-address" class="form-control" rows="2"></textarea></div>
          <div class="col-md-4"><label class="form-label">Tax Rate (%)</label><input id="set-tax" type="number" step="0.01" min="0" class="form-control"/></div>
          <div class="col-md-8"><label class="form-label">Logo URL</label><input id="set-logo" class="form-control"/></div>
          <div class="col-12 d-grid"><button id="set-save" class="btn btn-primary">Save Settings</button></div>
        </div>
      </div></div>
    </div>
    <div class="col-md-5">
      <div class="card h-100"><div class="card-header">Payment Methods</div><div class="card-body" id="settings-methods">Loading…</div></div>
    </div>
  </div>`;
  (async()=>{
    try{ const s=await fetch('/api/settings/store'); const d=await s.json(); window.storeInfo={ name:d.name||'', address:d.address||'', phone:d.phone||'', taxRate: Number(d.tax_rate)||0, logoUrl: d.logo_url||'' }; el('set-name').value=d.name||''; el('set-phone').value=d.phone||''; el('set-address').value=d.address||''; el('set-tax').value = ((Number(d.tax_rate)||0)*100).toFixed(2); el('set-logo').value=d.logo_url||''; }catch{ }
    try{ const s=await fetch('/api/settings/payment-methods'); const d=await s.json(); el('settings-methods').innerHTML = (d.methods||[]).map(m=>`<span class="badge text-bg-secondary me-1">${m}</span>`).join('') || 'None'; }catch{ el('settings-methods').textContent='Failed to load.'; }
  })();
  el('set-save').onclick = async ()=>{
    const payload = { name: el('set-name').value, address: el('set-address').value, phone: el('set-phone').value, tax_rate: (parseFloat(el('set-tax').value)||0)/100, logo_url: el('set-logo').value };
    try{ const r=await fetch('/api/settings/store',{ method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); if (r.ok){ window.storeInfo={ name:payload.name, address:payload.address, phone:payload.phone, taxRate: payload.tax_rate, logoUrl: payload.logo_url }; alert('Settings saved.'); } else { const e=await r.json(); alert(e.error||'Failed to save'); } }catch{ alert('Failed to save settings'); }
  };
}

export function renderAccounting() {
  const root = el('accounting-root');
  if (!root) return;
  root.innerHTML = `<div class="row g-3">
    <div class="col-md-6"><div class="card h-100"><div class="card-header">Cash Management</div><div class="card-body" id="acct-cash">Loading…</div></div></div>
    <div class="col-md-6"><div class="card h-100"><div class="card-header">End of Day</div><div class="card-body" id="acct-eod">Loading…</div></div></div>
  </div>`;
  (async()=>{
    try{ const r=await fetch('/api/accounting/cash-management'); const d=await r.json(); el('acct-cash').innerHTML = `<div><strong>Register Open:</strong> ${d.open?'Yes':'No'}</div><div><strong>Cash Drops:</strong> ${(d.drops||[]).length}</div>`; }catch{ el('acct-cash').textContent='Failed to load.'; }
    try{ const r=await fetch('/api/accounting/eod'); const d=await r.json(); el('acct-eod').innerHTML = `<div><strong>Reconciled:</strong> ${d.reconciled?'Yes':'No'}</div>`; }catch{ el('acct-eod').textContent='Failed to load.'; }
  })();
}

export function renderSystem() {
  const root = el('system-root');
  if (!root) return;
  root.innerHTML = `<div class="d-flex gap-2">
    <button id="btn-sync" class="btn btn-primary">Sync Data</button>
    <button id="btn-backup" class="btn btn-outline-primary">Backup</button>
  </div>
  <div id="sys-msg" class="mt-2 text-muted"></div>`;
  el('btn-sync').onclick = async () => {
    try { await fetch('/api/system/sync', { method: 'POST' }); el('sys-msg').textContent = 'Sync triggered.'; } catch {}
  };
  el('btn-backup').onclick = async () => {
    try { const r = await fetch('/api/system/backup'); if (r.ok) el('sys-msg').textContent = 'Backup created.'; } catch {}
  };
}

export function renderHelp() {
  const root = el('help-root');
  if (!root) return;
  root.innerHTML = `<div id="help-content">Loading…</div>`;
  (async()=>{
    try{ const g=await fetch('/api/help/guide'); const d=await g.json(); const t=await fetch('/api/help/training'); const td=await t.json(); el('help-content').innerHTML = `<div><a href="${d.url}" target="_blank" rel="noopener">User Guide</a></div><div>Training Mode: ${td.mode?'On':'Off'}</div>`; }catch{ el('help-content').textContent='Failed to load.'; }
  })();
}

export function renderMenuMgmt() {
  const root = el('menu-root');
  if (!root) return;
  root.innerHTML = `<button id="btn-open-stock" class="btn btn-primary">Open Menu & Stock</button>`;
  el('btn-open-stock').onclick = async () => {
    try {
      const data = await api.getMenu();
      const newMenu = {};
      data.menu.forEach(item => {
        if (!newMenu[item.category]) newMenu[item.category] = [];
        newMenu[item.category].push(item);
      });
      setState({ menu: newMenu });
      ui.renderStockModal(newMenu);
    } catch {}
  };
}

export async function renderTables() {
  const root = el('tables-root');
  if (!root) return;
  root.innerHTML = '<div class="text-muted">Loading tables…</div>';
  try{
    const data = await api.getPendingOrders();
    const pending = data.orders||[];
    const tables = Array.from({length:12},(_,i)=> i+1);
    const cards = tables.map(n=>{
      const label = `Table ${n}`;
      const open = pending.filter(o=> (o.destination||'').toLowerCase()===label.toLowerCase());
      const ids = open.map(o=>`#${o.id}`).join(', ');
      const badge = open.length? `<span class="badge text-bg-warning">Open: ${ids}</span>` : `<span class="badge text-bg-success">Free</span>`;
      const actions = `
        <div class=\"mt-2 d-flex gap-2\">
          <button class=\"btn btn-sm btn-primary\" data-act=\"new\" data-table=\"${n}\">New Order</button>
          <button class=\"btn btn-sm btn-outline-secondary\" data-act=\"append\" data-table=\"${n}\" ${open.length?'' :'disabled'}>Add to Existing</button>
        </div>`;
      return `<div class=\"col-sm-6 col-md-4 col-lg-3\"><div class=\"card mb-3\"><div class=\"card-body\"><div class=\"d-flex justify-content-between align-items-center\"><div>${label}</div><div>${badge}</div></div>${actions}</div></div></div>`;
    }).join('');
    root.innerHTML = `<div class="row">${cards}</div>`;
    // wire actions
    root.onclick = async (e)=>{
      const btn = e.target.closest('button[data-act]'); if(!btn) return; const table = btn.getAttribute('data-table'); const act = btn.getAttribute('data-act');
      // switch to Sales (path-based navigation)
      if (window.clientNavigate) window.clientNavigate('/sales');
      else { try { window.history.pushState({}, '', '/sales'); } catch {} }
      // set order type to table + table number
      const typeSel = document.getElementById('order-type-select'); if (typeSel) { typeSel.value = 'table'; const ev=new Event('change'); typeSel.dispatchEvent(ev); }
      const tableSel = document.getElementById('table-select'); if (tableSel) tableSel.value = String(table);
      if (act==='append') {
        // hint auto-append on place
        try { const mod = await import('./api.js'); } catch {}
        // use global state through handlers.clean.js
        try { const st = await import('./state.js'); st.setState({ preferAppend: true }); } catch {}
      }
    };
  } catch {
    root.innerHTML = '<div class="text-danger">Failed to load tables.</div>';
  }
}

export async function renderKitchen() {
  const root = el('kitchen-root');
  if (!root) return;
  root.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2">
    <div class="btn-group" role="group" aria-label="Kitchen Filters">
      <button class="btn btn-sm btn-outline-secondary active" data-kf="pending">Pending</button>
      <button class="btn btn-sm btn-outline-secondary" data-kf="ready">Ready</button>
      <button class="btn btn-sm btn-outline-secondary" data-kf="all">All</button>
    </div>
    <div class="text-muted small">Kitchen Queue</div>
  </div>
  <div class="text-muted">Loading queue…</div>`;
  try {
    const data = await api.getPendingOrders();
    const all = (data.orders || []);
    const renderBy = (mode)=>{
      let list = all;
      if (mode==='pending') list = all.filter(o=>o.status==='pending');
      else if (mode==='ready') list = all.filter(o=>o.status==='ready');
      ui.renderOrderQueue(list);
    };
    renderBy('pending');
    root.querySelectorAll('button[data-kf]').forEach(btn=> btn.addEventListener('click', (e)=>{
      root.querySelectorAll('button[data-kf]').forEach(b=>b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      renderBy(e.currentTarget.getAttribute('data-kf'));
    }));
  } catch {
    root.innerHTML = '<div class="text-danger">Failed to load queue.</div>';
  }
}
