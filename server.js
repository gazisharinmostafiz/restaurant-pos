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
    secret: process.env.SESSION_SECRET || 'your-secret-key', // Use an environment variable for this
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
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

app.get('/api/users', async (req, res) => {
    try {
        const [rows] = await db.execute("SELECT role FROM users");
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
            CONCAT('[', GROUP_CONCAT(JSON_OBJECT('name', oi.item_name, 'quantity', oi.quantity, 'price', oi.price)), ']') as items
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status IN ('pending', 'ready')
        GROUP BY o.id
        ORDER BY o.timestamp;
    `;

    try {
        const [rows] = await db.execute(query);
        // The items are already a JSON string from the database, so we just need to parse them.
        const orders = rows.map(order => ({ ...order, items: JSON.parse(order.items) }));
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
    const { date } = req.query; // e.g., '2023-10-27'

    try {
        let query = `
            SELECT o.id, o.destination, o.timestamp, o.payment_method, o.discount, 
                   COALESCE((SELECT SUM(oi.price * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0) as total 
            FROM orders o
            WHERE o.status = 'completed'`;

        const params = [];
        if (date) {
            query += ` AND DATE(o.timestamp) = ?`;
            params.push(date);
        }
        query += ` ORDER BY o.timestamp DESC`;
        const [orders] = await db.execute(query, params);
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});