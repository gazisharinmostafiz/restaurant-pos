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
let dashboardChart = null;

function formatCurrency(value) {
    return `£${Number(value || 0).toFixed(2)}`;
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
    // Render categories into the main category bar (no sidebar title)
    menuCategoriesContainer.innerHTML = '';
    Object.keys(menu).forEach(category => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `<a class="nav-link menu-category-btn" href="#" data-category="${category}">${category}</a>`;
        menuCategoriesContainer.appendChild(li);
    });
}

function slugify(text) {
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function buildCategoryTabPanes(menu) {
    const tabContent = document.getElementById('category-tab-content');
    if (!tabContent) return;
    tabContent.innerHTML = '';
    const categories = Object.keys(menu);
    categories.forEach((category, idx) => {
        const id = `tab-${slugify(category)}`;
        const pane = document.createElement('div');
        pane.className = `tab-pane fade ${idx === 0 ? 'show active' : ''}`;
        pane.id = id;
        pane.setAttribute('role', 'tabpanel');
        pane.innerHTML = '<div class="menu-items"></div>';
        tabContent.appendChild(pane);
    });
}

export function displayCategoryTabItems(category) {
    const { menu } = getState();
    const slug = slugify(category);
    const tabPaneItems = document.querySelector('#category-tab-content #tab-' + slug + ' .menu-items');
    if (!tabPaneItems) return;
    tabPaneItems.innerHTML = '';
    (menu[category] || []).forEach(item => {
        const name = item?.name || '';
        const stock = Number(item?.stock ?? 0);
        const price = Number(item?.price ?? 0);
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.dataset.name = name;
        div.innerHTML = '<div class="item-name">' + name + '</div>' +
            '<div class="item-meta"><span class="stock-badge">Stock: ' + stock + '</span><span class="item-price">&pound;' + price.toFixed(2) + '</span></div>';
        tabPaneItems.appendChild(div);
    });
}

export function renderOrderQueue(orders) {
    const bumpedKey = 'kdsBumped';
    const bumped = new Set(JSON.parse(localStorage.getItem(bumpedKey)||'[]'));
    orderQueueList.innerHTML = "";
    orders.filter(o=>!bumped.has(o.id)).forEach(order => {
        const li = document.createElement("li");
        li.className = "queue-item";
        const baseTime = order.timestamp ? new Date(order.timestamp) : null;
        const getTime = (it) => it.added_at ? new Date(it.added_at) : baseTime;
        const items = (order.items || []).slice();
        // Group by time (minute precision) and sort
        const groups = new Map();
        items.forEach(it => {
            const t = getTime(it);
            const key = t ? `${t.getFullYear()}-${t.getMonth()}-${t.getDate()} ${t.getHours()}:${t.getMinutes()}` : "initial";
            if (!groups.has(key)) groups.set(key, { time: t, items: [] });
            groups.get(key).items.push(it);
        });
        const ordered = Array.from(groups.values()).sort((a,b)=>{
            if (a.time && b.time) return a.time - b.time;
            if (a.time && !b.time) return -1;
            if (!a.time && b.time) return 1;
            return 0;
        });
        const ageMin = baseTime ? Math.floor((Date.now()-baseTime.getTime())/60000) : 0;
        const ageBadge = `<span class="badge bg-warning ms-2">${ageMin}m</span>`;
        const itemsHtml = ordered.map((grp, idx) => {
            const timeLabel = grp.time ? grp.time.toLocaleTimeString() : "";
            const header = idx === 0 ? "" : `<li class="new-items-separator">[new items added - ${timeLabel}]</li>`;
            const lines = grp.items.map(it => `<li>${it.name} x ${it.quantity}</li>`).join("");
            return header + lines;
        }).join("");
        li.innerHTML = `
            <div class="queue-header">Order #${order.id} - ${order.destination} ${ageBadge}</div>
            <ul class="queue-details">${itemsHtml}</ul>
            <div class="queue-footer d-flex gap-2">
                <button class="btn btn-sm btn-success mark-ready-btn" data-order-id="${order.id}">Mark as Ready</button>
                <button class="btn btn-sm btn-outline-secondary bump-btn" data-order-id="${order.id}">Bump</button>
            </div>`;
        orderQueueList.appendChild(li);
    });
    // bumped list (restore)
    const bumpedWrap = document.createElement('div');
    bumpedWrap.className = 'mt-3';
    if (bumped.size){
        const arr = Array.from(bumped.values());
        bumpedWrap.innerHTML = `<div class="text-muted mb-1">Bumped: ${arr.map(id=>`#${id}`).join(', ')}</div><button id="restore-bumped" class="btn btn-sm btn-outline-primary">Restore All</button>`;
        orderQueueList.appendChild(bumpedWrap);
        const btn = bumpedWrap.querySelector('#restore-bumped');
        btn.addEventListener('click', ()=>{ localStorage.setItem(bumpedKey, '[]'); if (typeof window.fetchOrderQueue==='function') window.fetchOrderQueue(); });
    }
    // delegate bump clicks
    orderQueueList.addEventListener('click', (e)=>{
        const b = e.target.closest('.bump-btn');
        if (!b) return;
        const id = parseInt(b.getAttribute('data-order-id'),10);
        bumped.add(id); localStorage.setItem(bumpedKey, JSON.stringify(Array.from(bumped.values())));
        if (typeof window.fetchOrderQueue==='function') window.fetchOrderQueue();
    }, { once: true });
}

export function renderPendingOrders(orders) {
    pendingOrdersList.innerHTML = '';
    orders.forEach(order => {
        const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const li = document.createElement('li');
        li.className = 'list-group-item pending-order-item';
        li.dataset.orderId = order.id;
        li.dataset.items = JSON.stringify(order.items);
        const balance = (typeof order.balance === 'number') ? Number(order.balance) : total;
        li.dataset.balance = String(balance);
        li.innerHTML = `Order #${order.id} - ${order.destination} - <strong>Due Â£${balance.toFixed(2)}</strong>`;
        pendingOrdersList.appendChild(li);
    });
}

export function renderOldOrders(orders) {
    oldOrdersList.innerHTML = '';
    orders.forEach(order => {
        const li = document.createElement('li');
        li.className = 'card mb-3';

        const itemsHtml = order.items.map(item => 
            `<li class="list-group-item d-flex justify-content-between">
                <span>${item.item_name} x ${item.quantity}</span>
                <span>Â£${(item.price * item.quantity).toFixed(2)}</span>
            </li>`
        ).join('');

        const finalTotal = order.total - (order.discount || 0);

        li.innerHTML = `
            <div class="card-header d-flex justify-content-between">
                <strong>Order #${order.id}</strong>
                <span>${new Date(order.timestamp).toLocaleString()}</span>
            </div>
            <div class="card-body">
                <ul class="list-group list-group-flush mb-3">
                    ${itemsHtml}
                </ul>
                <ul class="list-group list-group-flush">
                    <li class="list-group-item d-flex justify-content-between"><span>Subtotal</span> <span>Â£${order.total.toFixed(2)}</span></li>
                    <li class="list-group-item d-flex justify-content-between"><span>Discount</span> <span>- Â£${(order.discount || 0).toFixed(2)}</span></li>
                    <li class="list-group-item d-flex justify-content-between fw-bold"><span>Final Total</span> <span>Â£${finalTotal.toFixed(2)}</span></li>
                </ul>
            </div>
            <div class="card-footer text-muted">
                Paid by: ${order.payment_method}
            </div>
        `;
        oldOrdersList.appendChild(li);
    });
    oldOrdersModal.style.display = 'block';
}

export function renderZReport(report, salesChart) {
    zReportSummary.innerHTML = `
        <p><strong>Total Sales:</strong> Â£${report.total_sales.toFixed(2)}</p>
        <p><strong>Cash Sales:</strong> Â£${report.cash_sales.toFixed(2)}</p>
        <p><strong>Card Sales:</strong> Â£${report.card_sales.toFixed(2)}</p>
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

export function renderProfitLossReport(report) {
    const resultsContainer = document.getElementById('profit-loss-results');
    const grossProfit = report.gross_profit;
    resultsContainer.innerHTML = `
        <div class="card">
            <div class="card-header">Report for ${report.start_date} to ${report.end_date}</div>
            <div class="card-body">
                <ul class="list-group list-group-flush">
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        Total Revenue
                        <span class="badge bg-success rounded-pill fs-6">Â£${report.total_revenue.toFixed(2)}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        Total Cost of Goods Sold
                        <span class="badge bg-warning rounded-pill fs-6">- Â£${report.total_cost.toFixed(2)}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        Discounts Given
                        <span class="badge bg-secondary rounded-pill fs-6">- Â£${report.total_discount.toFixed(2)}</span>
                    </li>
                    <li class="list-group-item d-flex justify-content-between align-items-center fw-bold fs-5">
                        Gross Profit
                        <span class="badge bg-primary rounded-pill fs-5">Â£${grossProfit.toFixed(2)}</span>
                    </li>
                </ul>
            </div>
        </div>
    `;
}

export function renderAdminDashboard(data) {
    if (!data || !data.summary) return;

    const today = data.summary.today || {};
    const month = data.summary.month || {};
    const totals = data.summary.totals || {};
    const users = data.summary.users || 0;
    const lowStock = data.summary.lowStock || 0;

    safeText('summary-today-sales', formatCurrency(today.sales));
    safeText('summary-month-sales', MTD );
    safeText('summary-today-purchases', formatCurrency(today.purchases));
    safeText('summary-month-purchases', MTD );
    safeText('summary-today-profit', formatCurrency(today.profit));
    safeText('summary-month-profit', MTD );
    safeText('summary-today-orders', Number(today.orders || 0).toString());
    safeText('summary-users', Users:  · Low stock: );

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
            topList.innerHTML = products.map(p => 
                <li class="list-group-item">
                    <div class="product-name"></div>
                    <div class="product-meta"> sold · </div>
                </li>
            ).join('');
        }
    }

    const recentList = document.getElementById('recent-orders-list');
    if (recentList) {
        const orders = data.recentOrders || [];
        if (!orders.length) {
            recentList.innerHTML = '<li class="list-group-item text-muted">No recent orders.</li>';
        } else {
            recentList.innerHTML = orders.map(o => 
                <li class="list-group-item">
                    <div class="order-info">
                        <span class="order-title">Order # · </span>
                        <span class="order-meta"> · </span>
                    </div>
                    <div class="order-amount"></div>
                </li>
            ).join('');
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
                            label: ctx => ${ctx.dataset.label}: 
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
                <label for="menu-item-cost" class="form-label">Cost (Â£)</label>
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
