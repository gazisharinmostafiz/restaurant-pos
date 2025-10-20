const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// It's best practice to use environment variables for configuration
// to avoid hardcoding credentials in the source code.
const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'res_pos',
    port: process.env.DB_PORT || 3307, // Using 3307 due to XAMPP port conflict
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initializeDatabase() {
    try {
        // Connect without a specific database to check if it exists and create it if not.
        const tempConnection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            port: process.env.DB_PORT || 3307,
        });
        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS 
${process.env.DB_NAME || 'res_pos'}`);
        await tempConnection.end();

        // Now, get a connection from the pool which is configured to use the correct database.
        const connection = await pool.getConnection();
        console.log('Connected to MySQL.');

        // Create 'users' table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL
            )
        `);

        // Seed the users table if it's empty
        const [userRows] = await connection.query("SELECT COUNT(*) as count FROM users");
        if (userRows[0].count === 0) {
            console.log('Seeding users...');
            const users = [
                { username: 'admin', password: '1234', role: 'admin' },
                { username: 'waiter', password: '1234', role: 'waiter' },
                { username: 'kitchen', password: '1234', role: 'kitchen' },
                { username: 'front', password: '1234', role: 'front' },
            ];
            for (const user of users) {
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await connection.query("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [user.username, hashedPassword, user.role]);
            }
        }

        // Create 'orders' table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_type VARCHAR(255) NOT NULL,
                destination VARCHAR(255) NOT NULL,
                timestamp DATETIME NOT NULL,
                status ENUM('pending', 'ready', 'completed') NOT NULL DEFAULT 'pending',
                payment_method VARCHAR(50),
                discount DECIMAL(10, 2) DEFAULT 0.00
            )
        `);

        // Create 'menu' table to store items and stock levels
        await connection.query(`
            CREATE TABLE IF NOT EXISTS menu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                price DECIMAL(10, 2) NOT NULL,
                category VARCHAR(255) NOT NULL,
                stock INT DEFAULT 0
            )
        `);

        // Seed the menu table if it's empty
        const [menuRows] = await connection.query("SELECT COUNT(*) as count FROM menu");
        if (menuRows[0].count === 0) {
            console.log('Seeding menu items...');
            const menuItems = [
                { name: 'Singara', price: 1.20, category: 'Snacks', stock: 50 },
                { name: 'Muglai', price: 4.49, category: 'Snacks', stock: 30 },
                { name: 'Dal Puri', price: 1.90, category: 'Snacks', stock: 50 },
                { name: 'Extra Sauce', price: 1.00, category: 'Snacks', stock: 100 },
                { name: 'Chicken Chaap', price: 4.99, category: 'Chef Special Chaap', stock: 25 },
                { name: 'Beef Chaap', price: 6.49, category: 'Chef Special Chaap', stock: 25 },
                { name: 'Full', price: 12.99, category: 'Deshi Grilled Chicken', stock: 15 },
                { name: 'Half', price: 6.99, category: 'Deshi Grilled Chicken', stock: 20 },
                { name: 'Butter Naan', price: 1.50, category: 'Breads', stock: 100 },
                { name: 'Luchi (2 pieces)', price: 1.00, category: 'Breads', stock: 100 },
                { name: 'Porota', price: 1.50, category: 'Breads', stock: 100 },
                { name: 'Chicken Tandoori Sheek', price: 4.99, category: 'Chicken Sheek Kabab', stock: 40 },
                { name: 'Beef Sheek', price: 5.99, category: 'Beef Kabab', stock: 40 },
                { name: 'Coca-Cola', price: 1.20, category: 'Drinks', stock: 100 },
                { name: 'Borhani', price: 2.50, category: 'House Special Drinks', stock: 50 },
                { name: 'Deshi Cha (Small)', price: 1.20, category: 'Cha', stock: 200 },
                { name: 'Rosmalai', price: 1.00, category: 'Dessert', stock: 30 }
            ];
            for (const item of menuItems) {
                await connection.query(
                    "INSERT INTO menu (name, price, category, stock) VALUES (?, ?, ?, ?)",
                    [item.name, item.price, item.category, item.stock]
                );
            }
        }

        // Create 'order_items' table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                item_name VARCHAR(255) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        connection.release();
        console.log('Database tables are ready.');

    } catch (err) {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    }
}

async function updateUsers() {
    try {
        const connection = await pool.getConnection();
        console.log('Updating users...');
        const users = [
            { username: 'admin', password: '1234', role: 'admin' },
            { username: 'waiter', password: '1234', role: 'waiter' },
            { username: 'kitchen', password: '1234', role: 'kitchen' },
            { username: 'front', password: '1234', role: 'front' },
        ];
        for (const user of users) {
            const hashedPassword = await bcrypt.hash(user.password, 10);
            await connection.query("UPDATE users SET password = ? WHERE username = ?", [hashedPassword, user.username]);
        }
        connection.release();
        console.log('Users updated.');
    } catch (err) {
        console.error('Failed to update users:', err.message);
    }
}

console.log('Initializing database...');
initializeDatabase();

module.exports = pool;