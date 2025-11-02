require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./database.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Session Middleware
app.use(session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24,
    },
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Middleware to protect routes
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

app.get('/api/users', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const [rows] = await db.execute("SELECT id, username, role FROM users");
        res.json({ users: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTHENTICATION ROUTES ---

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [[user]] = await db.execute("SELECT * FROM users WHERE username = ?", [username]);
        if (user && await bcrypt.compare(password, user.password)) {
            // Passwords match, create session
            req.session.user = { id: user.id, username: user.username, role: user.role };
            res.json({ success: true, user: { username: user.username, role: user.role } });
        } else {
            // Invalid credentials
            res.status(401).json({ error: 'Invalid username or password.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.clearCookie('connect.sid'); // The default session cookie name
        res.json({ success: true, message: 'Logged out successfully.' });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});


// --- PROTECTED API ROUTES ---
// All routes below this point will require authentication

app.get('/api/menu', isAuthenticated, async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT id, name, price, category, stock FROM menu ORDER BY category, name");
        console.log('Menu data:', rows);
        res.json({ menu: rows });
    } catch (err) {
        console.error('Failed to fetch menu:', err);
        res.status(500).json({ error: 'Failed to fetch menu.' });
    }
});

app.post('/api/orders', isAuthenticated, async (req, res) => {
    const { orderType, destination, items } = req.body;
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const status = 'pending'; // Default status for new orders

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'Order must contain items.' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        // Check stock levels and lock rows
        for (const item of items) {
            const [[menuItem]] = await connection.execute("SELECT stock FROM menu WHERE name = ? FOR UPDATE", [item.name]);
            if (!menuItem || menuItem.stock < item.quantity) {
                await connection.rollback();
                return res.status(400).json({ error: `Insufficient stock for ${item.name}. Only ${menuItem.stock} left.` });
            }
        }

        // Deduct stock
        for (const item of items) {
            await connection.execute("UPDATE menu SET stock = stock - ? WHERE name = ?", [item.quantity, item.name]);
        }

        const [result] = await connection.execute(
            "INSERT INTO orders (order_type, destination, timestamp, status) VALUES (?, ?, ?, ?)",
            [orderType, destination, timestamp, status]
        );
        const orderId = result.insertId;

        const itemQueries = items.map(item =>
            connection.execute(
                "INSERT INTO order_items (order_id, item_name, quantity, price) VALUES (?, ?, ?, ?)",
                [orderId, item.name, item.quantity, item.price]
            )
        );
        await Promise.all(itemQueries);

        await connection.commit();
        res.status(201).json({ message: 'Order placed successfully!', orderId });

    } catch (err) {
        await connection.rollback();
        console.error('Failed to place order:', err);
        res.status(500).json({ error: 'Failed to place order.' });

    } finally {
        connection.release();
    }
});

app.get('/api/orders/pending', isAuthenticated, async (req, res) => {
    const query = `
        SELECT 
            o.id, 
            o.destination, 
            o.timestamp, 
            o.status,
            o.discount,
            COALESCE((SELECT SUM(oi2.price * oi2.quantity) FROM order_items oi2 WHERE oi2.order_id = o.id), 0) AS total,
            COALESCE((SELECT SUM(p.amount) FROM order_payments p WHERE p.order_id = o.id), 0) AS paid,
            CONCAT('[', GROUP_CONCAT(JSON_OBJECT('name', oi.item_name, 'quantity', oi.quantity, 'price', oi.price, 'added_at', DATE_FORMAT(oi.added_at, '%Y-%m-%d %H:%i:%s'))), ']') as items
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status IN ('pending', 'ready')
        GROUP BY o.id
        ORDER BY o.timestamp;
    `;

    try {
        const [rows] = await db.execute(query);
        const orders = rows.map(order => {
            const items = JSON.parse(order.items);
            const finalTotal = Number(order.total) - Number(order.discount || 0);
            const paid = Number(order.paid || 0);
            const balance = Math.max(0, finalTotal - paid);
            return { ...order, items, total: finalTotal, paid, balance };
        });
        res.json({ orders });
    } catch (err) {
        console.error('Failed to fetch order queue:', err);
        res.status(500).json({ error: 'Failed to retrieve orders.' });
    }
});

// API endpoint to update an order's status (e.g., from 'pending' to 'ready')
app.patch('/api/orders/:id/status', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'ready', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }

    try {
        const [result] = await db.execute("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }
        res.json({ message: `Order ${id} status updated to ${status}.` });
    } catch (err) {
        console.error(`Failed to update status for order ${id}:`, err);
        res.status(500).json({ error: 'Failed to update order status.' });
    }
});

// API endpoint to mark an order as completed
app.patch('/api/orders/:id/complete', isAuthenticated, async (req, res) => {
    const orderId = parseInt(req.params.id, 10);
    const { paymentMethod, discount } = req.body;

    // Validate payment method
    if (!paymentMethod || !['cash', 'card'].includes(paymentMethod.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid or missing payment method.' });
    }

    // Ensure discount is valid
    const finalDiscount = (typeof discount === 'number' && discount >= 0) ? discount : 0;

    try {
        // Update order status and payment details
        const [result] = await db.execute(
            "UPDATE orders SET status = 'completed', payment_method = ?, discount = ? WHERE id = ?",
            [paymentMethod.toLowerCase(), finalDiscount, orderId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        res.json({ success: true, message: 'Order marked as completed successfully!' });
    } catch (err) {
        console.error(`❌ Failed to complete order ${orderId}:`, err);
        res.status(500).json({ error: 'Payment failed due to a server issue.' });
    }
});

// Add a payment to an order (supports split/partial payments)
app.post('/api/orders/:id/payments', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { method, amount } = req.body;
    const valid = ['cash', 'card', 'mobile', 'gift', 'loyalty'];
    const payMethod = (method || '').toLowerCase();
    const amt = Number(amount);
    if (!valid.includes(payMethod)) return res.status(400).json({ error: 'Invalid payment method.' });
    if (!(amt > 0)) return res.status(400).json({ error: 'Invalid payment amount.' });

    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        const [[order]] = await connection.execute("SELECT discount, status FROM orders WHERE id = ? FOR UPDATE", [id]);
        if (!order || !['pending','ready'].includes(order.status)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Order is not open for payment.' });
        }
        const [[totRow]] = await connection.execute("SELECT COALESCE(SUM(price * quantity),0) AS total FROM order_items WHERE order_id = ?", [id]);
        const [[paidRow]] = await connection.execute("SELECT COALESCE(SUM(amount),0) AS paid FROM order_payments WHERE order_id = ?", [id]);
        const total = Number(totRow.total || 0) - Number(order.discount || 0);
        const paid = Number(paidRow.paid || 0);
        const balance = Math.max(0, total - paid);
        const applied = Math.min(amt, balance);
        await connection.execute("INSERT INTO order_payments (order_id, amount, method) VALUES (?, ?, ?)", [id, applied, payMethod]);

        const newPaid = paid + applied;
        const newBalance = Math.max(0, total - newPaid);

        // If fully paid, mark order completed and set payment_method
        if (newBalance <= 0) {
            // Determine method label
            const [methodsRows] = await connection.execute("SELECT DISTINCT method FROM order_payments WHERE order_id = ?", [id]);
            const methods = methodsRows.map(r => r.method);
            const methodLabel = (methods.length === 1) ? methods[0] : 'mixed';
            await connection.execute("UPDATE orders SET status = 'completed', payment_method = ? WHERE id = ?", [methodLabel, id]);
        }

        await connection.commit();
        res.json({ success: true, applied, balance: newBalance });
    } catch (err) {
        await connection.rollback();
        console.error('Failed to add payment:', err);
        res.status(500).json({ error: 'Could not add payment.' });
    } finally {
        connection.release();
    }
});

// Append items to an existing order (e.g., same table adds more items)
app.post('/api/orders/:id/items', isAuthenticated, async (req, res) => {
    const { id } = req.params;
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No items to append.' });
    }
    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        const [[orderRow]] = await connection.execute("SELECT status FROM orders WHERE id = ? FOR UPDATE", [id]);
        if (!orderRow || !['pending','ready'].includes(orderRow.status)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Order is not open for updates.' });
        }

        for (const item of items) {
            const [[menuItem]] = await connection.execute("SELECT stock FROM menu WHERE name = ? FOR UPDATE", [item.name]);
            if (!menuItem || menuItem.stock < item.quantity) {
                await connection.rollback();
                return res.status(400).json({ error: `Insufficient stock for ${item.name}. Only ${menuItem ? menuItem.stock : 0} left.` });
            }
        }

        for (const item of items) {
            await connection.execute("UPDATE menu SET stock = stock - ? WHERE name = ?", [item.quantity, item.name]);
        }

        const insertPromises = items.map(item =>
            connection.execute(
                "INSERT INTO order_items (order_id, item_name, quantity, price) VALUES (?, ?, ?, ?)",
                [id, item.name, item.quantity, item.price]
            )
        );
        await Promise.all(insertPromises);

        await connection.commit();
        res.json({ success: true, message: 'Items appended to order.' });
    } catch (err) {
        await connection.rollback();
        console.error('Failed to append items:', err);
        res.status(500).json({ error: 'Failed to append items to order.' });
    } finally {
        connection.release();
    }
});

// --- Extended domain routes (placeholders for structure) ---
const inventoryRoutes = require('./routes/inventory');
const customerRoutes = require('./routes/customers');
const employeeRoutes = require('./routes/employees');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const accountingRoutes = require('./routes/accounting');
const systemRoutes = require('./routes/system');
const helpRoutes = require('./routes/help');
const menuMgmtRoutes = require('./routes/menuMgmt');
const tableRoutes = require('./routes/tables');

app.use('/api/inventory', isAuthenticated, inventoryRoutes);
app.use('/api/customers', isAuthenticated, customerRoutes);
app.use('/api/employees', isAuthenticated, employeeRoutes);
app.use('/api/reportsx', isAuthenticated, reportsRoutes);
app.use('/api/settings', isAuthenticated, settingsRoutes);
app.use('/api/accounting', isAuthenticated, accountingRoutes);
app.use('/api/system', isAuthenticated, systemRoutes);
app.use('/api/help', isAuthenticated, helpRoutes);
app.use('/api/menu-mgmt', isAuthenticated, menuMgmtRoutes);
app.use('/api/tables', isAuthenticated, tableRoutes);



// API endpoint for Z-Report (total sales for today)
app.get('/api/reports/z', isAuthenticated, async (req, res) => {
    // This query correctly calculates the total for each order (items sum - discount)
    // and then groups the results by payment method for an accurate daily total.
    const query = `
        SELECT payment_method, SUM(final_total) AS sales
        FROM (
            SELECT 
                o.payment_method,
                (SELECT SUM(oi.price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id) - o.discount AS final_total
            FROM orders o
            WHERE o.status = 'completed' AND DATE(o.timestamp) = CURDATE()
        ) AS daily_sales
        GROUP BY payment_method;
    `;

    try {
        const [rows] = await db.execute(query);
        const report = {
            total_sales: 0,
            cash_sales: 0,
            card_sales: 0
        };

        rows.forEach(row => {
            const sales = parseFloat(row.sales);
            if (row.payment_method === 'cash') {
                report.cash_sales += sales;
            } else if (row.payment_method === 'card') {
                report.card_sales += sales;
            }
            report.total_sales += sales;
        });

        res.json(report);
    } catch (err) {
        console.error('Failed to generate Z-report:', err);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
});

app.get('/api/reports/profit-loss', isAuthenticated, async (req, res) => {
    const { startDate, endDate } = req.query;

    // Default to today if no dates are provided
    const finalStartDate = startDate ? startDate : new Date().toISOString().slice(0, 10);
    const finalEndDate = endDate ? endDate : new Date().toISOString().slice(0, 10);

    const query = `
        SELECT 
            SUM(oi.price * oi.quantity) as total_revenue,
            SUM(m.cost * oi.quantity) as total_cost,
            SUM(o.discount) as total_discount
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN menu m ON oi.item_name = m.name
        WHERE o.status = 'completed' AND DATE(o.timestamp) BETWEEN ? AND ?;
    `;

    try {
        const [[report]] = await db.execute(query, [finalStartDate, finalEndDate]);
        const totalRevenue = parseFloat(report.total_revenue) || 0;
        const totalCost = parseFloat(report.total_cost) || 0;
        const totalDiscount = parseFloat(report.total_discount) || 0;
        const grossProfit = totalRevenue - totalCost - totalDiscount;

        res.json({
            total_revenue: totalRevenue,
            total_cost: totalCost,
            total_discount: totalDiscount,
            gross_profit: grossProfit,
            start_date: finalStartDate,
            end_date: finalEndDate
        });
    } catch (err) {
        console.error('Failed to generate Profit/Loss report:', err);
        res.status(500).json({ error: 'Failed to generate report.' });
    }
});

app.post('/api/stock', isAuthenticated, async (req, res) => {
    const { updates } = req.body; // Expects an array of { name, stock }
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Invalid stock update data.' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        for (const item of updates) {
            await connection.execute("UPDATE menu SET stock = ? WHERE name = ?", [item.stock, item.name]);
        }
        await connection.commit();
        res.json({ success: true, message: 'Stock levels updated successfully!' });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: 'Failed to update stock levels.' });
    } finally {
        connection.release();
    }
});

app.get('/api/orders/completed', isAuthenticated, async (req, res) => {
    const { date, paymentMethod } = req.query;

    try {
        let query = `
            SELECT 
                o.id, o.destination, o.timestamp, o.payment_method, o.discount, 
                COALESCE((SELECT SUM(oi.price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0) as total,
                CONCAT('[', GROUP_CONCAT(JSON_OBJECT('item_name', oi.item_name, 'quantity', oi.quantity, 'price', oi.price)), ']') as items
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.status = 'completed'`;

        const params = [];
        if (date) {
            query += ` AND DATE(o.timestamp) = ?`;
            params.push(date);
        }
        if (paymentMethod) {
            query += ` AND o.payment_method = ?`;
            params.push(paymentMethod);
        }
        query += ` GROUP BY o.id ORDER BY o.timestamp DESC`;
        
        const [rows] = await db.execute(query, params);
        const orders = rows.map(order => ({ ...order, items: JSON.parse(order.items || '[]') }));
        res.json({ orders });
    } catch (err) {
        console.error('Failed to fetch completed orders:', err);
        res.status(500).json({ error: 'Failed to retrieve completed orders.' });
    }
});

// --- ADMIN PANEL ROUTES ---

app.post('/api/menu/item', isAuthenticated, async (req, res) => {
    // Add role check for 'admin'
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { name, price, category, stock } = req.body;
    try {
        await db.execute("INSERT INTO menu (name, price, category, stock) VALUES (?, ?, ?, ?)", [name, price, category, stock]);
        res.status(201).json({ success: true, message: 'Menu item added.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add menu item.' });
    }
});

app.put('/api/menu/item/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, price, category } = req.body;
    try {
        await db.execute("UPDATE menu SET name = ?, price = ?, category = ? WHERE id = ?", [name, price, category, id]);
        res.json({ success: true, message: 'Menu item updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update menu item.' });
    }
});

app.delete('/api/menu/item/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    try {
        await db.execute("DELETE FROM menu WHERE id = ?", [id]);
        res.json({ success: true, message: 'Menu item deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete menu item.' });
    }
});

app.post('/api/users', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required.' });
    }

    if (!['admin', 'waiter', 'kitchen', 'front'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            [username, hashedPassword, role]
        );
        res.status(201).json({ success: true, message: `User '${username}' created successfully.` });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        console.error('Failed to create user:', err);
        res.status(500).json({ error: 'Failed to create user due to a server error.' });
    }
});

app.put('/api/users/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { username, password, role } = req.body;

    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role are required.' });
    }

    if (!['admin', 'waiter', 'kitchen', 'front'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }

    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.execute(
                "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?",
                [username, hashedPassword, role, id]
            );
        } else {
            await db.execute(
                "UPDATE users SET username = ?, role = ? WHERE id = ?",
                [username, role, id]
            );
        }
        res.json({ success: true, message: `User '${username}' updated successfully.` });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already exists.' });
        }
        console.error('Failed to update user:', err);
        res.status(500).json({ error: 'Failed to update user due to a server error.' });
    }
});

app.delete('/api/users/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;

    try {
        await db.execute("DELETE FROM users WHERE id = ?", [id]);
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Failed to delete user:', err);
        res.status(500).json({ error: 'Failed to delete user due to a server error.' });
    }
});

app.get('/api/admin/dashboard-summary', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const salesQuery = `
            SELECT 
                SUM((SELECT SUM(oi.price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id) - o.discount) as total_sales,
                COUNT(o.id) as total_orders
            FROM orders o
            WHERE o.status = 'completed' AND DATE(o.timestamp) = CURDATE();
        `;
        const usersQuery = `SELECT COUNT(id) as user_count FROM users;`;
        const lowStockQuery = `SELECT COUNT(id) as low_stock_count FROM menu WHERE stock < 10;`;

        const [[salesData]] = await db.execute(salesQuery);
        const [[userData]] = await db.execute(usersQuery);
        const [[lowStockData]] = await db.execute(lowStockQuery);

        res.json({
            todays_sales: parseFloat(salesData.total_sales) || 0,
            todays_orders: salesData.total_orders || 0,
            total_users: userData.user_count || 0,
            low_stock_items: lowStockData.low_stock_count || 0
        });

    } catch (err) {
        console.error('Failed to fetch dashboard summary:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard summary.' });
    }
});


// --- Business Category ROUTES ---

app.get('/api/business-categories', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const [rows] = await db.execute("SELECT * FROM business_categories");
        res.json({ categories: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/business-categories', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { name } = req.body;
    try {
        await db.execute("INSERT INTO business_categories (name) VALUES (?)", [name]);
        res.status(201).json({ success: true, message: 'Business category created.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create business category.' });
    }
});

app.put('/api/business-categories/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    const { name } = req.body;
    try {
        await db.execute("UPDATE business_categories SET name = ? WHERE id = ?", [name, id]);
        res.json({ success: true, message: 'Business category updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update business category.' });
    }
});

app.delete('/api/business-categories/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    try {
        await db.execute("DELETE FROM business_categories WHERE id = ?", [id]);
        res.json({ success: true, message: 'Business category deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete business category.' });
    }
});

// --- Subscription Plan ROUTES ---

app.get('/api/subscription-plans', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const [rows] = await db.execute("SELECT * FROM subscription_plans");
        res.json({ plans: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/subscription-plans', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, price, features } = req.body;
    try {
        await db.execute("INSERT INTO subscription_plans (name, price, features) VALUES (?, ?, ?)", [name, price, features]);
        res.status(201).json({ success: true, message: 'Subscription plan created.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create subscription plan.' });
    }
});

app.put('/api/subscription-plans/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    const { name, price, features } = req.body;
    try {
        await db.execute("UPDATE subscription_plans SET name = ?, price = ?, features = ? WHERE id = ?", [name, price, features, id]);
        res.json({ success: true, message: 'Subscription plan updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update subscription plan.' });
    }
});

app.delete('/api/subscription-plans/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    try {
        await db.execute("DELETE FROM subscription_plans WHERE id = ?", [id]);
        res.json({ success: true, message: 'Subscription plan deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete subscription plan.' });
    }
});

// --- Business ROUTES ---

app.get('/api/businesses', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const [rows] = await db.execute("SELECT * FROM businesses");
        res.json({ businesses: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/businesses/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    try {
        const [[business]] = await db.execute("SELECT * FROM businesses WHERE id = ?", [id]);
        res.json({ business });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/businesses', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { name, category_id, owner_id, subscription_plan_id } = req.body;
    try {
        await db.execute("INSERT INTO businesses (name, category_id, owner_id, subscription_plan_id) VALUES (?, ?, ?, ?)", [name, category_id, owner_id, subscription_plan_id]);
        res.status(201).json({ success: true, message: 'Business created.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create business.' });
    }
});

app.put('/api/businesses/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    const { name, category_id, owner_id, subscription_plan_id } = req.body;
    try {
        await db.execute("UPDATE businesses SET name = ?, category_id = ?, owner_id = ?, subscription_plan_id = ? WHERE id = ?", [name, category_id, owner_id, subscription_plan_id, id]);
        res.json({ success: true, message: 'Business updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update business.' });
    }
});

app.delete('/api/businesses/:id', isAuthenticated, async (req, res) => {
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;
    try {
        await db.execute("DELETE FROM businesses WHERE id = ?", [id]);
        res.json({ success: true, message: 'Business deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete business.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
