import * as api from './api.js';
import { getState, setState, setCurrentOrder, clearCurrentOrder } from './state.js';
import { updatePaymentDetails, openPaymentModal, processPayment } from './payments.js';
import { initSession, loadMenu, placeOrder, addToExisting, newOrderForTable, handleNewOrder, selectPending, refreshPending, addItemFromClick, renderOrder, suspendSale, resumeSale, printReceipt, emailReceipt } from './orders.js';
import { applyRoleUI } from './roles.js';
import { initRouter } from '../router.js';
import { initializeUserManagement } from '../manage-users.js';

// Expose for inline onclick
import * as classic from '../handlers.clean.js';
window.handlers = { 
  openPaySelectedModal: classic.openPaySelectedModal,
  processPaySelectedFull: classic.processPaySelectedFull,
  processPaySelectedPartial: classic.processPaySelectedPartial,
  confirmAddToExistingTableOrder: addToExisting, 
  confirmCreateNewTableOrder: newOrderForTable 
};

document.addEventListener('DOMContentLoaded', () => {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 1) {
    document.body.classList.add('touch-mode');
  }
  wire();
  // Normalize Pound placeholders before dynamic render
  const p1=document.getElementById('total-price'); if (p1) p1.textContent='£0.00';
  const p2=document.getElementById('payment-total-due'); if (p2) p2.textContent='£0.00';
  const p3=document.getElementById('payment-change-due'); if (p3) p3.textContent='£0.00';
  // ensure admin user management modal works
  try { initializeUserManagement(); } catch {}
  initSession().finally(() => {
    // periodic live updates for lifetime data freshness
    setInterval(() => {
      if (document.querySelector('#main-dashboard')?.classList.contains('active') || document.querySelector('#main-dashboard')) {
        refreshPending().catch(()=>{});
      }
    }, 15000);
    setInterval(() => {
      if (document.querySelector('#main-dashboard')) {
        // kitchen refresh if visible somewhere
        if (window.fetchOrderQueue) window.fetchOrderQueue();
      }
    }, 10000);
    // apply role-based UI once session is in state
    setTimeout(applyRoleUIFromSession, 500);
    // enable hash-based navigation between sections
    initRouter();
    // fetch store settings for receipts/tax
    fetch('/api/settings/store').then(r=>r.json()).then(d=>{ window.storeInfo = { name: d.name||'', address: d.address||'', phone: d.phone||'', taxRate: Number(d.tax_rate)||0, logoUrl: d.logo_url||'' }; }).catch(()=>{});
  });
});

function wire(){
  q('#login-form')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const u=val('#username'); const p=val('#password'); try{ const d=await api.login(u,p); if (d.success) initSession(); else alert(d.error||'Login failed.'); }catch{ alert('Login error'); }});
  q('#logout-btn')?.addEventListener('click', async ()=>{ await api.logout(); location.reload(); });

  q('#add-order-btn')?.addEventListener('click', handleNewOrder);
  q('#place-order-btn')?.addEventListener('click', placeOrder);
  q('#order-type-select')?.addEventListener('change', (e)=>{ const show = e.target.value==='table'; q('#table-select').style.display = show? 'inline-block':'none'; });

  // Menu interactions
  d('.menu-categories')?.addEventListener('click', (e)=>{ const link=e.target.closest('.menu-category-btn'); if (!link) return; e.preventDefault(); /* fetch items already loaded */ });
  q('#category-tab-content')?.addEventListener('click', (e)=>{ const el=e.target.closest('.menu-item'); if (!el) return; addItemFromClick(el); });
  // Keyboard support: Enter/Space to add item
  q('#category-tab-content')?.addEventListener('keydown', (e)=>{ const el=e.target.closest('.menu-item'); if (!el) return; if (e.key==='Enter' || e.key===' '){ e.preventDefault(); addItemFromClick(el); }});
  // Normalize currency in item cards and set a11y attributes when cards are rendered
  const cat = q('#category-tab-content');
  if (cat){
    const fix = () => {
      cat.querySelectorAll('.menu-item').forEach(card=>{
        card.setAttribute('role','button'); card.tabIndex = 0;
        const priceEl = card.querySelector('.item-price');
        if (priceEl){ const txt = priceEl.textContent||''; if (!txt.trim().startsWith('£')) priceEl.textContent = '£'+txt.replace(/^[^\d.]*/,''); }
      });
    };
    const mo = new MutationObserver((muts)=>{ for (const m of muts){ if (m.addedNodes && m.addedNodes.length){ fix(); break; } } });
    mo.observe(cat, { childList:true, subtree:true });
    setTimeout(fix, 300);
  }

  // Current order
  q('#order-list')?.addEventListener('click', (e)=>{ const item=e.target.closest('.list-group-item'); if (!item) return; const idx=parseInt(item.dataset.index,10); if (e.target.classList.contains('remove-item-btn')){ const s=getState(); s.currentOrder.splice(idx,1); renderOrder(); } else if (e.target.classList.contains('quantity-btn')){ const s=getState(); const act=e.target.dataset.action; if (act==='increment') s.currentOrder[idx].quantity++; else if (s.currentOrder[idx].quantity>1) s.currentOrder[idx].quantity--; else s.currentOrder.splice(idx,1); renderOrder(); } });

  // Pending orders & payment
  q('#pending-orders-list')?.addEventListener('click', (e)=>{ const target=e.target.closest('.pending-order-item'); if (target) selectPending(target); });
  q('#pay-cash-btn')?.addEventListener('click', ()=>openPaymentModal('cash'));
  q('#pay-card-btn')?.addEventListener('click', ()=>openPaymentModal('card'));
  q('#confirm-payment-btn')?.addEventListener('click', processPayment);
  q('#amount-tendered')?.addEventListener('input', ()=>updatePaymentDetails(false));
  q('#discount-percent')?.addEventListener('input', ()=>updatePaymentDetails(false));
  q('#discount-cash')?.addEventListener('input', ()=>updatePaymentDetails(false));

  // Suspend/Resume/Receipt
  q('#suspend-sale-btn')?.addEventListener('click', suspendSale);
  q('#resume-sale-btn')?.addEventListener('click', resumeSale);
  q('#print-receipt-btn')?.addEventListener('click', printReceipt);
  q('#email-receipt-btn')?.addEventListener('click', emailReceipt);

  // Table confirm modal closes
  document.querySelectorAll('#table-order-confirm-modal .close-btn').forEach(btn=> btn.addEventListener('click', ()=> hide('#table-order-confirm-modal')));

  // Global modal close handlers: click on (x) or on backdrop closes the modal
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e)=>{
      if (e.target === modal || e.target.classList.contains('close-btn')) {
        modal.style.display = 'none';
      }
    });
  });

  // ESC key closes any open modal
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach(m=>{ if (m.style.display==='block') m.style.display='none'; });
    }
  });

  // Manage Stock (sidebar shortcut)
  q('#manage-stock-sidebar-item')?.addEventListener('click', async ()=>{
    try {
      const data = await api.getMenu();
      const byCat={}; data.menu.forEach(item=>{ if(!byCat[item.category]) byCat[item.category]=[]; byCat[item.category].push(item); });
      setState({ menu: byCat });
      if (window.ui && window.ui.renderStockModal) window.ui.renderStockModal(byCat);
    } catch {}
  });
  // Save Stock button in modal
  q('#save-stock-btn')?.addEventListener('click', async ()=>{
    const inputs = Array.from(document.querySelectorAll('#stock-modal .stock-quantity-input'));
    const updates = inputs
      .map(inp=>({ id: parseInt(inp.getAttribute('data-id')||'0',10)||0, name: inp.getAttribute('data-name')||'', stock: Number(inp.value)||0 }))
      .filter(u => u.id > 0 && u.stock >= 0);
    try {
      const res = await api.saveStock(updates);
      if (res && res.success) { toast('Stock levels updated.'); hide('#stock-modal'); await loadMenu(); }
      else toast(res.error||'Failed to update stock');
    } catch (e) { toast((e && e.message) || 'Error updating stock.'); }
  });

  // Stock modal interactions: adjust, set, edit, delete, search, and form submit
  const stockList = document.getElementById('stock-list-accordion');
  if (stockList) {
    stockList.addEventListener('click', (e)=>{
      const target = e.target;
      if (target.classList.contains('stock-adj-btn')) return classic.handleStockAdjustment(target);
      if (target.classList.contains('set-stock-btn')) return classic.handleSetStock(target);
      if (target.classList.contains('edit-item-btn')) {
        const itemId = parseInt(target.closest('.stock-item')?.dataset.itemId||'0',10);
        if (itemId) classic.handleEditMenuItem(itemId);
        return;
      }
      if (target.classList.contains('delete-item-btn')) {
        const itemId = parseInt(target.closest('.stock-item')?.dataset.itemId||'0',10);
        if (itemId) classic.handleDeleteMenuItem(itemId);
        return;
      }
    });
  }
  q('#stock-search-input')?.addEventListener('input', classic.handleStockSearch);
  const menuItemForm = document.getElementById('menu-item-form');
  if (menuItemForm) menuItemForm.addEventListener('submit', classic.handleMenuItemFormSubmit);
  q('#clear-menu-item-form-btn')?.addEventListener('click', ()=>{ if (window.ui && window.ui.clearMenuItemForm) window.ui.clearMenuItemForm(); });
}

function q(s){ return document.querySelector(s); }
function d(s){ return document.querySelector(s); }
function val(s){ const el=q(s); return el?el.value:''; }
function hide(s){ const el=q(s); if (el) el.style.display='none'; }
function toast(m){ if (window.ui && window.ui.showToast) window.ui.showToast(m); else alert(m); }

function applyRoleUIFromSession(){
  const { currentUserRole } = getState();
  if (!currentUserRole) return;
  applyRoleUI(currentUserRole);
}
