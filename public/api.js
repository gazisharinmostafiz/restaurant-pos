async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, { credentials: 'include', ...options });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    } catch (error) {
        console.error(`API call to ${url} failed:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
}

export const checkSession = () => apiFetch('/api/session');

export const login = (username, password) => apiFetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
});

export const logout = () => apiFetch('/api/logout', { method: 'POST' });

export const getMenu = () => apiFetch('/api/menu');

export const placeOrder = (orderData) => apiFetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData),
});

export const getPendingOrders = () => apiFetch('/api/orders/pending');

export const getCompletedOrders = (date = null, paymentMethod = null) => {
    let url = '/api/orders/completed';
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (paymentMethod) params.append('paymentMethod', paymentMethod);
    if (params.toString()) url += `?${params.toString()}`;
    return apiFetch(url);
};

export const updateOrderStatus = (orderId, status) => apiFetch(`/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
});

export const completeOrder = (orderId, paymentData) => apiFetch(`/api/orders/${orderId}/complete`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paymentData),
});

export const appendOrderItems = (orderId, items) => apiFetch(`/api/orders/${orderId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
});

export const saveStock = (updates) => apiFetch('/api/stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
});

export const getZReport = () => apiFetch('/api/reports/z');

export const getProfitLossReport = (startDate, endDate) => {
    let url = '/api/reports/profit-loss';
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;
    return apiFetch(url);
};

export const getUsers = () => apiFetch('/api/users');

export const createUser = (userData) => apiFetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
});

export const updateUser = (userId, userData) => apiFetch(`/api/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
});

export const deleteUser = (userId) => apiFetch(`/api/users/${userId}`, {
    method: 'DELETE',
});

export const addMenuItem = (itemData) => apiFetch('/api/menu/item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemData),
});

export const updateMenuItem = (itemId, itemData) => apiFetch(`/api/menu/item/${itemId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(itemData),
});

export const deleteMenuItem = (itemId) => apiFetch(`/api/menu/item/${itemId}`, {
    method: 'DELETE',
});

export const getAdminDashboardSummary = () => apiFetch('/api/admin/dashboard-summary');

// Payments (split/partial)
export const addOrderPayment = (orderId, method, amount) => apiFetch(`/api/orders/${orderId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, amount }),
});
