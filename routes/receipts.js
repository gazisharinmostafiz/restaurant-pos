const express = require('express');
const router = express.Router();
const db = require('../database.js');

// Lazy require to avoid hard dependency when email not used
function getMailer(){ try { return require('nodemailer'); } catch { return null; } }
function getPDFKit(){ try { return require('pdfkit'); } catch { return null; } }

async function buildReceiptDoc(order){
  const PDFDocument = getPDFKit();
  if (!PDFDocument) throw new Error('PDFKit not installed');
  const doc = new PDFDocument({ size:'A4', margin: 36 });
  const chunks = []; let resolve;
  const done = new Promise(r=> resolve=r);
  doc.on('data', d=> chunks.push(d));
  doc.on('end', ()=> resolve(Buffer.concat(chunks)));

  const store = { name: 'Tong POS', address: '', phone: '' };
  try { const [[row]] = await db.execute('SELECT name, address, phone, tax_rate FROM store_settings WHERE id=1'); if (row){ store.name=row.name; store.address=row.address; store.phone=row.phone; store.taxRate = Number(row.tax_rate)||0; } } catch {}

  doc.fontSize(16).text(store.name||'Tong POS', { align:'center' });
  if (store.address) doc.fontSize(10).text(store.address, { align:'center' });
  if (store.phone) doc.fontSize(10).text('Phone: '+store.phone, { align:'center' });
  doc.moveDown();
  if (order.id) doc.fontSize(12).text(`Order #${order.id} - ${order.destination||''}`);
  doc.fontSize(10).text(new Date().toLocaleString());
  doc.moveDown();
  doc.fontSize(11);
  let subtotal = 0;
  (order.items||[]).forEach(it=>{ const line = `${it.item_name||it.name} x ${it.quantity}  £${(Number(it.price||0)*Number(it.quantity||0)).toFixed(2)}`; subtotal += Number(it.price||0)*Number(it.quantity||0); doc.text(line); });
  doc.moveDown();
  const discount = Number(order.discount||0);
  const tax = (subtotal - discount) * (store.taxRate||0);
  const total = subtotal - discount + tax;
  doc.text(`Subtotal: £${subtotal.toFixed(2)}`);
  if (discount>0) doc.text(`Discount: -£${discount.toFixed(2)}`);
  if ((store.taxRate||0)>0) doc.text(`Tax (${((store.taxRate||0)*100).toFixed(0)}%): £${tax.toFixed(2)}`);
  doc.font('Helvetica-Bold').text(`Total: £${total.toFixed(2)}`);
  doc.end();
  return done;
}

router.get('/:id/pdf', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const [[o]] = await db.execute('SELECT id, destination, discount FROM orders WHERE id = ?', [id]);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    const [items] = await db.execute('SELECT item_name, quantity, price FROM order_items WHERE order_id = ?', [id]);
    const buf = await buildReceiptDoc({ id: o.id, destination: o.destination, discount: o.discount, items });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${id}.pdf`);
    return res.send(buf);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

router.post('/email', async (req, res) => {
  const nodemailer = getMailer();
  const id = req.body.orderId ? Number(req.body.orderId) : null;
  const to = (req.body.to||'').trim();
  if (!nodemailer) return res.status(500).json({ error: 'Email module not installed' });
  if (!to) return res.status(400).json({ error: 'Recipient email required' });
  try {
    let order = req.body;
    if (id){
      const [[o]] = await db.execute('SELECT id, destination, discount FROM orders WHERE id = ?', [id]);
      if (!o) return res.status(404).json({ error: 'Order not found' });
      const [items] = await db.execute('SELECT item_name, quantity, price FROM order_items WHERE order_id = ?', [id]);
      order = { id:o.id, destination:o.destination, discount:o.discount, items };
    }
    const pdf = await buildReceiptDoc(order);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT)||587,
      secure: String(process.env.SMTP_SECURE||'false')==='true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const from = process.env.SMTP_FROM || 'no-reply@localhost';
    await transporter.sendMail({ from, to, subject: `Receipt${order.id?` #${order.id}`:''}`, text: 'Please find your receipt attached.', attachments:[{ filename: `receipt${order.id?`-${order.id}`:''}.pdf`, content: pdf }] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send receipt email' });
  }
});

module.exports = router;

