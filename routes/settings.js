const express = require('express');
const router = express.Router();
const db = require('../database.js');

router.get('/store', async (req, res) => {
  try {
    const [[row]] = await db.execute('SELECT id, name, address, phone, tax_rate, logo_url FROM store_settings WHERE id = 1');
    if (!row) return res.json({ name: 'Tong POS', address: '', phone: '', tax_rate: 0, logo_url: '' });
    res.json({ name: row.name, address: row.address, phone: row.phone, tax_rate: Number(row.tax_rate)||0, logo_url: row.logo_url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load store settings' });
  }
});

router.put('/store', async (req, res) => {
  if (req.session.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { name, address, phone, tax_rate, logo_url } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    await db.execute('UPDATE store_settings SET name = ?, address = ?, phone = ?, tax_rate = ?, logo_url = ? WHERE id = 1', [name.trim(), address||'', phone||'', Number(tax_rate)||0, logo_url||'']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

router.get('/payment-methods', (req, res) => {
  // Static for now; could be moved to DB later
  res.json({ methods: ['cash', 'card', 'mobile', 'giftcard', 'loyalty'] });
});

module.exports = router;
