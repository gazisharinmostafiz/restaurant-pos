require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./database.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Compression for better performance
try { const compression = require('compression'); app.use(compression()); } catch {}

// Avoid noisy 404s for favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

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

// Static caching (7 days, immutable for hashed assets)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d', immutable: true }));
app.use(bodyParser.json());

// SPA routes: serve index.html for app sections
const SPA_PATHS = [
  '/sales','/orders','/inventory',
  '/products/categories','/products/list','/products/add','/products/barcodes','/products/adjustments','/products/adjustments/add','/products/stock-count',
  '/expenses','/expenses/categories','/expenses/list','/expenses/add',
  '/customers','/employees','/reports',
  '/settings','/settings/printers','/settings/invoice','/settings/roles','/settings/discounts','/settings/discounts/add',
  '/accounting','/system','/help','/menu','/tables','/kitchen'
];
SPA_PATHS.forEach(p => {
  app.get(p, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// Catch‑all for SPA paths: serve index.html for non-API, non-admin, and non-static (no extension) routes
app.use((req, res, next) => {
  const p = req.path || '';
  // Skip API and admin
  if (p.startsWith('/api') || p.startsWith('/admin')) return next();
  // If it looks like a file (has extension), let static/404 handle it
  if (path.extname(p)) return next();
  // Serve SPA shell
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware to protect routes
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Simple role guard helper
const allowRoles = (...roles) => (req, res, next) => {
    const r = req.session.user?.role;
    if (!r) return res.status(403).json({ error: 'Forbidden' });
    if (r === 'superadmin' || roles.includes(r)) return next();
    return res.status(403).json({ error: 'Forbidden' });
};

app.get('/api/users', isAuthenticated, async (req, res) => {
    const requesterRole = req.session.user.role;
    if (!['admin', 'superadmin'].includes(requesterRole)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        let query = "SELECT id, username, role FROM users";
        const params = [];
        if (requesterRole === 'admin') {
            query += " WHERE role <> 'superadmin'";
        }
        const [rows] = await db.execute(query, params);
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
        const [rows] = await db.execute("SELECT id, name, price, category, stock, cost, sku, barcode FROM menu ORDER BY category, name");
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
const receiptsRoutes = require('./routes/receipts');
const settingsRoutes = require('./routes/settings');
const accountingRoutes = require('./routes/accounting');
const systemRoutes = require('./routes/system');
const helpRoutes = require('./routes/help');
const menuMgmtRoutes = require('./routes/menuMgmt');
const tableRoutes = require('./routes/tables');
const profileRoutes = require('./routes/profile');

// Inventory: restrict mutating endpoints inside routes file; general mount stays authenticated
app.use('/api/inventory', isAuthenticated, inventoryRoutes);
app.use('/api/customers', isAuthenticated, allowRoles('admin','front','waiter'), customerRoutes);
app.use('/api/employees', isAuthenticated, employeeRoutes);
app.use('/api/reports', isAuthenticated, allowRoles('admin'), reportsRoutes);
app.use('/api/receipts', isAuthenticated, receiptsRoutes);
app.use('/api/settings', isAuthenticated, allowRoles('admin'), settingsRoutes);
app.use('/api/accounting', isAuthenticated, allowRoles('admin'), accountingRoutes);
app.use('/api/system', isAuthenticated, allowRoles('admin'), systemRoutes);
app.use('/api/help', isAuthenticated, helpRoutes);
app.use('/api/menu-mgmt', isAuthenticated, allowRoles('admin'), menuMgmtRoutes);
app.use('/api/tables', isAuthenticated, tableRoutes);
app.use('/api/profile', isAuthenticated, profileRoutes);



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

// Stock updates: allow admin and kitchen only
app.post('/api/stock', isAuthenticated, allowRoles('admin','kitchen'), async (req, res) => {
    const { updates } = req.body; // Expects an array of { id, stock } (name optional fallback)
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Invalid stock update data.' });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();
    try {
        for (const item of updates) {
            if (!item) continue;
            const stock = Number(item.stock);
            const id = Number(item.id)||0;
            const name = (item.name||'').trim();
            if (!(stock>=0)) continue; // skip invalid
            if (id>0) {
                await connection.execute("UPDATE menu SET stock = ? WHERE id = ?", [stock, id]);
            } else if (name) {
                await connection.execute("UPDATE menu SET stock = ? WHERE name = ?", [stock, name]);
            }
        }
        await connection.commit();
        res.json({ success: true, message: 'Stock levels updated successfully!' });
    } catch (err) {
        console.error('Stock update failed:', err);
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { name, price, category, stock, cost = 0, sku = null, barcode = null } = req.body;
    try {
        await db.execute("INSERT INTO menu (name, price, category, stock, cost, sku, barcode) VALUES (?, ?, ?, ?, ?, ?, ?)", [name, price, category, stock, cost, sku, barcode]);
        res.status(201).json({ success: true, message: 'Menu item added.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add menu item.' });
    }
});

app.put('/api/menu/item/:id', isAuthenticated, async (req, res) => {
    if (!['admin', 'superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    const { name, price, category, cost = 0, sku = null, barcode = null } = req.body;
    try {
        await db.execute("UPDATE menu SET name = ?, price = ?, category = ?, cost = ?, sku = ?, barcode = ? WHERE id = ?", [name, price, category, cost, sku, barcode, id]);
        res.json({ success: true, message: 'Menu item updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update menu item.' });
    }
});

app.delete('/api/menu/item/:id', isAuthenticated, async (req, res) => {
    if (!['admin', 'superadmin'].includes(req.session.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { id } = req.params;
    try {
        await db.execute("DELETE FROM menu WHERE id = ?", [id]);
        res.json({ success: true, message: 'Menu item deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete menu item.' });
    }
});

app.post('/api/users', isAuthenticated, async (req, res) => {
    const requesterRole = req.session.user.role;
    if (!['admin', 'superadmin'].includes(requesterRole)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password, and role are required.' });
    }

    const allowedRoles = ['admin', 'waiter', 'kitchen', 'front'];
    if (requesterRole === 'superadmin') {
        allowedRoles.push('superadmin');
    }

    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }
    if (role === 'superadmin' && requesterRole !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden' });
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
    const requesterRole = req.session.user.role;
    if (!['admin', 'superadmin'].includes(requesterRole)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { username, password, role } = req.body;

    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role are required.' });
    }

    const allowedRoles = ['admin', 'waiter', 'kitchen', 'front'];
    if (requesterRole === 'superadmin') {
        allowedRoles.push('superadmin');
    }
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }
    if (role === 'superadmin' && requesterRole !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const [[existing]] = await db.execute("SELECT role FROM users WHERE id = ?", [id]);
        if (!existing) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (existing.role === 'superadmin' && requesterRole !== 'superadmin') {
            return res.status(403).json({ error: 'Forbidden' });
        }

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
    const requesterRole = req.session.user.role;
    if (!['admin', 'superadmin'].includes(requesterRole)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;

    try {
        const [[existing]] = await db.execute("SELECT role FROM users WHERE id = ?", [id]);
        if (!existing) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (existing.role === 'superadmin' && requesterRole !== 'superadmin') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await db.execute("DELETE FROM users WHERE id = ?", [id]);
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (err) {
        console.error('Failed to delete user:', err);
        res.status(500).json({ error: 'Failed to delete user due to a server error.' });
    }
});

app.get('/api/admin/dashboard-summary', isAuthenticated, async (req, res) => {
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const [todayRows] = await db.execute(`
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity),0) AS sales,
                COALESCE(SUM(IFNULL(m.cost, 0) * oi.quantity),0) AS purchases,
                COUNT(DISTINCT o.id) AS orders
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu m ON m.name = oi.item_name
            WHERE DATE(o.timestamp) = CURDATE();
        `);

        const [monthRows] = await db.execute(`
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity),0) AS sales,
                COALESCE(SUM(IFNULL(m.cost, 0) * oi.quantity),0) AS purchases
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu m ON m.name = oi.item_name
            WHERE o.timestamp >= DATE_FORMAT(CURDATE(), '%Y-%m-01');
        `);

        const [totalsRows] = await db.execute(`
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity),0) AS sales,
                COALESCE(SUM(IFNULL(m.cost, 0) * oi.quantity),0) AS purchases
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu m ON m.name = oi.item_name;
        `);

        const [monthlyRows] = await db.execute(`
            SELECT DATE_FORMAT(o.timestamp, '%Y-%m') AS period,
                   COALESCE(SUM(oi.price * oi.quantity),0) AS sales,
                   COALESCE(SUM(IFNULL(m.cost, 0) * oi.quantity),0) AS purchases
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN menu m ON m.name = oi.item_name
            WHERE o.timestamp >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
            GROUP BY period
            ORDER BY period;
        `);

        const [topProductRows] = await db.execute(`
            SELECT oi.item_name AS name,
                   SUM(oi.quantity) AS quantity,
                   SUM(oi.price * oi.quantity) AS sales
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.timestamp >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
            GROUP BY oi.item_name
            ORDER BY quantity DESC
            LIMIT 5;
        `);

        const [recentRows] = await db.execute(`
            SELECT o.id,
                   o.destination,
                   o.status,
                   o.timestamp,
                   COALESCE(SUM(oi.price * oi.quantity),0) AS total
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            GROUP BY o.id, o.destination, o.status, o.timestamp
            ORDER BY o.timestamp DESC
            LIMIT 5;
        `);

        const [[userData]] = await db.execute('SELECT COUNT(id) AS user_count FROM users');
        const [[lowStockData]] = await db.execute('SELECT COUNT(id) AS low_stock_count FROM menu WHERE stock < 10');

        const today = todayRows[0] || { sales: 0, purchases: 0, orders: 0 };
        const month = monthRows[0] || { sales: 0, purchases: 0 };
        const totals = totalsRows[0] || { sales: 0, purchases: 0 };

        const monthMap = new Map();
        monthlyRows.forEach(row => {
            monthMap.set(row.period, {
                sales: Number(row.sales || 0),
                purchases: Number(row.purchases || 0)
            });
        });

        const monthlySeries = { labels: [], sales: [], purchases: [], profit: [] };
        const todayDate = new Date();
        for (let i = 11; i >= 0; i--) {
            const ref = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
            const key = ref.toISOString().slice(0, 7);
            const label = ref.toLocaleString('default', { month: 'short', year: 'numeric' });
            const values = monthMap.get(key) || { sales: 0, purchases: 0 };
            const sales = Number(values.sales || 0);
            const purchases = Number(values.purchases || 0);
            monthlySeries.labels.push(label);
            monthlySeries.sales.push(sales);
            monthlySeries.purchases.push(purchases);
            monthlySeries.profit.push(Number((sales - purchases).toFixed(2)));
        }

        res.json({
            summary: {
                today: {
                    sales: Number(today.sales || 0),
                    purchases: Number(today.purchases || 0),
                    profit: Number((Number(today.sales || 0) - Number(today.purchases || 0)).toFixed(2)),
                    orders: Number(today.orders || 0)
                },
                month: {
                    sales: Number(month.sales || 0),
                    purchases: Number(month.purchases || 0),
                    profit: Number((Number(month.sales || 0) - Number(month.purchases || 0)).toFixed(2))
                },
                totals: {
                    sales: Number(totals.sales || 0),
                    purchases: Number(totals.purchases || 0),
                    profit: Number((Number(totals.sales || 0) - Number(totals.purchases || 0)).toFixed(2))
                },
                users: Number(userData.user_count || 0),
                lowStock: Number(lowStockData.low_stock_count || 0)
            },
            monthlySeries,
            topProducts: topProductRows.map(row => ({
                name: row.name,
                quantity: Number(row.quantity || 0),
                sales: Number(row.sales || 0)
            })),
            recentOrders: recentRows.map(row => ({
                id: row.id,
                destination: row.destination,
                status: row.status,
                timestamp: row.timestamp,
                total: Number(row.total || 0)
            }))
        });

    } catch (err) {
        console.error('Failed to fetch dashboard summary:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard summary.' });
    }
});


// --- Business Category ROUTES ---

app.get('/api/business-categories', isAuthenticated, async (req, res) => {
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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
    if (!['admin', 'superadmin'].includes(req.session.user.role)) {
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

