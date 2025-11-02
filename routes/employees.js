const express = require('express');
const router = express.Router();
const db = require('../database.js');

// Basic list of employees from users table (non-admin)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT id, username, role FROM users WHERE role <> 'admin' ORDER BY username");
    res.json({ employees: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// Clock in/out for current session user
router.post('/clock', async (req, res) => {
  const userId = req.session.user?.id;
  const action = (req.body?.action || '').toLowerCase();
  if (!userId || !['in','out'].includes(action)) return res.status(400).json({ error: 'Invalid request' });
  try {
    if (action === 'in') {
      await db.execute('INSERT INTO employee_shifts (user_id, clock_in) VALUES (?, NOW())', [userId]);
      return res.json({ success: true, status: 'in' });
    } else {
      await db.execute('UPDATE employee_shifts SET clock_out = NOW() WHERE user_id = ? AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1', [userId]);
      return res.json({ success: true, status: 'out' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to record clock action' });
  }
});

// Simple performance: hours worked in last 7 days per user
router.get('/performance', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT u.id, u.username, SUM(TIMESTAMPDIFF(MINUTE, s.clock_in, COALESCE(s.clock_out, NOW())))/60 AS hours
      FROM users u
      LEFT JOIN employee_shifts s ON s.user_id = u.id AND s.clock_in >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      WHERE u.role <> 'admin'
      GROUP BY u.id, u.username
      ORDER BY hours DESC, u.username
    `);
    res.json({ performance: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get performance' });
  }
});

module.exports = router;
