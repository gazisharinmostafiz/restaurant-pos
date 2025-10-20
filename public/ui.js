import { getState, getCurrentOrder } from './state.js';

// --- DOM Element Cache ---
const orderList = document.getElementById('order-list');
const totalPriceDisplay = document.getElementById('total-price');
const placeOrderBtn = document.getElementById('place-order-btn');
const menuItemsContainer = document.getElementById('menu-items');
const menuCategoriesContainer = document.querySelector('.menu-categories');
const orderQueueList = document.getElementById('order-queue-list');
const pendingOrdersList = document.getElementById('pending-orders-list');
const oldOrdersList = document.getElementById('old-orders-list');
const oldOrdersModal = document.getElementById('old-orders-modal');
const zReportModal = document.getElementById('z-report-modal');
const zReportSummary = document.getElementById('z-report-summary');
const salesChartCanvas = document.getElementById('sales-chart');
const stockListAccordion = document.getElementById('stock-list-accordion');
const stockModal = document.getElementById('stock-modal');
const saveStockBtn = document.getElementById('save-stock-btn');
// Role-based view updates
const loginScreen = document.getElementById('login-screen');
const mainDashboard = document.getElementById('main-dashboard');
const userRoleDisplay = document.getElementById('user-role-display');
const orderDetailsSection = document.getElementById('order-section');
const queueSection = document.getElementById('queue-section');
const addOrderBtn = document.getElementById('add-order-btn');
const pendingOrdersSection = document.getElementById('pending-orders-section');
const zReportBtn = document.getElementById('z-report-btn');
const viewOldOrdersBtn = document.getElementById('view-old-orders-btn');
const payCashBtn = document.getElementById('pay-cash-btn');
const payCardBtn = document.getElementById('pay-card-btn');
const manageStockSidebarItem = document.getElementById('manage-stock-sidebar-item');

// --- UI Rendering Functions ---

export function showLoginScreen() {
    loginScreen.style.display = 'flex';
    loginScreen.classList.add('active');
    mainDashboard.classList.remove('active');
}

export function showDashboard() {
    const { currentUser, currentUserRole } = getState();
    loginScreen.style.display = 'none';
    loginScreen.classList.remove('active');
    mainDashboard.classList.add('active');
    userRoleDisplay.textContent = `${currentUser.username} (${currentUserRole}) Dashboard`;
    saveStockBtn.disabled = true;
}



export function renderOrder() {
    const currentOrder = getCurrentOrder();
    orderList.innerHTML = '';
    let total = 0;
    let hasInsufficientStock = false;

    currentOrder.forEach((item, i) => {
        total += item.price * item.quantity;
        const li = document.createElement('li');
        li.className = `list-group-item order-item ${item.quantity > item.stock ? 'text-danger' : ''}`;
        li.dataset.index = i;
        li.innerHTML = `
            <div class="item-info">
                <div>${item.name} x ${item.quantity}</div>
                <div class="fw-bold">£${(item.price * item.quantity).toFixed(2)}</div>
            </div>
            <div class="item-actions btn-group">
                <button class="btn btn-sm btn-outline-secondary quantity-btn" data-action="decrement">-</button>
                <button class="btn btn-sm btn-outline-secondary quantity-btn" data-action="increment">+</button>
                <button class="btn btn-sm btn-outline-danger remove-item-btn">X</button>
            </div>`;
        orderList.appendChild(li);
        if (item.quantity > item.stock) {
            hasInsufficientStock = true;
        }
    });

    totalPriceDisplay.textContent = `£${total.toFixed(2)}`;
    placeOrderBtn.disabled = hasInsufficientStock;
    if (hasInsufficientStock) showToast('Some items have insufficient stock.', 'error');
}

export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) toastContainer.remove();
        }, 500);
    }, 5000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

export function populateMenuCategories(menu) {
    menuCategoriesContainer.innerHTML = '<li class="nav-title">Menu Categories</li>';
    Object.keys(menu).forEach(category => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `<a class="nav-link menu-category-btn" href="#" data-category="${category}">${category}</a>`;
        menuCategoriesContainer.appendChild(li);
    });
}

export function displayMenuItems(category) {
    const { menu } = getState();
    console.log('Displaying menu for category:', category);
    console.log('Menu data:', menu);
    menuItemsContainer.innerHTML = '';
    (menu[category] || []).forEach(item => {
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.dataset.name = item.name;
        div.innerHTML = `<div>${item.name} (${item.stock} left)</div><div>£${item.price.toFixed(2)}</div>`;
        menuItemsContainer.appendChild(div);
    });
}

export function renderOrderQueue(orders) {
    orderQueueList.innerHTML = '';
    orders.forEach(order => {
        const li = document.createElement('li');
        li.className = 'queue-item';
        const itemsHtml = order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('');
        li.innerHTML = `
            <div class="queue-header">Order #${order.id} - ${order.destination}</div>
            <ul class="queue-details">${itemsHtml}</ul>
            <div class="queue-footer">
                <button class="btn btn-sm btn-success mark-ready-btn" data-order-id="${order.id}">Mark as Ready</button>
            </div>`;
        orderQueueList.appendChild(li);
    });
}

export function renderPendingOrders(orders) {
    pendingOrdersList.innerHTML = '';
    orders.forEach(order => {
        const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const li = document.createElement('li');
        li.className = 'list-group-item pending-order-item';
        li.dataset.orderId = order.id;
        li.dataset.items = JSON.stringify(order.items);
        li.innerHTML = `Order #${order.id} - ${order.destination} - <strong>£${total.toFixed(2)}</strong>`;
        pendingOrdersList.appendChild(li);
    });
}

export function renderOldOrders(orders) {
    oldOrdersList.innerHTML = '';
    orders.forEach(order => {
        const li = document.createElement('li');
        const finalTotal = order.total - order.discount;
        li.innerHTML = `Order #${order.id} - ${new Date(order.timestamp).toLocaleString()} - Total: £${finalTotal.toFixed(2)} (Paid by ${order.payment_method})`;
        oldOrdersList.appendChild(li);
    });
    oldOrdersModal.style.display = 'block';
}

export function renderZReport(report, salesChart) {
    zReportSummary.innerHTML = `
        <p><strong>Total Sales:</strong> £${report.total_sales.toFixed(2)}</p>
        <p><strong>Cash Sales:</strong> £${report.cash_sales.toFixed(2)}</p>
        <p><strong>Card Sales:</strong> £${report.card_sales.toFixed(2)}</p>
    `;

    const ctx = salesChartCanvas.getContext('2d');
    if (salesChart) salesChart.destroy();
    
    salesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cash', 'Card'],
            datasets: [{
                label: 'Sales by Payment Method',
                data: [report.cash_sales, report.card_sales],
                backgroundColor: ['#28a745', '#17a2b8'],
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: true, text: "Today's Sales by Payment Method" }
            }
        }
    });
    zReportModal.style.display = 'block';
}

export function renderStockModal(menu, searchTerm = '') {
    stockListAccordion.innerHTML = '';
    const lowercasedFilter = searchTerm.toLowerCase();

    Object.keys(menu).sort().forEach((category, index) => {
        const filteredItems = menu[category].filter(item => 
            item.name.toLowerCase().includes(lowercasedFilter)
        );

        if (filteredItems.length === 0) return;

        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item';

        const itemsHtml = filteredItems.map(item => `
            <div class="stock-item" data-item-id="${item.id}" data-item-name="${item.name}">
                <span class="stock-item-name">${item.name}</span>
                <div class="stock-item-controls input-group">
                    <button class="btn btn-outline-secondary stock-adj-btn" data-action="decrease">-</button>
                    <input type="number" class="form-control stock-quantity-input" value="${item.stock}" data-name="${item.name}" min="0">
                    <button class="btn btn-outline-secondary stock-adj-btn" data-action="increase">+</button>
                    <button class="btn btn-outline-primary set-stock-btn">Set</button>
                    <button class="btn btn-outline-info edit-item-btn">Edit</button>
                    <button class="btn btn-outline-danger delete-item-btn">Delete</button>
                </div>
            </div>
        `).join('');

        const isExpanded = 'show';
        const isButtonCollapsed = '';

        accordionItem.innerHTML = `
            <h2 class="accordion-header" id="heading-${index}">
                <button class="accordion-button ${isButtonCollapsed}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${index}" aria-expanded="${!!searchTerm}" aria-controls="collapse-${index}">
                    ${category}
                </button>
            </h2>
            <div id="collapse-${index}" class="accordion-collapse collapse ${isExpanded}" aria-labelledby="heading-${index}" data-bs-parent="#stock-list-accordion">
                <div class="accordion-body">${itemsHtml}</div>
            </div>`;
        stockListAccordion.appendChild(accordionItem);
    });

    stockModal.style.display = 'block';
    saveStockBtn.disabled = false;
}

export function populateMenuItemForm(item) {
    document.getElementById('menu-item-id').value = item.id;
    document.getElementById('menu-item-name').value = item.name;
    document.getElementById('menu-item-price').value = item.price;
    document.getElementById('menu-item-category').value = item.category;
    document.getElementById('menu-item-stock').value = item.stock;
}

export function clearMenuItemForm() {
    document.getElementById('menu-item-form').reset();
    document.getElementById('menu-item-id').value = '';
}

export function filterStockItems() {
    const { menu } = getState();
    const searchTerm = document.getElementById('stock-search-input').value;
    renderStockModal(menu, searchTerm);
}

export function renderUsersModal(users) {
    const userManagementModal = document.getElementById('user-management-modal');
    const existingUsersList = document.getElementById('existing-users-list');
    existingUsersList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.textContent = `${user.username} - ${user.role}`;
        existingUsersList.appendChild(li);
    });
    userManagementModal.style.display = 'block';
}

export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}