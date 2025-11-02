const express = require('express');
const router = express.Router();

router.get('/items', (req, res) => {
  res.json({ items: [] });
});

router.get('/categories', (req, res) => {
  res.json({ categories: [] });
});

module.exports = router;

