// Menu data
const menu = {
    'Snacks': [
        { name: 'Singara', price: 1.20 },
        { name: 'Muglai', price: 4.49 },
        { name: 'Dal Puri', price: 1.90 },
        { name: 'Extra Sauce', price: 1.00 }
    ],
    'Chef Special Chaap': [
        { name: 'Chicken Chaap', price: 4.99 },
        { name: 'Beef Chaap', price: 6.49 }
    ],
    'Deshi Grilled Chicken': [
        { name: 'Full', price: 12.99 },
        { name: 'Half', price: 6.99 }
    ],
    'Breads': [
        { name: 'Butter Naan', price: 1.50 },
        { name: 'Luchi (2 pieces)', price: 1.00 },
        { name: 'Porota', price: 1.50 }
    ],
    'Chicken Sheek Kabab': [
        { name: 'Chicken Tandoori Sheek', price: 4.99 },
        { name: 'Chicken Tandoori', price: 4.49 },
        { name: 'Hariyali Chicken', price: 5.49 },
        { name: 'Reshmi Chicken', price: 5.49 },
        { name: 'Afghani Chicken', price: 5.49 },
        { name: 'Chicken Boti', price: 4.99 }
    ],
    'Beef Kabab': [
        { name: 'Beef Sheek', price: 5.99 }
    ],
    'Drinks': [
        { name: 'Coca-Cola', price: 1.20 },
        { name: 'Fanta', price: 1.00 },
        { name: 'Sprite', price: 1.00 },
        { name: 'Water', price: 1.00 },
        { name: 'Lemonade', price: 2.49 }
    ],
    'House Special Drinks': [
        { name: 'Borhani', price: 2.50 },
        { name: 'Jeera Soda', price: 2.50 },
        { name: 'Badam Serbot', price: 8.99 },
        { name: 'Deshi Lacchi', price: 3.49 }
    ],
    'Cha': [
        { name: 'Deshi Cha (Small)', price: 1.20 },
        { name: 'Deshi Cha (Regular)', price: 2.00 },
        { name: 'Tandoori Cha', price: 3.99 }
    ],
    'Dessert': [
        { name: 'Rosmalai', price: 1.00 },
        { name: 'Doi', price: 2.50 }
    ]
};

// Global state
// Removed duplicate declaration of currentUserRole
// Removed duplicate declaration of currentOrder
// Removed duplicate declaration of orderCounter
let allOrders = [];

// DOM elements
// Removed duplicate declaration of loginScreen
// Removed duplicate declaration of mainDashboard
const userRoleDisplay = document.getElementById('user-role-display');
const loginBtns = document.querySelectorAll('.login-btn');
const logoutBtn = document.getElementById('logout-btn');
const menuCategoriesContainer = document.querySelector('.menu-categories');
const menuItemsContainer = document.getElementById('menu-items');
const orderList = document.getElementById('order-list');
const totalPriceDisplay = document.getElementById('total-price');
const placeOrderBtn = document.getElementById('place-order-btn');
const queueSection = document.getElementById('queue-section');
const orderQueueList = document.getElementById('order-queue-list');
const addOrderBtn = document.getElementById('add-order-btn');
const orderTypeSelect = document.getElementById('order-type-select');
const tableSelect = document.getElementById('table-select');
const orderDetailsSection = document.getElementById('order-section');

// Event listeners
loginBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        currentUserRole = btn.dataset.role;
        loginScreen.classList.remove('active');
        mainDashboard.classList.add('active');
        userRoleDisplay.textContent = `${capitalize(currentUserRole)} Dashboard`;
        updateViewForRole();
    });
});

logoutBtn.addEventListener('click', () => {
    currentUserRole = '';
    mainDashboard.classList.remove('active');
    loginScreen.classList.add('active');
    clearCurrentOrder();
});

menuCategoriesContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('menu-category-btn')) {
        const category = event.target.dataset.category;
        displayMenuItems(category);
        document.querySelectorAll('.menu-category-btn').forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');
    }
});

menuItemsContainer.addEventListener('click', (event) => {
    const item = event.target.closest('.menu-item');
    if (item) {
        const name = item.dataset.name;
        const price = parseFloat(item.dataset.price);
        addItemToOrder(name, price);
    }
});

placeOrderBtn.addEventListener('click', () => {
    if (currentOrder.length > 0) {
        placeOrder();
    } else {
        alert('Please add items to the order first.');
    }
});

orderList.addEventListener('click', (event) => {
    const target = event.target;
    const index = parseInt(target.closest('.order-item')?.dataset.index);

    if (target.classList.contains('remove-item-btn')) {
        removeItemFromOrder(index);
    } else if (target.classList.contains('quantity-btn')) {
        const action = target.dataset.action;
        updateItemQuantity(index, action);
    }
});

orderTypeSelect.addEventListener('change', () => {
    if (orderTypeSelect.value === 'table') {
        tableSelect.style.display = 'block';
    } else {
        tableSelect.style.display = 'none';
    }
});

// Functions
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function updateViewForRole() {
    orderDetailsSection.style.display = 'none';
    queueSection.style.display = 'none';
    addOrderBtn.style.display = 'none';

    if (currentUserRole === 'waiter' || currentUserRole === 'front') {
        orderDetailsSection.style.display = 'block';
        addOrderBtn.style.display = 'block';
        displayMenuItems('Snacks');
        document.querySelector('.menu-category-btn[data-category="Snacks"]').classList.add('active');
    }

    if (currentUserRole === 'kitchen') {
        queueSection.style.display = 'block';
    }
}

function displayMenuItems(category) {
    menuItemsContainer.innerHTML = '';
    const items = menu[category] || [];
    items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'menu-item';
        itemDiv.dataset.name = item.name;
        itemDiv.dataset.price = item.price;
        itemDiv.innerHTML = `
            <div class="item-name">${item.name}</div>
            <div class="item-price">£${item.price.toFixed(2)}</div>
        `;
        menuItemsContainer.appendChild(itemDiv);
    });
}

function addItemToOrder(name, price) {
    const existing = currentOrder.find(item => item.name === name);
    if (existing) {
        existing.quantity++;
    } else {
        currentOrder.push({ name, price, quantity: 1 });
    }
    renderOrder();
}

function removeItemFromOrder(index) {
    currentOrder.splice(index, 1);
    renderOrder();
}

function updateItemQuantity(index, action) {
    if (action === 'increment') {
        currentOrder[index].quantity++;
    } else if (action === 'decrement') {
        if (currentOrder[index].quantity > 1) {
            currentOrder[index].quantity--;
        } else {
            removeItemFromOrder(index);
            return;
        }
    }
    renderOrder();
}

function renderOrder() {
    orderList.innerHTML = '';
    let total = 0;

    currentOrder.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'order-item';
        li.dataset.index = index;

        li.innerHTML = `
            <span>${item.name} x ${item.quantity}</span>
            <span>£${(item.price * item.quantity).toFixed(2)}</span>
            <div class="order-item-actions">
                <button class="quantity-btn" data-action="decrement">-</button>
                <button class="quantity-btn" data-action="increment">+</button>
                <button class="remove-item-btn">X</button>
            </div>
        `;
        orderList.appendChild(li);
        total += item.price * item.quantity;
    });

    totalPriceDisplay.textContent = `£${total.toFixed(2)}`;
}

function placeOrder() {
    const orderType = orderTypeSelect.value;
    const destination = orderType === 'table' ? `Table ${tableSelect.value}` : 'Takeaway';

    const newOrder = {
        id: orderCounter++,
        destination,
        items: [...currentOrder],
        status: 'pending',
        timestamp: new Date().toLocaleString()
    };

    allOrders.push(newOrder);
    currentOrder = [];
    renderOrderList();
    renderQueue();
    updateOrderTotal();
    alert(`Order placed successfully for ${destination}`);
}

// Remove item from current order
function removeOrderItem(index) {
    currentOrder.splice(index, 1);
    renderOrderList();
    updateOrderTotal();
}

// Change quantity of an item in current order
function changeQuantity(index, delta) {
    const item = currentOrder[index];
    item.quantity += delta;
    if (item.quantity < 1) {
        currentOrder.splice(index, 1);
    }
    renderOrderList();
    updateOrderTotal();
}

// Render the current order list in the UI
function renderOrderList() {
    orderList.innerHTML = '';
    currentOrder.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'order-item';
        li.innerHTML = `
            <span>${item.name} x${item.quantity}</span>
            <div class="order-item-actions">
                <button class="quantity-btn" onclick="changeQuantity(${index}, -1)">-</button>
                <button class="quantity-btn" onclick="changeQuantity(${index}, 1)">+</button>
                <button class="remove-item-btn" onclick="removeOrderItem(${index})">&times;</button>
            </div>
        `;
        orderList.appendChild(li);
    });
}

// Update the total price of the current order
function updateOrderTotal() {
    const total = currentOrder.reduce((sum, item) => sum + item.price * item.quantity, 0);
    orderTotal.textContent = `Total: $${total.toFixed(2)}`;
}

// Render menu items based on selected category
// Removed redundant renderMenuItems function

// Add item to current order or increase quantity if already present
function addToOrder(item) {
    const existing = currentOrder.find(i => i.name === item.name);
    if (existing) {
        existing.quantity++;
    } else {
        currentOrder.push({...item, quantity: 1});
    }
    renderOrderList();
    updateOrderTotal();
}

// Render order queue for kitchen staff
function renderQueue() {
    orderQueueList.innerHTML = '';
    orderQueue.forEach(order => {
        const li = document.createElement('li');
        li.className = 'queue-item';
        li.innerHTML = `
            <div class="queue-header">Order #${order.id} - ${order.destination} - <em>${order.status}</em></div>
            <ul class="queue-details">
                ${order.items.map(item => `<li>${item.name} x${item.quantity}</li>`).join('')}
            </ul>
            <button onclick="markOrderReady(${order.id})">Mark as Ready</button>
        `;
        orderQueueList.appendChild(li);
    });
}
    // Removed redundant allOrders.forEach block
// Mark an order as ready and remove it from the queue
function markOrderReady(orderId) {
    const index = orderQueue.findIndex(order => order.id === orderId);
    if (index !== -1) {
        orderQueue[index].status = 'ready';
        // Optionally, remove order from queue after marking ready
        orderQueue.splice(index, 1);
        renderQueue();
        alert(`Order #${orderId} is ready!`);
    }
}

// Handle category button clicks
menuCategoryButtons.forEach(button => {
    button.onclick = () => {
        menuCategoryButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        renderMenuItems(button.textContent);
    };
});

// Handle login button click
loginBtn.onclick = () => {
    const role = roleSelect.value;
    if (!role) {
        alert('Please select a role.');
        return;
    }
    currentUserRole = role;
    loginScreen.classList.remove('active');
    mainDashboard.classList.add('active');
    if (role === 'kitchen') {
        queueSection.style.display = 'block';
        menuSection.style.display = 'none';
        orderSection.style.display = 'none';
    } else {
        queueSection.style.display = 'none';
        menuSection.style.display = 'block';
        orderSection.style.display = 'block';
    }
    renderMenuItems('Snacks');
};

// Handle logout button click
logoutBtn.onclick = () => {
    if (confirm('Are you sure you want to logout?')) {
        currentUserRole = null;
        currentOrder = [];
        orderQueue = [];
        orderCounter = 1;
        loginScreen.classList.add('active');
        mainDashboard.classList.remove('active');
        queueSection.style.display = 'none';
        menuSection.style.display = 'block';
        orderSection.style.display = 'block';
        orderList.innerHTML = '';
        orderTotal.textContent = 'Total: $0.00';
        orderQueueList.innerHTML = '';
    }
};

// Initialize variables and UI elements
const loginScreen = document.getElementById('login-screen'); // Add this line
const mainDashboard = document.getElementById('main-dashboard');
const roleSelect = document.getElementById('role-select');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

const menuSection = document.getElementById('menu-section');
const orderSection = document.getElementById('order-section');
// Removed duplicate variable declarations

orderTypeSelect.onchange = () => {
    tableSelect.style.display = orderTypeSelect.value === 'table' ? 'inline-block' : 'none';
};

// Initialize UI state
tableSelect.style.display = 'none';
renderMenuItems('Snacks');
updateOrderTotal();
