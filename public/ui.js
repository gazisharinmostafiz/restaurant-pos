import { getState, getCurrentOrder } from './state.js';

const CURRENCY_SYMBOL = '\u00A3';

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
let dashboardChart = null;

// Use a single currency constant; defined once at top

function formatCurrency(value) {
    return `${CURRENCY_SYMBOL}${Number(value || 0).toFixed(2)}`;
}

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
function formatDateTime(value) {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

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
                <div class="fw-bold">Â£${(item.price * item.quantity).toFixed(2)}</div>
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

    totalPriceDisplay.textContent = `Â£${total.toFixed(2)}`;
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
    menuCategoriesContainer.innerHTML = '';
    const categories = Object.keys(menu || {});
    if (!categories.length) {
        if (menuItemsContainer) menuItemsContainer.innerHTML = '<div class="text-muted">No items available.</div>';
        return;
    }
    categories.forEach((category, index) => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        const activeClass = index === 0 ? ' active' : '';
        li.innerHTML = '<a class="nav-link menu-category-btn' + activeClass + '" href="#" data-category="' + category + '">' + category + '</a>';
        menuCategoriesContainer.appendChild(li);
    });
    displayCategoryTabItems(categories[0]);
}

export function renderAdminDashboard(data) {
    if (!data || !data.summary) return;

    const today = data.summary.today || {};
    const month = data.summary.month || {};
    const totals = data.summary.totals || {};
    const users = data.summary.users || 0;
    const lowStock = data.summary.lowStock || 0;

    safeText('summary-today-sales', formatCurrency(today.sales));
    safeText('summary-month-sales', `MTD ${formatCurrency(month.sales)}`);
    safeText('summary-today-purchases', formatCurrency(today.purchases));
    safeText('summary-month-purchases', `MTD ${formatCurrency(month.purchases)}`);
    safeText('summary-today-profit', formatCurrency(today.profit));
    safeText('summary-month-profit', `MTD ${formatCurrency(month.profit)}`);
    safeText('summary-today-orders', Number(today.orders || 0).toString());
    safeText('summary-users', `Users: ${users} | Low stock: ${lowStock}`);

    safeText('cashflow-total-sales', formatCurrency(totals.sales));
    safeText('cashflow-total-purchases', formatCurrency(totals.purchases));
    safeText('cashflow-total-profit', formatCurrency(totals.profit));
    safeText('cashflow-users', users.toString());
    safeText('cashflow-low-stock', lowStock.toString());

    const topList = document.getElementById('top-products-list');
    if (topList) {
        const products = data.topProducts || [];
        if (!products.length) {
            topList.innerHTML = '<li class="list-group-item text-muted">No sales recorded in the last 30 days.</li>';
        } else {
            topList.innerHTML = products.map(p => `
                <li class="list-group-item">
                    <div class="product-name">${p.name}</div>
                    <div class="product-meta">${p.quantity} sold | ${formatCurrency(p.sales)}</div>
                </li>
            `).join('');
        }
    }

    const recentList = document.getElementById('recent-orders-list');
    if (recentList) {
        const orders = data.recentOrders || [];
        if (!orders.length) {
            recentList.innerHTML = '<li class="list-group-item text-muted">No recent orders.</li>';
        } else {
            recentList.innerHTML = orders.map(o => `
                <li class="list-group-item">
                    <div class="order-info">
                        <span class="order-title">Order #${o.id} | ${o.destination || 'N/A'}</span>
                        <span class="order-meta">${formatDateTime(o.timestamp)} | ${o.status || 'pending'}</span>
                    </div>
                    <div class="order-amount">${formatCurrency(o.total)}</div>
                </li>
            `).join('');
        }
    }

    const chartCanvas = document.getElementById('monthly-sales-chart');
    if (chartCanvas) {
        const series = data.monthlySeries || { labels: [], sales: [], purchases: [], profit: [] };
        const ctx = chartCanvas.getContext('2d');
        if (dashboardChart) dashboardChart.destroy();
        dashboardChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: series.labels,
                datasets: [
                    {
                        label: 'Sales',
                        data: series.sales,
                        borderColor: '#1677ff',
                        backgroundColor: 'rgba(22, 119, 255, 0.18)',
                        tension: 0.35,
                        fill: true,
                        borderWidth: 2
                    },
                    {
                        label: 'Purchases',
                        data: series.purchases,
                        borderColor: '#41c78b',
                        backgroundColor: 'rgba(65, 199, 139, 0.18)',
                        tension: 0.35,
                        fill: true,
                        borderWidth: 2
                    },
                    {
                        label: 'Profit',
                        data: series.profit,
                        borderColor: '#f29900',
                        backgroundColor: 'rgba(242, 153, 0, 0.1)',
                        tension: 0.35,
                        fill: false,
                        borderWidth: 2,
                        borderDash: [6, 6]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: value => formatCurrency(value)
                        }
                    }
                }
            }
        });
    }
}

export function displayCategoryTabItems(category) {
    const { menu } = getState();
    const items = (menu && menu[category]) ? menu[category] : [];
    if (!menuItemsContainer) return;
    menuItemsContainer.innerHTML = '';
    items.forEach(item => {
        const name = item?.name || '';
        const stock = Number(item?.stock ?? 0);
        const price = Number(item?.price ?? 0);
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.dataset.name = name;
        div.innerHTML = `
            <div class="item-name">${name}</div>
            <div class="item-meta"><span class="stock-badge">Stock: ${stock}</span><span class="item-price">${formatCurrency(price)}</span></div>`;
        menuItemsContainer.appendChild(div);
    });
}

export function activateCategoryPane(category) {
    document.querySelectorAll('.menu-categories .menu-category-btn').forEach(link => {
        link.classList.toggle('active', link.dataset.category === category);
    });
}

export function updateActiveTabStockBadges() {
    const { menu } = getState();
    const current = getCurrentOrder();
    const countInOrder = (name) => current.filter(i => i.name === name).reduce((total, item) => total + item.quantity, 0);
    const allItems = Object.values(menu || {}).flat();
    menuItemsContainer?.querySelectorAll('.menu-item').forEach(card => {
        const badge = card.querySelector('.stock-badge');
        const name = card.dataset.name;
        const item = allItems.find(i => i.name === name);
        if (!badge || !item) return;
        const left = Math.max(0, (item.stock || 0) - countInOrder(name));
        badge.textContent = `Stock: ${left}`;
    });
}

export function buildCategoryTabPanes(menu) {
    populateMenuCategories(menu);
}
export function renderStockModal(menu, searchTerm = '') {
    stockListAccordion.innerHTML = '';
    const lowercasedFilter = searchTerm.toLowerCase();
    // Ensure extended fields exist on the form (SKU, Barcode, Cost)
    const form = document.getElementById('menu-item-form');
    const role = (getState().currentUserRole || '').toLowerCase();
    const isAdmin = ['admin', 'superadmin'].includes(role);
    if (form) {
        const card = form.closest('.card');
        if (card) card.style.display = '';
        if (!isAdmin) {
            const header = card?.querySelector('.card-header');
            if (header) header.textContent = 'Menu Item Details (admin only)';
            form.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => { el.disabled = true; });
            const saveBtn = form.querySelector('button[type="submit"]');
            if (saveBtn) saveBtn.style.display = 'none';
            const clearBtn = form.querySelector('#clear-menu-item-form-btn');
            if (clearBtn) clearBtn.style.display = 'none';
        } else {
            form.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = false; });
            const saveBtn = form.querySelector('button[type="submit"]');
            if (saveBtn) saveBtn.style.display = '';
            const clearBtn = form.querySelector('#clear-menu-item-form-btn');
            if (clearBtn) clearBtn.style.display = '';
        }
    }
    if (form && isAdmin && !document.getElementById('menu-item-sku')){
        const container = document.createElement('div');
        container.className = 'row';
        container.innerHTML = `
            <div class="col-md-4 mb-3">
                <label for="menu-item-sku" class="form-label">SKU</label>
                <input type="text" id="menu-item-sku" class="form-control">
            </div>
            <div class="col-md-4 mb-3">
                <label for="menu-item-barcode" class="form-label">Barcode</label>
                <input type="text" id="menu-item-barcode" class="form-control">
            </div>
            <div class="col-md-4 mb-3">
                <label for="menu-item-cost" class="form-label">Cost (£)</label>
                <input type="number" id="menu-item-cost" step="0.01" min="0" class="form-control" value="0">
            </div>`;
        form.appendChild(container);
    }

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
                    <input type="number" class="form-control stock-quantity-input" value="${Number(item.stock || 0)}" data-name="${item.name}" data-id="${item.id}" min="0">
                    <button class="btn btn-outline-secondary stock-adj-btn" data-action="increase">+</button>
                    <button class="btn btn-outline-primary set-stock-btn">Set</button>
                    ${role==='admin' ? '<button class="btn btn-outline-info edit-item-btn">Edit</button>' : ''}
                    ${role==='admin' ? '<button class="btn btn-outline-danger delete-item-btn">Delete</button>' : ''}
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
    if (document.getElementById('menu-item-sku')) document.getElementById('menu-item-sku').value = item.sku || '';
    if (document.getElementById('menu-item-barcode')) document.getElementById('menu-item-barcode').value = item.barcode || '';
    if (document.getElementById('menu-item-cost')) document.getElementById('menu-item-cost').value = (item.cost!=null? item.cost:0);
}

export function clearMenuItemForm() {
    document.getElementById('menu-item-form').reset();
    document.getElementById('menu-item-id').value = '';
    if (document.getElementById('menu-item-cost')) document.getElementById('menu-item-cost').value = '0';
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

window.displayMenuItems = displayCategoryTabItems;










