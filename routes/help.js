const express = require('express');
const router = express.Router();

router.get('/guide', (req, res) => {
  res.json({ url: 'https://example.com/guide' });
});

router.get('/training', (req, res) => {
  res.json({ mode: false });
});

module.exports = router;

