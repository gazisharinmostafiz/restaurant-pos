const express = require('express');
const router = express.Router();

router.get('/cash-management', (req, res) => {
  res.json({ open: false, drops: [] });
});

router.get('/eod', (req, res) => {
  res.json({ reconciled: false, totals: {} });
});

module.exports = router;

