const express = require('express');
const router = express.Router();
const db = require('../database.js');

router.get('/sales-summary', async (req, res) => {
  const period = (req.query.period || 'daily').toLowerCase();
  try {
    let groupExpr = 'DATE(o.timestamp)';
    if (period === 'weekly') groupExpr = "YEARWEEK(o.timestamp, 1)";
    if (period === 'monthly') groupExpr = "DATE_FORMAT(o.timestamp, '%Y-%m')";

    const query = `
      SELECT ${groupExpr} AS label,
             SUM( (SELECT COALESCE(SUM(oi.price*oi.quantity),0) FROM order_items oi WHERE oi.order_id = o.id) - COALESCE(o.discount,0) ) AS sales,
             SUM(CASE WHEN o.payment_method = 'cash' THEN ( (SELECT COALESCE(SUM(oi2.price*oi2.quantity),0) FROM order_items oi2 WHERE oi2.order_id = o.id) - COALESCE(o.discount,0) ) ELSE 0 END) AS cash_sales,
             SUM(CASE WHEN o.payment_method = 'card' THEN ( (SELECT COALESCE(SUM(oi3.price*oi3.quantity),0) FROM order_items oi3 WHERE oi3.order_id = o.id) - COALESCE(o.discount,0) ) ELSE 0 END) AS card_sales
      FROM orders o
      WHERE o.status = 'completed'
      GROUP BY label
      ORDER BY MIN(o.timestamp) DESC
      LIMIT 180;
    `;
    const [rows] = await db.execute(query);
    res.json({ period, data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute sales summary' });
  }
});

router.get('/product-performance', async (req, res) => {
  const start = req.query.startDate || null;
  const end = req.query.endDate || null;
  try {
    let where = "o.status='completed'";
    const params = [];
    if (start) { where += ' AND DATE(o.timestamp) >= ?'; params.push(start); }
    if (end) { where += ' AND DATE(o.timestamp) <= ?'; params.push(end); }
    const query = `
      SELECT oi.item_name AS name,
             SUM(oi.quantity) AS quantity,
             SUM(oi.price * oi.quantity) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE ${where}
      GROUP BY oi.item_name
      ORDER BY revenue DESC, quantity DESC
      LIMIT 500;
    `;
    const [rows] = await db.execute(query, params);
    res.json({ products: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute product performance' });
  }
});

router.get('/category-sales', async (req, res) => {
  const start = req.query.startDate || null;
  const end = req.query.endDate || null;
  try {
    let where = "o.status='completed'";
    const params = [];
    if (start) { where += ' AND DATE(o.timestamp) >= ?'; params.push(start); }
    if (end) { where += ' AND DATE(o.timestamp) <= ?'; params.push(end); }
    const query = `
      SELECT COALESCE(m.category, 'Uncategorized') AS category,
             SUM(oi.quantity) AS quantity,
             SUM(oi.price * oi.quantity) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN menu m ON m.name = oi.item_name
      WHERE ${where}
      GROUP BY category
      ORDER BY revenue DESC, quantity DESC
      LIMIT 200;
    `;
    const [rows] = await db.execute(query, params);
    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute category sales' });
  }
});

// --- Business Day Start/Close and Stock-based Estimate ---

router.post('/start-day', async (req, res) => {
  const userId = req.session.user?.id || null;
  const conn = await db.getConnection();
  try {
    const [[openDay]] = await conn.execute("SELECT id FROM business_days WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1");
    if (openDay) { conn.release(); return res.status(400).json({ error: 'A business day is already open.' }); }
    const [result] = await conn.execute("INSERT INTO business_days (opened_by) VALUES (?)", [userId]);
    const dayId = result.insertId;
    const [items] = await conn.execute("SELECT id, stock, price, cost FROM menu");
    if (items && items.length) {
      const values = items.map(i => [dayId, i.id, i.stock||0, i.price||0, i.cost||0, 'start']);
      await conn.query("INSERT INTO inventory_snapshots (business_day_id, item_id, stock, price, cost, type) VALUES ?", [values]);
    }
    conn.release();
    res.json({ success: true, businessDayId: dayId });
  } catch (err) {
    conn.release();
    res.status(500).json({ error: 'Failed to start business day' });
  }
});

router.post('/close-day', async (req, res) => {
  const userId = req.session.user?.id || null;
  const conn = await db.getConnection();
  try {
    const [[openDay]] = await conn.execute("SELECT id FROM business_days WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1");
    if (!openDay) { conn.release(); return res.status(400).json({ error: 'No open business day.' }); }
    const dayId = openDay.id;
    await conn.execute("UPDATE business_days SET closed_at = NOW(), closed_by = ? WHERE id = ?", [userId, dayId]);
    const [items] = await conn.execute("SELECT id, stock, price, cost FROM menu");
    if (items && items.length) {
      const values = items.map(i => [dayId, i.id, i.stock||0, i.price||0, i.cost||0, 'end']);
      await conn.query("INSERT INTO inventory_snapshots (business_day_id, item_id, stock, price, cost, type) VALUES ?", [values]);
    }
    conn.release();
    res.json({ success: true, businessDayId: dayId });
  } catch (err) {
    conn.release();
    res.status(500).json({ error: 'Failed to close business day' });
  }
});

router.get('/estimate-sales', async (req, res) => {
  try {
    let dayId = parseInt(req.query.businessDayId||'0',10)||0;
    if (!dayId) {
      const [[row]] = await db.execute("SELECT id FROM business_days WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1");
      if (!row) return res.json({ items: [], totals: { sold_qty:0, est_revenue:0, est_cost:0, est_gross:0 }, businessDayId: null });
      dayId = row.id;
    }
    const [startRows] = await db.execute("SELECT item_id, stock, price, cost FROM inventory_snapshots WHERE business_day_id = ? AND type='start'", [dayId]);
    const [endRows] = await db.execute("SELECT item_id, stock FROM inventory_snapshots WHERE business_day_id = ? AND type='end'", [dayId]);
    const endMap = new Map(endRows.map(r=>[r.item_id, r.stock]));
    const items = startRows.map(s => {
      const endStock = endMap.has(s.item_id) ? Number(endMap.get(s.item_id)) : s.stock;
      const sold = Math.max(0, Number(s.stock||0) - endStock);
      const revenue = sold * Number(s.price||0);
      const cost = sold * Number(s.cost||0);
      return { item_id: s.item_id, start_stock: Number(s.stock||0), end_stock: endStock, sold_qty: sold, price: Number(s.price||0), cost: Number(s.cost||0), est_revenue: revenue, est_cost: cost };
    }).filter(x=>x.sold_qty>0);
    const totals = items.reduce((t,x)=>{ t.sold_qty+=x.sold_qty; t.est_revenue+=x.est_revenue; t.est_cost+=x.est_cost; return t; }, { sold_qty:0, est_revenue:0, est_cost:0 });
    totals.est_gross = totals.est_revenue - totals.est_cost;
    res.json({ businessDayId: dayId, items, totals });
  } catch (err) {
    res.status(500).json({ error: 'Failed to estimate sales' });
  }
});

module.exports = router;
