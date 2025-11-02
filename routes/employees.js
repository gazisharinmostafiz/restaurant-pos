const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ employees: [] });
});

router.post('/clock', async (req, res) => {
  res.json({ message: 'Clock action recorded (placeholder)' });
});

router.get('/performance', async (req, res) => {
  res.json({ performance: [] });
});

module.exports = router;

