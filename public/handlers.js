import * as api from './api.js';
import * as ui from './ui.js';
import { getState, setState, setCurrentOrder, addItemToOrder, clearCurrentOrder } from './state.js';

let salesChart = null;

function applyRoleBasedUI(role) {
    const allSections = ['#menu-section', '#pending-orders-section', '#order-section', '#queue-section', '#admin-dashboard-section'];
    const adminOnlySidebar = ['#manage-stock-sidebar-item', '#manage-users-sidebar-item'];
    const adminOnlyHeader = ['#z-report-btn', '#profit-loss-btn'];

    // Hide everything first
    [...allSections, ...adminOnlySidebar, ...adminOnlyHeader, '#add-order-btn', '#view-old-orders-btn'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) el.style.display = 'none';
    });

    // Show elements based on role
    let visibleElements = [];
    switch (role) {
        case 'admin':
            visibleElements = ['#admin-dashboard-section', ...adminOnlySidebar, ...adminOnlyHeader];
            break;
        case 'front':
            visibleElements = ['#menu-section', '#pending-orders-section', '#order-section', '#add-order-btn', '#view-old-orders-btn'];
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
        adminOnlySidebar.forEach(sel => {
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
            if (data.user.role === 'admin') {
                fetchAdminDashboardData();
            }
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

async function fetchAdminDashboardData() {
    try {
        const summary = await api.getAdminDashboardSummary();
        ui.renderAdminDashboard(summary);
    } catch (error) {
        console.error('Failed to fetch admin dashboard data:', error);
        ui.showToast('Could not load admin dashboard data.', 'error');
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

    // If table order and an existing open order for the same table exists, ask waiter to add items or create new
    if (orderType === 'table') {
        try {
            const data = await api.getPendingOrders();
            const open = (data.orders || []).find(o => (o.destination === destination) && (o.status === 'pending' || o.status === 'ready'));
            if (open) {
                setState({ tableOrderDecision: { existingOrderId: open.id, orderData } });
                const modal = document.getElementById('table-order-confirm-modal');
                const text = document.getElementById('table-order-confirm-text');
                if (text) text.textContent = `${destination} already has an open order (#${open.id}). Add items to existing order or create a new order?`;
                if (modal) modal.style.display = 'block';
                return; // Wait for decision
            }
        } catch (err) {
            console.error('Failed checking existing table order', err);
        }
    }

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

export async function confirmAddToExistingTableOrder() {
    const decision = (getState().tableOrderDecision) || null;
    if (!decision) return;
    try {
        const res = await api.appendOrderItems(decision.existingOrderId, decision.orderData.items);
        if (res && res.success) {
            ui.showToast(`Items added to order #${decision.existingOrderId}.`, 'success');
            clearCurrentOrder();
            ui.renderOrder();
        } else {
            ui.showToast(res.error || 'Failed to append items.', 'error');
        }
    } catch (err) {
        console.error('Append items failed:', err);
        ui.showToast('Error connecting to server.', 'error');
    } finally {
        const modal = document.getElementById('table-order-confirm-modal');
        if (modal) modal.style.display = 'none';
    }
}

export async function confirmCreateNewTableOrder() {
    const decision = (getState().tableOrderDecision) || null;
    if (!decision) return;
    try {
        const result = await api.placeOrder(decision.orderData);
        if (result.orderId) {
            ui.showToast(`Order #${result.orderId} sent to the kitchen!`, 'success');
            clearCurrentOrder();
            ui.renderOrder();
        } else {
            ui.showToast(result.error || 'Failed to place order.', 'error');
        }
    } catch (err) {
        console.error('Error placing order:', err);
        ui.showToast('Error connecting to the server to place order.', 'error');
    } finally {
        const modal = document.getElementById('table-order-confirm-modal');
        if (modal) modal.style.display = 'none';
    }
}

export function handleCategorySelect(category) {
    ui.activateCategoryPane(category);
    ui.displayCategoryTabItems(category);
    ui.updateActiveTabStockBadges();
    document.querySelectorAll('.menu-categories .nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`.menu-categories .nav-link[data-category="${category}"]`).classList.add('active');
}

// --- Sales Utilities ---
export function handleLookupAdd() {
    const input = document.getElementById('lookup-input');
    if (!input) return;
    const term = (input.value || '').trim().toLowerCase();
    if (!term) return;
    const { menu } = getState();
    const all = Object.values(menu || {}).flat();
    let found = null;
    // ID match
    if (/^\d+$/.test(term)) {
        const idNum = parseInt(term, 10);
        found = all.find(i => i.id === idNum);
    }
    // Name contains
    if (!found) found = all.find(i => (i.name || '').toLowerCase().includes(term));
    if (!found) {
        ui.showToast('Item not found.', 'error');
        return;
    }
    addItemToOrder(found);
    ui.renderOrder();
    input.value = '';
}

export function suspendCurrentSale() {
    const { currentOrder } = getState();
    if (!currentOrder || !currentOrder.length) {
        return ui.showToast('No items to suspend.', 'error');
    }
    const key = 'suspendedSales';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    const ticket = {
        id: Date.now(),
        at: new Date().toISOString(),
        order: currentOrder,
    };
    list.push(ticket);
    localStorage.setItem(key, JSON.stringify(list));
    clearCurrentOrder();
    ui.renderOrder();
    ui.showToast('Sale suspended.');
}

export function openSuspendedSalesModal() {
    const modal = document.getElementById('suspended-sales-modal');
    const listEl = document.getElementById('suspended-sales-list');
    if (!modal || !listEl) return;
    const list = JSON.parse(localStorage.getItem('suspendedSales') || '[]');
    listEl.innerHTML = '';
    if (!list.length) {
        listEl.innerHTML = '<li class="list-group-item">No suspended sales.</li>';
    } else {
        list.forEach(t => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            const total = t.order.reduce((s, it) => s + it.price * it.quantity, 0);
            li.innerHTML = `<span>Ticket ${t.id} — ${new Date(t.at).toLocaleString()} — Total £${total.toFixed(2)}</span>
                <div class="btn-group">
                    <button class="btn btn-sm btn-primary" data-action="resume" data-id="${t.id}">Resume</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${t.id}">Delete</button>
                </div>`;
            listEl.appendChild(li);
        });
        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = parseInt(btn.dataset.id, 10);
            let list = JSON.parse(localStorage.getItem('suspendedSales') || '[]');
            const idx = list.findIndex(x => x.id === id);
            if (idx === -1) return;
            if (btn.dataset.action === 'resume') {
                setState({ currentOrder: list[idx].order });
                ui.renderOrder();
                list.splice(idx, 1);
                localStorage.setItem('suspendedSales', JSON.stringify(list));
                modal.style.display = 'none';
                ui.showToast('Sale resumed.');
            } else if (btn.dataset.action === 'delete') {
                list.splice(idx, 1);
                localStorage.setItem('suspendedSales', JSON.stringify(list));
                btn.closest('li').remove();
            }
        }, { once: true });
    }
    modal.style.display = 'block';
}

function buildReceiptText(orderItems, title = 'Receipt') {
    const lines = [title, '------------------------------'];
    let total = 0;
    orderItems.forEach(it => {
        const line = `${it.name} x ${it.quantity} = £${(it.price * it.quantity).toFixed(2)}`;
        total += it.price * it.quantity;
        lines.push(line);
    });
    lines.push('------------------------------');
    lines.push(`Total: £${total.toFixed(2)}`);
    return lines.join('\n');
}

export function printReceipt() {
    const { currentOrder } = getState();
    if (!currentOrder || !currentOrder.length) return ui.showToast('No items to print.', 'error');
    const text = buildReceiptText(currentOrder, 'Tong POS — Provisional Receipt');
    const w = window.open('', 'PRINT', 'height=650,width=900,top=100,left=150');
    if (!w) return;
    w.document.write(`<pre style="font-family:monospace">${text}</pre>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
}

export function emailReceipt() {
    const { currentOrder } = getState();
    if (!currentOrder || !currentOrder.length) return ui.showToast('No items to email.', 'error');
    const text = encodeURIComponent(buildReceiptText(currentOrder, 'Tong POS — Receipt'));
    window.location.href = `mailto:?subject=Your%20Tong%20POS%20Receipt&body=${text}`;
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
            ui.updateActiveTabStockBadges();
            return;
        }
    }
}

export function handleRemoveItem(index) {
    const { currentOrder } = getState();
    currentOrder.splice(index, 1);
    ui.renderOrder();
    ui.updateActiveTabStockBadges();
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
    ui.updateActiveTabStockBadges();
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
    (async () => {
        try {
            const data = await api.getPendingOrders();
            const match = (data.orders || []).find(o => String(o.id) === String(orderId));
            if (match && typeof match.balance !== 'undefined') {
                setState({ selectedOrderBalance: Number(match.balance) });
            }
        } catch (e) {}
    })();
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

    const baseDue = (typeof getState().selectedOrderBalance === 'number') ? getState().selectedOrderBalance : currentOrder.reduce((s, i) => s + i.price * i.quantity, 0);
    const discount = parseFloat(discountInput.value) || 0;
    const finalTotal = Math.max(0, baseDue - discount);
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
    const baseDue = (typeof getState().selectedOrderBalance === 'number') ? getState().selectedOrderBalance : currentOrder.reduce((s, i) => s + i.price * i.quantity, 0);
    const finalTotal = Math.max(0, baseDue - discount);

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

export async function fetchAndShowOldOrders(date = null, paymentMethod = null) {
    try {
        // If no filters are provided, ensure the inputs are cleared
        if (date === null && paymentMethod === null) {
            document.getElementById('old-orders-date-filter').value = '';
            document.getElementById('old-orders-payment-filter').value = '';
        }
        const data = await api.getCompletedOrders(date, paymentMethod);
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

export async function openProfitLossModal() {
    const modal = document.getElementById('profit-loss-modal');
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('profit-loss-start-date').value = today;
    document.getElementById('profit-loss-end-date').value = today;
    document.getElementById('profit-loss-results').innerHTML = '';
    modal.style.display = 'block';
}

export async function handleGenerateProfitLossReport() {
    const startDate = document.getElementById('profit-loss-start-date').value;
    const endDate = document.getElementById('profit-loss-end-date').value;
    try {
        const report = await api.getProfitLossReport(startDate, endDate);
        ui.renderProfitLossReport(report);
    } catch (error) {
        ui.showToast('Failed to generate Profit/Loss report.', 'error');
        console.error('Error generating Profit/Loss report:', error);
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
        ui.buildCategoryTabPanes(newMenu);
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
