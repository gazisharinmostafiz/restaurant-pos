import { getState, setState, clearCurrentOrder } from './state.js';
const CURRENCY = '£';
import * as api from './api.js';

export function openPaymentModal(method){
  const { selectedOrderId, currentOrder } = getState();
  if (!selectedOrderId) return toast('Please select a pending order first.');
  if (!currentOrder.length) return toast('No items to pay for.');
  setState({ activePaymentMethod: method });
  updatePaymentDetails(true);
  show('#payment-modal');
}

export function updatePaymentDetails(reset=false){
  const { currentOrder, selectedOrderBalance } = getState();
  const amountEl = q('#amount-tendered');
  const dp = q('#discount-percent');
  const dc = q('#discount-cash');
  if (reset){ if (dp) dp.value=''; if (dc) dc.value=''; if (amountEl) amountEl.value=''; }
  const baseDue = (typeof selectedOrderBalance === 'number') ? selectedOrderBalance : currentOrder.reduce((s,i)=>s+i.price*i.quantity,0);
  const p = dp ? (parseFloat(dp.value)||0) : 0;
  const c = dc ? (parseFloat(dc.value)||0) : 0;
  const discount = Math.max(0, (baseDue*(p/100))+c);
  const due = Math.max(0, baseDue - discount);
  const tendered = parseFloat(amountEl?.value)||0;
  const change = Math.max(0, tendered - due);
  q('#payment-total-due').textContent = `${CURRENCY}${due.toFixed(2)}`;
  q('#payment-change-due').textContent = `${CURRENCY}${change.toFixed(2)}`;
}

export async function processPayment(){
  const { selectedOrderId, activePaymentMethod, currentOrder, selectedOrderBalance } = getState();
  if (!selectedOrderId || !activePaymentMethod) return toast('Payment details are missing.');
  const dp = q('#discount-percent'); const dc = q('#discount-cash');
  let tendered = parseFloat(q('#amount-tendered').value)||0;
  const baseDue = (typeof selectedOrderBalance === 'number') ? selectedOrderBalance : currentOrder.reduce((s,i)=>s+i.price*i.quantity,0);
  const p = dp ? (parseFloat(dp.value)||0) : 0; const c = dc ? (parseFloat(dc.value)||0) : 0;
  const discount = Math.max(0, (baseDue*(p/100))+c);
  const due = Math.max(0, baseDue - discount);
  if (tendered <= 0) tendered = due;
  // partial path
  if (discount===0 && tendered>0 && tendered<due){
    try{
      const res = await api.addOrderPayment(selectedOrderId, activePaymentMethod, tendered);
      if (!res.success) return toast(res.error||'Failed to add payment.');
      window.lastPayment = { orderId: selectedOrderId, method: activePaymentMethod, tendered, discount: 0, due, change: 0, partial: true, remaining: Number(res.balance)||Math.max(0,due-tendered) };
      toast(`Paid ${CURRENCY}${tendered.toFixed(2)} via ${activePaymentMethod}. Remaining ${CURRENCY}${Number(res.balance).toFixed(2)}.`);
      clearAndRefresh();
      return;
    }catch{ return toast('Error processing partial payment.'); }
  }
  // full settlement
  try{
    const result = await api.completeOrder(selectedOrderId, { paymentMethod: activePaymentMethod, discount });
    if (result.success){
      const change = Math.max(0, tendered - due);
      let msg = `Payment of ${CURRENCY}${due.toFixed(2)} successful via ${activePaymentMethod}.`;
      if (activePaymentMethod==='cash' && change>0) msg += ` Change due: ${CURRENCY}${change.toFixed(2)}.`;
      window.lastPayment = { orderId: selectedOrderId, method: activePaymentMethod, tendered, discount, due, change, partial: false };
      toast(msg);
      clearAndRefresh();
    }else toast(result.error||'Payment failed.');
  }catch{ toast('Error processing payment.'); }
}

function clearAndRefresh(){
  clearCurrentOrder();
  hide('#payment-modal');
  setState({ selectedOrderId: null, activePaymentMethod: null, selectedOrderBalance: null });
  if (window.fetchPendingOrdersForPayment) window.fetchPendingOrdersForPayment();
}

function q(sel){ return document.querySelector(sel); }
function show(sel){ const el=q(sel); if (el) el.style.display='block'; }
function hide(sel){ const el=q(sel); if (el) el.style.display='none'; }
function toast(msg){ if (window.ui && window.ui.showToast) window.ui.showToast(msg); else alert(msg); }
