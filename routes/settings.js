const express = require('express');
const router = express.Router();

router.get('/store', (req, res) => {
  res.json({ name: 'My Store', timezone: 'UTC' });
});

router.get('/payment-methods', (req, res) => {
  res.json({ methods: ['cash', 'card', 'mobile', 'giftcard', 'loyalty'] });
});

module.exports = router;

