import * as api from './api.js';
import * as ui from './ui.js';
import { getState, setState } from './state.js';
import * as handlers from './handlers.js';

const el = (id) => document.getElementById(id);

export function renderSales() {
  // Sales uses existing Home panels; ensure menu + pending queues are active

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
        const lines = grp.items.map(it => `<li class="list-group-item d-flex justify-content-between"><span>${it.name || it.item_name} x ${it.quantity}</span><span>৳${Number(it.price).toFixed(2)}</span></li>`).join('');
        return header + `<ul class="list-group mb-2">${lines}</ul>`;
      }).join('');

      container.innerHTML = bodyHtml || '<div class="text-muted">No items.</div>';
      modal.style.display = 'block';
    };
  } catch (e) {
    root.innerHTML = '<div class="text-danger">Failed to load orders.</div>';
  }
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
      <td>${i.category}</td><td>${i.name}</td><td>৳${Number(i.price).toFixed(2)}</td><td>${i.stock}</td>
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

export function renderCustomers() {
  const root = el('customers-root');
  if (!root) return;
  root.innerHTML = `
    <div class="row g-2">
      <div class="col-md-4"><input id="cust-name" class="form-control" placeholder="Customer Name"/></div>
      <div class="col-md-4"><input id="cust-phone" class="form-control" placeholder="Phone"/></div>
      <div class="col-md-4"><button id="cust-save" class="btn btn-primary w-100">Add Customer (Local)</button></div>
    </div>
    <div id="cust-msg" class="mt-2 text-muted">This is a placeholder UI.</div>`;
  const btn = document.getElementById('cust-save');
  if (btn) btn.onclick = () => {
    const name = (document.getElementById('cust-name')||{}).value || '';
    const phone = (document.getElementById('cust-phone')||{}).value || '';
    el('cust-msg').textContent = name ? `Saved ${name} (${phone}) locally.` : 'Enter a name.';
  };
}

export function renderEmployees() {
  const root = el('employees-root');
  if (!root) return;
  root.innerHTML = `<div class="d-flex gap-2">
    <button id="emp-clock-in" class="btn btn-success">Clock In</button>
    <button id="emp-clock-out" class="btn btn-warning">Clock Out</button>
  </div>
  <div id="emp-msg" class="mt-2 text-muted">This is a placeholder UI.</div>`;
  const msg = el('emp-msg');
  el('emp-clock-in').onclick = () => msg.textContent = 'Clocked in (placeholder)';
  el('emp-clock-out').onclick = () => msg.textContent = 'Clocked out (placeholder)';
}

export function renderReports() {
  const root = el('reports-root');
  if (!root) return;
  root.innerHTML = `<div class="d-flex gap-2">
    <button id="btn-z-report" class="btn btn-info">Z-Report (Today)</button>
    <button id="btn-pl" class="btn btn-secondary">Profit/Loss</button>
  </div>`;
  el('btn-z-report').onclick = handlers.generateZReport;
  el('btn-pl').onclick = handlers.openProfitLossModal;
}

export function renderSettings() {
  const root = el('settings-root');
  if (!root) return;
  root.innerHTML = `<ul class="list-group">
    <li class="list-group-item">Store Information</li>
    <li class="list-group-item">Tax Configuration</li>
    <li class="list-group-item">Payment Methods Setup</li>
    <li class="list-group-item">Receipt Templates</li>
    <li class="list-group-item">Discounts & Promotions</li>
    <li class="list-group-item">Loyalty Program Rules</li>
    <li class="list-group-item">Security & Permissions</li>
  </ul>`;
}

export function renderAccounting() {
  const root = el('accounting-root');
  if (!root) return;
  root.innerHTML = `<ul class="list-group">
    <li class="list-group-item">Open/Close Register</li>
    <li class="list-group-item">Cash Drops</li>
    <li class="list-group-item">End of Day Reconciliation</li>
    <li class="list-group-item">Refund Tracking</li>
    <li class="list-group-item">Gift Card Balances</li>
  </ul>`;
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
  root.innerHTML = `<div>See User Guide and Training Mode in Help. (Placeholder)</div>`;
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
  root.innerHTML = '<div class="text-muted">Floor plan coming soon.</div>';
}

export async function renderKitchen() {
  const root = el('kitchen-root');
  if (!root) return;
  root.innerHTML = '<div class="text-muted">Loading queue…</div>';
  try {
    const data = await api.getPendingOrders();
    const kitchenOrders = (data.orders || []).filter(o => o.status === 'pending');
    ui.renderOrderQueue(kitchenOrders);
    root.innerHTML = '<div class="text-muted">Queue shown below in Home/Kitchen view.</div>';
  } catch {
    root.innerHTML = '<div class="text-danger">Failed to load queue.</div>';
  }
}
