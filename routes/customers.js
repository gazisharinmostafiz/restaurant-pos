const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ customers: [] });
});

router.post('/', async (req, res) => {
  res.status(201).json({ message: 'Customer created (placeholder)' });
});

router.put('/:id', async (req, res) => {
  res.json({ message: 'Customer updated (placeholder)' });
});

module.exports = router;

