import * as api from './api.js';
import * as ui from './ui.js';
import { getState, setState, setCurrentOrder, addItemToOrder, clearCurrentOrder } from './state.js';

let salesChart = null;

function applyRoleBasedUI(role) {
    const allSections = ['#menu-section', '#pending-orders-section', '#order-section', '#queue-section'];
    const adminOnly = ['#manage-stock-sidebar-item', '#manage-users-sidebar-item', '#z-report-btn'];
    const frontDesk = ['#menu-section', '#pending-orders-section', '#order-section', '#add-order-btn', '#view-old-orders-btn'];

    // Hide everything first
    [...allSections, ...adminOnly, '#add-order-btn', '#view-old-orders-btn'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.style.display = 'none';
    });

    // Show elements based on role
    let visibleElements = [];
    switch (role) {
        case 'admin':
            visibleElements = [...allSections, ...adminOnly, '#add-order-btn', '#view-old-orders-btn'];
            break;
        case 'front':
            visibleElements = frontDesk;
            break;
        case 'waiter':
            visibleElements = ['#menu-section', '#order-section', '#add-order-btn'];
            break;
        case 'kitchen':
            visibleElements = ['#queue-section'];
            break;
    }

    visibleElements.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.style.display = ''; // Reset to default display
    });

    // Special handling for sidebar items, which are list items
    if (role === 'admin') {
        adminOnly.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.style.display = 'list-item';
        });
    }
}

export async function initializeApp() {
    try {
        const data = await api.checkSession();
        if (data.loggedIn) {
            setState({ currentUser: data.user, currentUserRole: data.user.role });
            ui.showDashboard();
            applyRoleBasedUI(data.user.role);
            await fetchMenu();
            // Role-specific data fetching
            if (data.user.role === 'admin' || data.user.role === 'front') {
                fetchPendingOrdersForPayment();
                setInterval(fetchPendingOrdersForPayment, 15000);
            }
            if (data.user.role === 'admin' || data.user.role === 'kitchen') {
                fetchOrderQueue();
                setInterval(fetchOrderQueue, 10000);
            }
        } else {
            ui.showLoginScreen();
        }
    } catch (error) {
        ui.showToast('Cannot connect to server.', 'error');
    }
}

export async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    try {
        const data = await api.login(username, password);
        if (data.success) {
            await initializeApp();
        } else {
            ui.showToast(data.error || 'Login failed.', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        ui.showToast('Error during login.', 'error');
    }
}

export async function handleLogout() {
    await api.logout();
    setState({ currentUser: null, currentUserRole: '', currentOrder: [], selectedOrderId: null });
    ui.showLoginScreen();
    ui.renderOrder();
}

export function handleNewOrder() {
    clearCurrentOrder();
    document.querySelectorAll('.pending-order-item.selected').forEach(el => el.classList.remove('selected'));
    document.getElementById('place-order-btn').disabled = false;
    ui.showToast('Ready to create a new order.');
    ui.renderOrder();
}

export async function handlePlaceOrder() {
    const { currentOrder } = getState();
    if (currentOrder.length === 0) {
        return ui.showToast('Cannot place an empty order.', 'error');
    }

    const orderType = document.getElementById('order-type-select').value;
    const destination = (orderType === 'table') ? `Table ${document.getElementById('table-select').value}` : 'Takeaway';

    const orderData = { orderType, destination, items: currentOrder };

    try {
        const result = await api.placeOrder(orderData);
        if (result.orderId) {
            ui.showToast(`Order #${result.orderId} sent to the kitchen!`, 'success');
            clearCurrentOrder();
            ui.renderOrder();
            await fetchMenu(); // Refresh menu to show updated stock
        } else {
            ui.showToast(result.error || 'Failed to place order.', 'error');
        }
    } catch (err) {
        console.error('Error placing order:', err);
        ui.showToast('Error connecting to the server to place order.', 'error');
    }
}

export function handleCategorySelect(category) {
    ui.displayMenuItems(category);
    document.querySelectorAll('.menu-categories .nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`.menu-categories .nav-link[data-category="${category}"]`).classList.add('active');
}

export function handleAddItemToOrder(itemElement) {
    const { menu } = getState();
    const itemName = itemElement.dataset.name;
    // Find the full item object from the menu state
    for (const category in menu) {
        const item = menu[category].find(i => i.name === itemName);
        if (item) {
            addItemToOrder(item);
            ui.renderOrder();
            return;
        }
    }
}

export function handleRemoveItem(index) {
    const { currentOrder } = getState();
    currentOrder.splice(index, 1);
    ui.renderOrder();
}

export function handleUpdateQuantity(index, action) {
    const { currentOrder } = getState();
    const item = currentOrder[index];
    if (action === 'increment') {
        item.quantity++;
    } else if (item.quantity > 1) {
        item.quantity--;
    } else {
        handleRemoveItem(index);
    }
    ui.renderOrder();
}

export function handleSelectPendingOrder(target) {
    const orderId = target.dataset.orderId;
    const orderItems = JSON.parse(target.dataset.items || '[]');
    document.querySelectorAll('.pending-order-item.selected').forEach(el => el.classList.remove('selected'));
    target.classList.add('selected');
    setState({ selectedOrderId: orderId });
    setCurrentOrder(orderItems);
    document.getElementById('place-order-btn').disabled = true;
    ui.renderOrder();
}

export function openPaymentModal(method) {
    const { selectedOrderId, currentOrder } = getState();
    if (!selectedOrderId) return ui.showToast('Please select a pending order first.', 'error');
    if (currentOrder.length === 0) return ui.showToast('No items to pay for.', 'error');
    
    setState({ activePaymentMethod: method });
    updatePaymentDetails(true); // Reset inputs
    document.getElementById('payment-modal').style.display = 'block';
}

export function updatePaymentDetails(reset = false) {
    const { currentOrder } = getState();
    const discountInput = document.getElementById('discount-amount');
    const amountTenderedInput = document.getElementById('amount-tendered');

    if (reset) {
        discountInput.value = '';
        amountTenderedInput.value = '';
    }

    const total = currentOrder.reduce((s, i) => s + i.price * i.quantity, 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, total - discount);
    const amountTendered = parseFloat(amountTenderedInput.value) || 0;
    const changeDue = Math.max(0, amountTendered - finalTotal);

    document.getElementById('payment-total-due').textContent = `£${finalTotal.toFixed(2)}`;
    document.getElementById('payment-change-due').textContent = `£${changeDue.toFixed(2)}`;
}

export async function processPayment() {
    const { selectedOrderId, activePaymentMethod, currentOrder } = getState();
    if (!selectedOrderId || !activePaymentMethod) return ui.showToast('Payment details are missing.', 'error');

    const discount = parseFloat(document.getElementById('discount-amount').value) || 0;
    const amountTendered = parseFloat(document.getElementById('amount-tendered').value) || 0;
    const total = currentOrder.reduce((s, i) => s + i.price * i.quantity, 0);
    const finalTotal = total - discount;

    if (activePaymentMethod === 'cash' && amountTendered < finalTotal) {
        return ui.showToast('Cash tendered is less than the total amount due.', 'error');
    }

    try {
        const result = await api.completeOrder(selectedOrderId, { paymentMethod: activePaymentMethod, discount });
        if (result.success) {
            const changeDue = Math.max(0, amountTendered - finalTotal);
            let successMessage = `Payment of £${finalTotal.toFixed(2)} successful via ${activePaymentMethod}.`;
            if (activePaymentMethod === 'cash' && changeDue > 0) {
                successMessage += ` Change due: £${changeDue.toFixed(2)}.`;
            }
            ui.showToast(successMessage, 'success');
            clearCurrentOrder();
            ui.renderOrder();
            document.getElementById('payment-modal').style.display = 'none';
            setState({ selectedOrderId: null, activePaymentMethod: null });
            fetchPendingOrdersForPayment();
        } else {
            ui.showToast(result.error || 'Payment failed.', 'error');
        }
    } catch (err) {
        console.error(err);
        ui.showToast('Error processing payment.', 'error');
    }
}

export async function updateOrderStatus(orderId, status) {
    try {
        await api.updateOrderStatus(orderId, status);
        await fetchOrderQueue();
    } catch (err) {
        console.error('Failed to update order status:', err);
        ui.showToast('Failed to update order status.', 'error');
    }
}

export async function fetchAndShowOldOrders(date = null) {
    try {
        const data = await api.getCompletedOrders(date);
        ui.renderOldOrders(data.orders);
    } catch (err) {
        console.error('Failed to fetch old orders:', err);
        ui.showToast('Failed to fetch old orders.', 'error');
    }
}

export async function generateZReport() {
    try {
        const report = await api.getZReport();
        ui.renderZReport(report, salesChart);
    } catch (error) {
        ui.showToast('Failed to generate Z-Report.', 'error');
        console.error('Error generating Z-Report:', error);
    }
}

export async function handleMenuItemFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('menu-item-id').value;
    const name = document.getElementById('menu-item-name').value;
    const price = parseFloat(document.getElementById('menu-item-price').value);
    const category = document.getElementById('menu-item-category').value;
    const stock = parseInt(document.getElementById('menu-item-stock').value, 10);

    const itemData = { name, price, category, stock };

    try {
        if (id) {
            await api.updateMenuItem(id, itemData);
            ui.showToast('Menu item updated successfully!', 'success');
        } else {
            await api.addMenuItem(itemData);
            ui.showToast('Menu item added successfully!', 'success');
        }
        ui.clearMenuItemForm();
        await fetchMenu(); // Refresh the menu
        await openStockModal(); // Refresh the modal content
    } catch (error) {
        ui.showToast(error.message, 'error');
    }
}

export function handleEditMenuItem(itemId) {
    const { menu } = getState();
    for (const category in menu) {
        const item = menu[category].find(i => i.id === itemId);
        if (item) {
            ui.populateMenuItemForm(item);
            break;
        }
    }
}

export async function handleDeleteMenuItem(itemId) {
    if (confirm('Are you sure you want to delete this menu item?')) {
        try {
            await api.deleteMenuItem(itemId);
            ui.showToast('Menu item deleted successfully.', 'success');
            await fetchMenu();
            await openStockModal();
        } catch (error) {
            ui.showToast(error.message, 'error');
        }
    }
}

export async function openStockModal() {
    const { menu } = getState();
    ui.renderStockModal(menu);
    document.getElementById('stock-search-input').addEventListener('input', handleStockSearch);
}

export function handleStockSearch() {
    const { menu } = getState();
    const searchTerm = document.getElementById('stock-search-input').value;
    ui.renderStockModal(menu, searchTerm);
}

export function handleStockAdjustment(button) {
    const action = button.dataset.action;
    const stockItem = button.closest('.stock-item');
    const input = stockItem.querySelector('.stock-quantity-input');
    let currentValue = parseInt(input.value, 10);

    if (action === 'increase') {
        input.value = currentValue + 1;
    } else if (action === 'decrease' && currentValue > 0) {
        input.value = currentValue - 1;
    }
}

export function handleSetStock(button) {
    const stockItem = button.closest('.stock-item');
    const input = stockItem.querySelector('.stock-quantity-input');
    const newValue = prompt('Enter new stock quantity:', input.value);
    if (newValue !== null && !isNaN(newValue) && newValue >= 0) {
        input.value = parseInt(newValue, 10);
    }
}

export async function saveStockChanges() {
    const updates = [];
    document.querySelectorAll('#stock-list-accordion .stock-quantity-input').forEach(input => {
        updates.push({
            name: input.dataset.name,
            stock: parseInt(input.value, 10)
        });
    });

    try {
        await api.saveStock(updates);
        ui.showToast('Stock updated successfully!', 'success');
        document.getElementById('stock-modal').style.display = 'none';
        await fetchMenu();
        const activeCategory = document.querySelector('.menu-categories .nav-link.active')?.dataset.category;
        if (activeCategory) {
            ui.displayMenuItems(activeCategory);
        }
    } catch (error) {
        ui.showToast(error.message || 'Failed to update stock.', 'error');
    }
}

// --- Data Fetching ---
async function fetchMenu() {
    try {
        const data = await api.getMenu();
        const newMenu = {};
        data.menu.forEach(item => {
            if (!newMenu[item.category]) newMenu[item.category] = [];
            newMenu[item.category].push(item);
        });
        setState({ menu: newMenu });
        ui.populateMenuCategories(newMenu);
        if (Object.keys(newMenu).length > 0) {
            const firstCategory = Object.keys(newMenu)[0];
            handleCategorySelect(firstCategory);
        }
    } catch (error) {
        ui.showToast('Failed to load menu.', 'error');
    }
}

async function fetchOrderQueue() {
    try {
        const data = await api.getPendingOrders();
        const kitchenOrders = data.orders.filter(o => o.status === 'pending');
        ui.renderOrderQueue(kitchenOrders);
    } catch (err) {
        console.error('Failed to fetch order queue:', err);
    }
}

async function fetchPendingOrdersForPayment() {
    try {
        const data = await api.getPendingOrders();
        const readyOrders = data.orders.filter(o => o.status === 'ready');
        ui.renderPendingOrders(readyOrders);
    } catch (err) {
        console.error('Failed to fetch pending orders:', err);
    }
}