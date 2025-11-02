const express = require('express');
const router = express.Router();

router.get('/sales-summary', async (req, res) => {
  res.json({ total: 0, period: 'daily', data: [] });
});

router.get('/product-performance', async (req, res) => {
  res.json({ products: [] });
});

router.get('/category-sales', async (req, res) => {
  res.json({ categories: [] });
});

module.exports = router;

