async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
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

export const getCompletedOrders = (date = null) => {
    let url = '/api/orders/completed';
    if (date) url += `?date=${date}`;
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

export const saveStock = (updates) => apiFetch('/api/stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
});

export const getZReport = () => apiFetch('/api/reports/z');

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