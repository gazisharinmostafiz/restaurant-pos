let menu = {}; // Will be fetched from the server

let currentUserRole = '';
let selectedOrderId = null;
let activePaymentMethod = null;
let currentOrder = [];

const loginScreen = document.getElementById('login-screen');
const mainDashboard = document.getElementById('main-dashboard');
const userRoleDisplay = document.getElementById('user-role-display');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const menuCategoriesContainer = document.querySelector('.menu-categories');
const menuItemsContainer = document.getElementById('menu-items');
const orderList = document.getElementById('order-list');
const totalPriceDisplay = document.getElementById('total-price');
const queueSection = document.getElementById('queue-section');
const orderQueueList = document.getElementById('order-queue-list');
const addOrderBtn = document.getElementById('add-order-btn');
const orderTypeSelect = document.getElementById('order-type-select');
const tableSelect = document.getElementById('table-select');
const orderDetailsSection = document.getElementById('order-section');
const placeOrderBtn = document.getElementById('place-order-btn');
const payCashBtn = document.getElementById('pay-cash-btn');
const payCardBtn = document.getElementById('pay-card-btn');
const pendingOrdersSection = document.getElementById('pending-orders-section');
const pendingOrdersList = document.getElementById('pending-orders-list');
const oldOrdersModal = document.getElementById('old-orders-modal');
const oldOrdersList = document.getElementById('old-orders-list');
const zReportBtn = document.getElementById('z-report-btn');
const zReportModal = document.getElementById('z-report-modal');
let salesChart = null; // To hold the chart instance
const viewOldOrdersBtn = document.getElementById('view-old-orders-btn');
const paymentModal = document.getElementById('payment-modal');
const amountTenderedInput = document.getElementById('amount-tendered');
const discountInput = document.getElementById('discount-amount');
const confirmPaymentBtn = document.getElementById('confirm-payment-btn');
const oldOrdersDateFilter = document.getElementById('old-orders-date-filter');
const filterOrdersBtn = document.getElementById('filter-orders-btn');
const showAllOrdersBtn = document.getElementById('show-all-orders-btn');
const manageStockSidebarItem = document.getElementById('manage-stock-sidebar-item');
const stockModal = document.getElementById('stock-modal');
const saveStockBtn = document.getElementById('save-stock-btn');
const stockListAccordion = document.getElementById('stock-list-accordion');


async function checkSession() {
    try {
        const response = await fetch('/api/session');
        const data = await response.json();
        if (data.loggedIn) {
            currentUserRole = data.user.role;
            loginScreen.style.display = 'none';
            loginScreen.classList.remove('active');
            mainDashboard.classList.add('active');
            userRoleDisplay.textContent = `${data.user.username} (${currentUserRole}) Dashboard`;
            await fetchMenu();
            updateViewForRole();
        } else {
            loginScreen.style.display = 'flex';
            loginScreen.classList.add('active');
            mainDashboard.classList.remove('active');
        }
    } catch (error) {
        showToast('Cannot connect to server.', 'error');
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            await checkSession(); // Re-check session to set up the dashboard
        } else {
            showToast(data.error || 'Login failed.', 'error');
        }
    } catch (error) {
        showToast('Error during login.', 'error');
    }
});

logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUserRole = '';
    mainDashboard.classList.remove('active');
    loginScreen.classList.add('active');
    loginScreen.style.display = 'flex';
    clearCurrentOrder();
    selectedOrderId = null;
});

placeOrderBtn.addEventListener('click', () => {
    if (currentOrder.length > 0) {
        placeOrder();
    } else {
        showToast('Please add items to the order first.', 'error');
    }
});

payCashBtn.addEventListener('click', () => openPaymentModal('cash'));
payCardBtn.addEventListener('click', () => openPaymentModal('card'));
zReportBtn.addEventListener('click', () => generateZReport());
viewOldOrdersBtn.addEventListener('click', () => fetchAndShowOldOrders());

oldOrdersModal.addEventListener('click', e => {
    if (e.target.classList.contains('modal') || e.target.classList.contains('close-btn')) oldOrdersModal.style.display = 'none';
});
paymentModal.addEventListener('click', e => {
    if (e.target.classList.contains('modal') || e.target.classList.contains('close-btn')) closePaymentModal();
});
zReportModal.addEventListener('click', e => {
    if (e.target.classList.contains('modal') || e.target.classList.contains('close-btn')) zReportModal.style.display = 'none';
});

manageStockSidebarItem.addEventListener('click', openStockModal);
stockModal.addEventListener('click', e => {
    if (e.target.classList.contains('modal') || e.target.classList.contains('close-btn')) {
        stockModal.style.display = 'none';
    }
});
saveStockBtn.addEventListener('click', saveStockChanges);


filterOrdersBtn.addEventListener('click', () => {
    const date = oldOrdersDateFilter.value;
    if (date) fetchAndShowOldOrders(date);
});
showAllOrdersBtn.addEventListener('click', () => fetchAndShowOldOrders());
addOrderBtn.addEventListener('click', () => {
    clearCurrentOrder();
    selectedOrderId = null;
    document.querySelectorAll('.pending-order-item.selected').forEach(el => el.classList.remove('selected'));
    placeOrderBtn.disabled = false;
    showToast('Ready to create a new order.');
});

menuCategoriesContainer.addEventListener('click', e => {
    if (e.target.classList.contains('nav-link')) {
        const category = e.target.dataset.category;
        displayMenuItems(category);
        document.querySelectorAll('.menu-categories .nav-link').forEach(link => link.classList.remove('active'));
        e.target.classList.add('active');
    }
});

menuItemsContainer.addEventListener('click', e => {
    if (e.target.closest('.menu-item')) {
        const itemElement = e.target.closest('.menu-item');
        addItemToOrder(itemElement.dataset.name, parseFloat(itemElement.dataset.price), parseInt(itemElement.dataset.stock, 10));
    }
});

orderList.addEventListener('click', e => {
    const target = e.target;
    const itemElement = target.closest('.list-group-item');
    if (!itemElement) return;
    const itemIndex = parseInt(itemElement.dataset.index, 10);
    if (target.classList.contains('remove-item-btn')) removeItemFromOrder(itemIndex);
    else if (target.classList.contains('quantity-btn')) updateItemQuantity(itemIndex, target.dataset.action);
});

pendingOrdersList.addEventListener('click', e => {
    const target = e.target.closest('.pending-order-item');
    if (target) {
        const orderId = target.dataset.orderId;
        const orderItems = JSON.parse(target.dataset.items || '[]');
        document.querySelectorAll('.pending-order-item.selected').forEach(el => el.classList.remove('selected'));
        target.classList.add('selected');
        selectedOrderId = orderId;
        currentOrder = orderItems;
        renderOrder();
        placeOrderBtn.disabled = true;
    }
});

orderTypeSelect.addEventListener('change', e => {
    tableSelect.style.display = (e.target.value === 'table') ? 'inline-block' : 'none';
});

amountTenderedInput.addEventListener('input', updatePaymentDetails);
discountInput.addEventListener('input', updatePaymentDetails);
confirmPaymentBtn.addEventListener('click', processPayment);
// fullPaymentBtn.addEventListener('click', processFullPayment); // This button was removed

function updateViewForRole() {
    // Hide all sections by default
    orderDetailsSection.style.display = 'none';
    queueSection.style.display = 'none';
    addOrderBtn.style.display = 'none';
    pendingOrdersSection.style.display = 'none';
    zReportBtn.style.display = 'none';
    viewOldOrdersBtn.style.display = 'none';
    payCashBtn.style.display = 'none';
    payCardBtn.style.display = 'none';
    manageStockSidebarItem.style.display = 'none';

    const isAdminLike = currentUserRole === 'admin' || currentUserRole === 'superadmin';

    if (currentUserRole === 'waiter' || isAdminLike) {
        orderDetailsSection.style.display = 'block';
        addOrderBtn.style.display = 'block';
        viewOldOrdersBtn.style.display = 'inline-block';
        // displayMenuItems('Snacks'); // Don't load a category by default
        // document.querySelector('.menu-categories .nav-link[data-category="Snacks"]').classList.add('active');
    }

    if (isAdminLike) {
        // Front desk can see pending orders and process payments
        pendingOrdersSection.style.display = 'block';
        payCashBtn.style.display = 'inline-block';
        payCardBtn.style.display = 'inline-block';
        zReportBtn.style.display = 'inline-block';
        manageStockSidebarItem.style.display = 'list-item';
        fetchPendingOrdersForPayment();
        setInterval(fetchPendingOrdersForPayment, 15000);
    }

    if (currentUserRole === 'kitchen' || isAdminLike) {
        // Kitchen only sees the order queue
        queueSection.style.display = 'block';
        fetchOrderQueue(); // Fetch queue on login
        setInterval(fetchOrderQueue, 10000);
    }    
}

async function fetchMenu() {
    try {
        const response = await fetch('/api/menu');
        if (response.status === 401) return checkSession(); // Re-auth if session expired
        const data = await response.json();
        menu = {};
        data.menu.forEach(item => {
            if (!menu[item.category]) {
                menu[item.category] = [];
            }
            menu[item.category].push(item);
        });
        populateMenuCategories();
    } catch (error) {
        showToast('Failed to load menu.', 'error');
    }
}

function populateMenuCategories() {
    menuCategoriesContainer.innerHTML = '<li class="nav-title">Menu Categories</li>';
    Object.keys(menu).forEach(category => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `<a class="nav-link menu-category-btn" href="#" data-category="${category}">${category}</a>`;
        menuCategoriesContainer.appendChild(li);
    });
}

function displayMenuItems(category) {
    menuItemsContainer.innerHTML = '';
    (menu[category] || []).forEach(item => {
        const name = item?.name || '';
        const stock = Number(item?.stock ?? 0);
        const price = Number(item?.price ?? 0);
        const div = document.createElement('div');
        div.className = 'menu-item';
        div.dataset.name = name;
        div.dataset.price = price;
        div.dataset.stock = stock;
        div.innerHTML = `
            <div class="item-name">${name}</div>
            <div class="item-meta"><span class="stock-badge">Stock: ${stock}</span><span class="item-price">£${price.toFixed(2)}</span></div>`;
        menuItemsContainer.appendChild(div);
    });
}

function addItemToOrder(name, price, stock) {
    const existingItem = currentOrder.find(i => i.name === name);
    existingItem ? existingItem.quantity++ : currentOrder.push({ name, price, quantity: 1, stock });
    renderOrder();
}

function removeItemFromOrder(index) {
    currentOrder.splice(index, 1);
    renderOrder();
}

function updateItemQuantity(index, action) {
    const item = currentOrder[index];
    if (action === 'increment') item.quantity++;
    else if (item.quantity > 1) item.quantity--;
    else return removeItemFromOrder(index);
    renderOrder();
}

function renderOrder() {
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

function openPaymentModal(method) {
    if (!selectedOrderId) {
        return showToast('Please select a pending order first.', 'error');
    }
    if (currentOrder.length === 0) {
        return showToast('No items to pay for.', 'error');
    }
    activePaymentMethod = method;
    updatePaymentDetails(true); // Reset inputs when opening
    paymentModal.style.display = 'block';
}

function closePaymentModal() {
    paymentModal.style.display = 'none';
    discountInput.value = '';
    amountTenderedInput.value = '';
    activePaymentMethod = null;
}

function updatePaymentDetails(reset = false) {
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

// ✅ Auto full payment function
async function processFullPayment() {
    if (!selectedOrderId || !activePaymentMethod) {
        return showToast('Select a payment type first.', 'error');
    }
    const discount = parseFloat(discountInput.value) || 0;
    const total = currentOrder.reduce((s, i) => s + i.price * i.quantity, 0);
    const finalTotal = total - discount;

    // For cash payments, we can assume the exact amount is tendered.
    // For card, it's always the exact amount.
    amountTenderedInput.value = finalTotal.toFixed(2);

    await processPayment();
}

async function processPayment() {
    if (!selectedOrderId || !activePaymentMethod) {
        return showToast('Payment details are missing.', 'error');
    }

    const discount = parseFloat(discountInput.value) || 0;
    const total = currentOrder.reduce((s, i) => s + i.price * i.quantity, 0);
    const finalTotal = total - discount;
    const amountTendered = parseFloat(amountTenderedInput.value) || 0;

    if (activePaymentMethod === 'cash' && amountTendered < finalTotal) {
        return showToast('Cash tendered is less than the total amount due.', 'error');
    }

    const paymentData = { paymentMethod: activePaymentMethod, discount };

    try {
        const response = await fetch(`/api/orders/${selectedOrderId}/complete`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData)
        });
        const result = await response.json();

        if (response.ok && result.success) {
            const changeDue = Math.max(0, amountTendered - finalTotal);
            let successMessage = `Payment of £${finalTotal.toFixed(2)} successful via ${activePaymentMethod}.`;
            if (activePaymentMethod === 'cash' && changeDue > 0) {
                successMessage += ` Change due: £${changeDue.toFixed(2)}.`;
            }
            showToast(successMessage, 'success');
            clearCurrentOrder();
            closePaymentModal();
            selectedOrderId = null;
            fetchPendingOrdersForPayment();
        } else {
            showToast(result.error || 'Payment failed.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error processing payment.', 'error');
    }
}

async function placeOrder() {
    const orderType = orderTypeSelect.value;
    const destination = (orderType === 'table') ? `Table ${tableSelect.value}` : 'Takeaway';

    if (currentOrder.length === 0) {
        return showToast('Cannot place an empty order.', 'error');
    }

    const orderData = {
        orderType: orderType,
        destination: destination,
        items: currentOrder
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        const result = await response.json();

        if (response.ok) {
            showToast(`Order #${result.orderId} sent to the kitchen!`, 'success');
            clearCurrentOrder();
            fetchMenu(); // Refresh menu to show updated stock
        } else {
            showToast(result.error || 'Failed to place order.', 'error');
        }
    } catch (err) {
        console.error('Error placing order:', err);
        showToast('Error connecting to the server to place order.', 'error');
    }
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 500);
    }, 5000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function clearCurrentOrder() {
    currentOrder = [];
    renderOrder();
}

function openStockModal() {
    stockListAccordion.innerHTML = '';
    Object.keys(menu).sort().forEach((category, index) => {
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item';

        const itemsHtml = menu[category].map(item => `
            <div class="stock-item">
                <span class="stock-item-name">${item.name}</span>
                <div class="stock-item-input input-group">
                    <input type="number" class="form-control" value="${item.stock}" data-name="${item.name}" min="0">
                </div>
            </div>
        `).join('');

        accordionItem.innerHTML = `
            <h2 class="accordion-header" id="heading-${index}">
                <button class="accordion-button collapsed" type="button" data-coreui-toggle="collapse" data-coreui-target="#collapse-${index}" aria-expanded="false" aria-controls="collapse-${index}">
                    ${category}
                </button>
            </h2>
            <div id="collapse-${index}" class="accordion-collapse collapse" aria-labelledby="heading-${index}" data-coreui-parent="#stock-list-accordion">
                <div class="accordion-body">
                    ${itemsHtml}
                </div>
            </div>
        `;
        stockListAccordion.appendChild(accordionItem);
    });
    stockModal.style.display = 'block';
}

async function saveStockChanges() {
    const updates = [];
    stockListAccordion.querySelectorAll('input[type="number"]').forEach(input => {
        updates.push({
            name: input.dataset.name,
            stock: parseInt(input.value, 10)
        });
    });

    try {
        const response = await fetch('/api/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast('Stock updated successfully!', 'success');
            stockModal.style.display = 'none';
            await fetchMenu(); // Refresh menu data
            displayMenuItems(document.querySelector('.menu-categories .nav-link.active')?.dataset.category || 'Snacks');
        } else {
            showToast(result.error || 'Failed to update stock.', 'error');
        }
    } catch (error) {
        console.error('Error saving stock:', error);
        showToast('Error connecting to server to save stock.', 'error');
    }
}

async function fetchOrderQueue() {
    try {
        const response = await fetch('/api/orders/pending');
        const data = await response.json();
        orderQueueList.innerHTML = '';
        data.orders.filter(o => o.status === 'pending').forEach(order => {
            const li = document.createElement('li');
            li.className = 'queue-item';
            const itemsHtml = order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('');
            li.innerHTML = `
                <div class="queue-header">Order #${order.id} - ${order.destination}</div>
                <ul class="queue-details">${itemsHtml}</ul>
                <div class="queue-footer">
                    <button class="btn btn-sm btn-success" onclick="updateOrderStatus(${order.id}, 'ready')">Mark as Ready</button>
                </div>
            `;
            orderQueueList.appendChild(li);
        });
    } catch (err) {
        console.error('Failed to fetch order queue:', err);
    }
}

async function fetchPendingOrdersForPayment() {
    try {
        const response = await fetch('/api/orders/pending');
        const data = await response.json();
        pendingOrdersList.innerHTML = '';
        data.orders.filter(o => o.status === 'ready').forEach(order => {
            const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const li = document.createElement('li');
            li.className = 'list-group-item pending-order-item';
            li.dataset.orderId = order.id;
            li.dataset.items = JSON.stringify(order.items);
            li.innerHTML = `Order #${order.id} - ${order.destination} - <strong>£${total.toFixed(2)}</strong>`;
            pendingOrdersList.appendChild(li);
        });
    } catch (err) {
        console.error('Failed to fetch pending orders:', err);
    }
}

async function updateOrderStatus(orderId, status) {
    try {
        await fetch(`/api/orders/${orderId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        fetchOrderQueue();
    } catch (err) {
        console.error('Failed to update order status:', err);
    }
}

async function fetchAndShowOldOrders(date = null) {
    let url = '/api/orders/completed';
    if (date) {
        url += `?date=${date}`;
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        oldOrdersList.innerHTML = '';
        data.orders.forEach(order => {
            const li = document.createElement('li');
            const finalTotal = order.total - order.discount;
            li.innerHTML = `Order #${order.id} - ${new Date(order.timestamp).toLocaleString()} - Total: £${finalTotal.toFixed(2)} (Paid by ${order.payment_method})`;
            oldOrdersList.appendChild(li);
        });
        oldOrdersModal.style.display = 'block';
    } catch (err) {
        console.error('Failed to fetch old orders:', err);
    }
}

async function generateZReport() {
    try {
        const response = await fetch('/api/reports/z');
        const report = await response.json();

        const summaryDiv = document.getElementById('z-report-summary');
        summaryDiv.innerHTML = `
            <p><strong>Total Sales:</strong> £${report.total_sales.toFixed(2)}</p>
            <p><strong>Cash Sales:</strong> £${report.cash_sales.toFixed(2)}</p>
            <p><strong>Card Sales:</strong> £${report.card_sales.toFixed(2)}</p>
        `;

        const ctx = document.getElementById('sales-chart').getContext('2d');
        if (salesChart) {
            salesChart.destroy();
        }
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
    } catch (error) {
        showToast('Failed to generate Z-Report.', 'error');
        console.error('Error generating Z-Report:', error);
    }
}

// Run on page load
checkSession();
