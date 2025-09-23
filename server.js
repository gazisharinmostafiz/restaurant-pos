const express = require('express');
const bodyParser = require('body-parser');
const db = require('./database.js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get all users (for login)
app.get('/api/users', (req, res) => {
    db.all("SELECT role FROM users", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ users: rows });
    });
});

// API endpoint to place a new order
app.post('/api/orders', (req, res) => {
    const { orderType, destination, items } = req.body;
    const timestamp = new Date().toLocaleString();
    const status = 'pending';

    // Begin a transaction for atomic operations
    db.run("BEGIN TRANSACTION;");

    db.run("INSERT INTO orders (order_type, destination, timestamp, status) VALUES (?, ?, ?, ?)", 
        [orderType, destination, timestamp, status], function(err) {
        if (err) {
            db.run("ROLLBACK;");
            res.status(500).json({ error: err.message });
            return;
        }
        const orderId = this.lastID;

        const stmt = db.prepare("INSERT INTO order_items (order_id, item_name, quantity, price) VALUES (?, ?, ?, ?)");
        items.forEach(item => {
            stmt.run([orderId, item.name, item.quantity, item.price], (err) => {
                if (err) {
                    db.run("ROLLBACK;");
                    res.status(500).json({ error: `Failed to insert item ${item.name}` });
                }
            });
        });
        stmt.finalize();

        db.run("COMMIT;", (err) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.status(201).json({ message: 'Order placed successfully!', orderId });
        });
    });
});

// API endpoint to get orders for the kitchen queue
app.get('/api/orders/pending', (req, res) => {
    const query = `
        SELECT o.id, o.destination, o.timestamp, oi.item_name, oi.quantity
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.status = 'pending'
        ORDER BY o.timestamp
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // Group items by order
        const orders = {};
        rows.forEach(row => {
            if (!orders[row.id]) {
                orders[row.id] = {
                    id: row.id,
                    destination: row.destination,
                    timestamp: row.timestamp,
                    items: []
                };
            }
            orders[row.id].items.push({
                name: row.item_name,
                quantity: row.quantity
            });
        });
        res.json({ orders: Object.values(orders) });
    });
});

// API endpoint for Z-Report (total sales)
app.get('/api/reports/z', (req, res) => {
    const query = `
        SELECT SUM(oi.price * oi.quantity) AS total_sales
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE date(o.timestamp) = date('now')
    `;

    db.get(query, [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const totalSales = row.total_sales || 0;
        res.json({ total_sales: totalSales });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});