const express = require('express');
const router = express.Router();

router.get('/floor', (req, res) => {
  res.json({ tables: [] });
});

router.post('/merge', (req, res) => {
  res.json({ message: 'Tables merged (placeholder)' });
});

module.exports = router;

