const express = require('express');
const router = express.Router();

// Placeholder inventory endpoints
router.get('/items', async (req, res) => {
  res.json({ items: [] });
});

// Admin only: create items
router.post('/items', async (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user?.role)) return res.status(403).json({ error: 'Forbidden' });
  res.status(201).json({ message: 'Item created (placeholder)' });
});

// Admin only: update items
router.put('/items/:id', async (req, res) => {
  if (!['admin','superadmin'].includes(req.session.user?.role)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ message: 'Item updated (placeholder)' });
});

// Kitchen or Admin: adjust stock
router.post('/stock/adjust', async (req, res) => {
  const role = req.session.user?.role;
  if (!['admin','kitchen'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
  res.json({ message: 'Stock adjusted (placeholder)' });
});

module.exports = router;
