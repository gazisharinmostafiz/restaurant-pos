// Minimal API wrapper with credentials included
export async function apiFetch(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers||{}) }, ...options });
  if (!res.ok) {
    const err = await res.json().catch(()=>({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Auth
export const checkSession = () => apiFetch('/api/session');
export const login = (username, password) => apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password })});
export const logout = () => apiFetch('/api/logout', { method: 'POST' });

// Core data
export const getMenu = () => apiFetch('/api/menu');
export const getPendingOrders = () => apiFetch('/api/orders/pending');
export const placeOrder = (orderData) => apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(orderData)});
export const appendOrderItems = (orderId, items) => apiFetch(`/api/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify({ items })});
export const updateOrderStatus = (orderId, status) => apiFetch(`/api/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status })});
export const completeOrder = (orderId, paymentData) => apiFetch(`/api/orders/${orderId}/complete`, { method: 'PATCH', body: JSON.stringify(paymentData)});
export const addOrderPayment = (orderId, method, amount) => apiFetch(`/api/orders/${orderId}/payments`, { method: 'POST', body: JSON.stringify({ method, amount })});
export const getCompletedOrders = (date, paymentMethod) => {
  let url = '/api/orders/completed'; const params=new URLSearchParams();
  if (date) params.append('date', date); if (paymentMethod) params.append('paymentMethod', paymentMethod);
  if (params.toString()) url += `?${params.toString()}`;
  return apiFetch(url);
}

// Inventory
export const saveStock = (updates) => apiFetch('/api/stock', {
  method: 'POST',
  body: JSON.stringify({ updates })
});

export const addMenuItem = (itemData) => apiFetch('/api/menu/item', {
  method: 'POST',
  body: JSON.stringify(itemData)
});

export const updateMenuItem = (itemId, itemData) => apiFetch(`/api/menu/item/${itemId}`, {
  method: 'PUT',
  body: JSON.stringify(itemData)
});

export const deleteMenuItem = (itemId) => apiFetch(`/api/menu/item/${itemId}`, {
  method: 'DELETE'
});

// Profile
export const getProfile = () => apiFetch('/api/profile/me');
export const updateProfile = (data) => apiFetch('/api/profile/me', { method: 'PUT', body: JSON.stringify(data) });
export const changePassword = (oldPassword, newPassword) => apiFetch('/api/profile/password', { method: 'PUT', body: JSON.stringify({ oldPassword, newPassword }) });
