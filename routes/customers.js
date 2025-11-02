const express = require('express');
const router = express.Router();
const db = require('../database.js');

// List customers (optional search)
router.get('/', async (req, res) => {
  const term = (req.query.term || '').trim();
  try {
    if (term) {
      const like = `%${term}%`;
      const [rows] = await db.execute(
        'SELECT id, name, phone, email, notes, created_at FROM customers WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 200',
        [like, like, like]
      );
      return res.json({ customers: rows });
    }
    const [rows] = await db.execute('SELECT id, name, phone, email, notes, created_at FROM customers ORDER BY created_at DESC LIMIT 500');
    res.json({ customers: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Create customer
router.post('/', async (req, res) => {
  const { name, phone, email, notes } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    await db.execute('INSERT INTO customers (name, phone, email, notes) VALUES (?, ?, ?, ?)', [name.trim(), phone || null, email || null, notes || null]);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update customer
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, notes } = req.body || {};
  try {
    await db.execute('UPDATE customers SET name = ?, phone = ?, email = ?, notes = ? WHERE id = ?', [name, phone, email, notes, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Delete customer
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.execute('DELETE FROM customers WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
