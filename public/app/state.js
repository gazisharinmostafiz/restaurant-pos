export const CURRENCY = '£';

export const state = {
  currentUser: null,
  currentUserRole: '',
  menu: {},
  currentOrder: [],
  selectedOrderId: null,
  selectedOrderBalance: null,
  activePaymentMethod: null,
};

export const getState = () => state;
export const setState = (patch) => Object.assign(state, patch);

export const setCurrentOrder = (items) => { state.currentOrder = items || []; };
export const clearCurrentOrder = () => { state.currentOrder = []; };
export const addItemToOrder = (item) => {
  const existing = state.currentOrder.find(i => i.name === item.name);
  if (existing) existing.quantity += 1; else state.currentOrder.push({ ...item, quantity: 1 });
};
