const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// It's best practice to use environment variables for configuration
// to avoid hardcoding credentials in the source code.
const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'res_pos2',
    port: process.env.DB_PORT || 3307, // Using 3307 due to XAMPP port conflict
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function initializeDatabase() {
    try {
        // Helper to ignore benign errors when tables already exist (or tablespace leftovers)
        const safeQuery = async (conn, sql) => {
            try {
                await conn.query(sql);
            } catch (error) {
                if (error && (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_TABLESPACE_EXISTS')) {
                    console.warn('Skipping create, table exists:', (error.sqlMessage || error.message));
                    return;
                }
                throw error;
            }
        };
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
        await safeQuery(connection, `
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

        // Migrate any existing plaintext passwords to bcrypt hashes
        try {
            const [existingUsers] = await connection.query("SELECT id, password FROM users");
            const bcryptPattern = /^\$2[aby]\$\d{2}\$/; // typical bcrypt hash prefix
            for (const u of existingUsers) {
                const current = u.password || '';
                if (!bcryptPattern.test(current)) {
                    const hashed = await bcrypt.hash(current, 10);
                    await connection.query("UPDATE users SET password = ? WHERE id = ?", [hashed, u.id]);
                }
            }
        } catch (migrateErr) {
            console.warn('Password migration check failed:', migrateErr.message);
        }

        // Create 'orders' table
        await safeQuery(connection, `
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
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS menu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                price DECIMAL(10, 2) NOT NULL,
                category VARCHAR(255) NOT NULL,
                stock INT DEFAULT 0,
                cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00
            )
        `);

        // Add optional SKU and Barcode columns to menu
        try {
            await connection.query(`
                ALTER TABLE menu ADD COLUMN sku VARCHAR(64) NULL;
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }
        try {
            await connection.query(`
                ALTER TABLE menu ADD COLUMN barcode VARCHAR(64) NULL;
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }

        // Seed the menu table if it's empty
        const [menuRows] = await connection.query("SELECT COUNT(*) as count FROM menu");
        if (menuRows[0].count === 0) {
            console.log('Seeding menu items...');
            const menuItems = [
                { name: 'Singara', price: 1.20, category: 'Snacks', stock: 50, cost: 0.50 },
                { name: 'Muglai', price: 4.49, category: 'Snacks', stock: 30, cost: 1.80 },
                { name: 'Dal Puri', price: 1.90, category: 'Snacks', stock: 50, cost: 0.75 },
                { name: 'Extra Sauce', price: 1.00, category: 'Snacks', stock: 100, cost: 0.20 },
                { name: 'Chicken Chaap', price: 4.99, category: 'Chef Special Chaap', stock: 25, cost: 2.00 },
                { name: 'Beef Chaap', price: 6.49, category: 'Chef Special Chaap', stock: 25, cost: 2.60 },
                { name: 'Full', price: 12.99, category: 'Deshi Grilled Chicken', stock: 15, cost: 5.20 },
                { name: 'Half', price: 6.99, category: 'Deshi Grilled Chicken', stock: 20, cost: 2.80 },
                { name: 'Butter Naan', price: 1.50, category: 'Breads', stock: 100, cost: 0.60 },
                { name: 'Luchi (2 pieces)', price: 1.00, category: 'Breads', stock: 100, cost: 0.40 },
                { name: 'Porota', price: 1.50, category: 'Breads', stock: 100, cost: 0.60 },
                { name: 'Chicken Tandoori Sheek', price: 4.99, category: 'Chicken Sheek Kabab', stock: 40, cost: 2.00 },
                { name: 'Beef Sheek', price: 5.99, category: 'Beef Kabab', stock: 40, cost: 2.40 },
                { name: 'Coca-Cola', price: 1.20, category: 'Drinks', stock: 100, cost: 0.50 },
                { name: 'Borhani', price: 2.50, category: 'House Special Drinks', stock: 50, cost: 1.00 },
                { name: 'Deshi Cha (Small)', price: 1.20, category: 'Cha', stock: 200, cost: 0.40 },
                { name: 'Rosmalai', price: 1.00, category: 'Dessert', stock: 30, cost: 0.40 }
            ];
            for (const item of menuItems) {
                await connection.query(
                    "INSERT INTO menu (name, price, category, stock, cost) VALUES (?, ?, ?, ?, ?)",
                    [item.name, item.price, item.category, item.stock, item.cost]
                );
            }
        }

        // Create 'order_items' table
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS order_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                item_name VARCHAR(255) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Add 'added_at' column to order_items to track appended items time
        try {
            await connection.query(`
                ALTER TABLE order_items ADD COLUMN added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }

        // Create 'business_categories' table
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS business_categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE
            )
        `);

        // Create 'subscription_plans' table
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                price DECIMAL(10, 2) NOT NULL,
                features TEXT
            )
        `);

        // Create 'businesses' table
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS businesses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                category_id INT,
                owner_id INT NOT NULL,
                subscription_plan_id INT,
                FOREIGN KEY (category_id) REFERENCES business_categories(id),
                FOREIGN KEY (owner_id) REFERENCES users(id),
                FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id)
            )
        `);

        // Add 'business_id' to users table
        try {
            await connection.query(`
                ALTER TABLE users ADD COLUMN business_id INT, ADD FOREIGN KEY (business_id) REFERENCES businesses(id);
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }

        // Add 'business_id' to orders table
        try {
            await connection.query(`
                ALTER TABLE orders ADD COLUMN business_id INT, ADD FOREIGN KEY (business_id) REFERENCES businesses(id);
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }

        // Add 'business_id' to menu table
        try {
            await connection.query(`
                ALTER TABLE menu ADD COLUMN business_id INT, ADD FOREIGN KEY (business_id) REFERENCES businesses(id);
            `);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') throw error;
        }

        // Create 'order_payments' table to support split and partial payments
        await connection.query(`
            CREATE TABLE IF NOT EXISTS order_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                method VARCHAR(50) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
        `);

        // Create business day tracking and inventory snapshots
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS business_days (
                id INT AUTO_INCREMENT PRIMARY KEY,
                opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                opened_by INT,
                closed_at DATETIME NULL,
                closed_by INT NULL,
                notes TEXT,
                FOREIGN KEY (opened_by) REFERENCES users(id),
                FOREIGN KEY (closed_by) REFERENCES users(id)
            )
        `);
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS inventory_snapshots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                business_day_id INT NOT NULL,
                item_id INT NOT NULL,
                stock INT NOT NULL,
                price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                taken_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                type ENUM('start','end') NOT NULL,
                FOREIGN KEY (business_day_id) REFERENCES business_days(id),
                FOREIGN KEY (item_id) REFERENCES menu(id),
                INDEX (business_day_id, type)
            )
        `);

        // Create 'customers' table
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS customers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                email VARCHAR(255),
                notes TEXT,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create 'employee_shifts' table for clock in/out tracking
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS employee_shifts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                clock_in DATETIME NOT NULL,
                clock_out DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id),
                INDEX (user_id, clock_in)
            )
        `);

        // Create 'store_settings' table (single row)
        await safeQuery(connection, `
            CREATE TABLE IF NOT EXISTS store_settings (
                id INT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                address TEXT,
                phone VARCHAR(50),
                tax_rate DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
                logo_url TEXT
            )
        `);
        // Seed default settings if empty
        const [ssRows] = await connection.query("SELECT COUNT(*) as count FROM store_settings");
        if (ssRows[0].count === 0) {
            await connection.query("INSERT INTO store_settings (id, name, address, phone, tax_rate, logo_url) VALUES (1, ?, ?, ?, ?, ?)", [
                'Tong POS', '', '', 0.0000, ''
            ]);
        }

        connection.release();
        console.log('Database tables are ready.');

    } catch (err) {
        console.error('Failed to initialize database:', err);
        // Do not hard-exit on benign "already exists" tablespace errors
        if (err && (err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_TABLESPACE_EXISTS')) {
            console.warn('Continuing despite table exists/tablespace warning.');
            return;
        }
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
// Ensure default user passwords are valid (dev convenience)
updateUsers();

module.exports = pool;
