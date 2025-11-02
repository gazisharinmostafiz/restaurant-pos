const express = require('express');
const router = express.Router();

router.post('/sync', (req, res) => {
  res.json({ message: 'Sync triggered (placeholder)' });
});

router.get('/backup', (req, res) => {
  res.json({ message: 'Backup created (placeholder)' });
});

module.exports = router;

