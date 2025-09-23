const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./restaurant.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the restaurant database.');
});

db.serialize(() => {
    // Create 'users' table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL UNIQUE
    )`);

    // Insert user roles if they don't exist
    const roles = ['kitchen', 'front', 'waiter'];
    db.each("SELECT role FROM users", (err, row) => {
        const index = roles.indexOf(row.role);
        if (index > -1) {
            roles.splice(index, 1);
        }
    }, () => {
        const stmt = db.prepare("INSERT INTO users (role) VALUES (?)");
        roles.forEach(role => {
            stmt.run(role, (err) => {
                if (err) {
                    console.error(`Error inserting role ${role}: ${err.message}`);
                }
            });
        });
        stmt.finalize();
    });

    // Create 'orders' table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_type TEXT NOT NULL,
        destination TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL
    )`);

    // Create 'order_items' table
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )`);
});

module.exports = db;