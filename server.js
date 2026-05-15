const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'boy-scouts-secret-key-2024';

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    const _json = res.json.bind(res);
    res.json = (body) => { res.set('Content-Type', 'application/json; charset=utf-8'); return _json(body); };
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

const connectedUsers = new Map();
io.on('connection', (socket) => {
  console.log('Cliente conectado');
  socket.on('auth:join', (data) => {
    connectedUsers.set(socket.id, data);
    io.emit('users:count', connectedUsers.size);
  });
  socket.on('disconnect', () => {
    connectedUsers.delete(socket.id);
    io.emit('users:count', connectedUsers.size);
    console.log('Cliente desconectado');
  });
});

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

function fullOrContador(req, res, next) {
  if (req.user.role === 'auxiliar') return res.status(403).json({ error: 'Permiso denegado' });
  next();
}

// Auth
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Campos requeridos' });
    const user = await db.get('SELECT * FROM users WHERE username = ? AND active = 1', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/register', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;
    if (!username || !password || !full_name || !role) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    if (!['admin', 'contador', 'auxiliar'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    const exists = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (exists) return res.status(400).json({ error: 'El usuario ya existe' });
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, full_name, role]
    );
    await db.audit(req.user.id, req.user.username, 'crear', 'usuario', result.lastInsertRowid, { username, full_name, role });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => res.json({ user: req.user }));

app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await db.query('SELECT id, username, full_name, role, active, created_at FROM users');
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Students
const studentsRouter = express.Router();
app.use('/api/students', authMiddleware, studentsRouter);

studentsRouter.get('/', async (req, res) => {
  try {
    const { status, grade } = req.query;
    let sql = 'SELECT * FROM students WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (grade) { sql += ' AND grade = ?'; params.push(grade); }
    sql += ' ORDER BY full_name ASC';
    res.json(await db.query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

studentsRouter.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);
    res.json(await db.query(
      "SELECT * FROM students WHERE full_name LIKE ? OR guardian_name LIKE ? ORDER BY full_name ASC",
      [`%${q}%`, `%${q}%`]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

studentsRouter.get('/:id', async (req, res) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'No encontrado' });
    res.json(student);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

studentsRouter.post('/', fullOrContador, async (req, res) => {
  try {
    const { full_name, grade, guardian_name, guardian_phone, guardian_email, address } = req.body;
    if (!full_name || !grade) return res.status(400).json({ error: 'Nombre y grado son requeridos' });
    const result = await db.run(
      'INSERT INTO students (full_name, grade, guardian_name, guardian_phone, guardian_email, address, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [full_name, grade, guardian_name || null, guardian_phone || null, guardian_email || null, address || null, req.user.id]
    );
    await db.audit(req.user.id, req.user.username, 'crear', 'estudiante', result.lastInsertRowid, { full_name, grade });
    io.emit('entity:changed', { type: 'students', action: 'create' });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

studentsRouter.put('/:id', fullOrContador, async (req, res) => {
  try {
    const { full_name, grade, guardian_name, guardian_phone, guardian_email, address, status } = req.body;
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'No encontrado' });
    await db.run(
      "UPDATE students SET full_name = ?, grade = ?, guardian_name = ?, guardian_phone = ?, guardian_email = ?, address = ?, status = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [full_name || student.full_name, grade || student.grade, guardian_name ?? student.guardian_name, guardian_phone ?? student.guardian_phone, guardian_email ?? student.guardian_email, address ?? student.address, status || student.status, req.params.id]
    );
    await db.audit(req.user.id, req.user.username, 'editar', 'estudiante', req.params.id, { full_name, grade });
    io.emit('entity:changed', { type: 'students', action: 'update' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

studentsRouter.delete('/:id', adminOnly, async (req, res) => {
  try {
    const student = await db.get('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'No encontrado' });
    await db.run('DELETE FROM payments WHERE student_id = ?', [req.params.id]);
    await db.run('DELETE FROM students WHERE id = ?', [req.params.id]);
    await db.audit(req.user.id, req.user.username, 'eliminar', 'estudiante', req.params.id, { full_name: student.full_name });
    io.emit('entity:changed', { type: 'students', action: 'delete' });
    io.emit('entity:changed', { type: 'payments', action: 'delete' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Payments
const paymentsRouter = express.Router();
app.use('/api/payments', authMiddleware, paymentsRouter);

paymentsRouter.get('/', async (req, res) => {
  try {
    const { student_id, start, end, concept } = req.query;
    let sql = 'SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id WHERE 1=1';
    const params = [];
    if (student_id) { sql += ' AND p.student_id = ?'; params.push(student_id); }
    if (start) { sql += ' AND p.payment_date >= ?'; params.push(start); }
    if (end) { sql += ' AND p.payment_date <= ?'; params.push(end); }
    if (concept) { sql += ' AND p.concept = ?'; params.push(concept); }
    sql += ' ORDER BY p.payment_date DESC';
    res.json(await db.query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

paymentsRouter.post('/', fullOrContador, async (req, res) => {
  try {
    const { student_id, concept, amount, payment_date, payment_method, receipt_number, notes } = req.body;
    if (!student_id || !concept || !amount || !payment_date || !payment_method) {
      return res.status(400).json({ error: 'Campos requeridos: estudiante, concepto, monto, fecha, método' });
    }
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    const result = await db.run(
      'INSERT INTO payments (student_id, concept, amount, payment_date, payment_method, receipt_number, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [student_id, concept, amount, payment_date, payment_method, receipt_number || null, notes || null, req.user.id]
    );
    await db.audit(req.user.id, req.user.username, 'crear', 'pago', result.lastInsertRowid, { student_id, concept, amount });
    io.emit('entity:changed', { type: 'payments', action: 'create' });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

paymentsRouter.delete('/:id', adminOnly, async (req, res) => {
  try {
    const payment = await db.get('SELECT * FROM payments WHERE id = ?', [req.params.id]);
    if (!payment) return res.status(404).json({ error: 'No encontrado' });
    await db.run('DELETE FROM payments WHERE id = ?', [req.params.id]);
    await db.audit(req.user.id, req.user.username, 'eliminar', 'pago', req.params.id, { concept: payment.concept, amount: payment.amount });
    io.emit('entity:changed', { type: 'payments', action: 'delete' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Expenses
const expensesRouter = express.Router();
app.use('/api/expenses', authMiddleware, expensesRouter);

expensesRouter.get('/', async (req, res) => {
  try {
    const { category, start, end } = req.query;
    let sql = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (start) { sql += ' AND expense_date >= ?'; params.push(start); }
    if (end) { sql += ' AND expense_date <= ?'; params.push(end); }
    sql += ' ORDER BY expense_date DESC';
    res.json(await db.query(sql, params));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

expensesRouter.get('/:id', async (req, res) => {
  try {
    const expense = await db.get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!expense) return res.status(404).json({ error: 'No encontrado' });
    res.json(expense);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

expensesRouter.post('/', fullOrContador, async (req, res) => {
  try {
    const { concept, amount, expense_date, category, description } = req.body;
    if (!concept || !amount || !expense_date || !category) {
      return res.status(400).json({ error: 'Campos requeridos: concepto, monto, fecha, categoría' });
    }
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    const result = await db.run(
      'INSERT INTO expenses (concept, amount, expense_date, category, description, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      [concept, amount, expense_date, category, description || null, req.user.id]
    );
    await db.audit(req.user.id, req.user.username, 'crear', 'gasto', result.lastInsertRowid, { concept, amount, category });
    io.emit('entity:changed', { type: 'expenses', action: 'create' });
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

expensesRouter.put('/:id', fullOrContador, async (req, res) => {
  try {
    const { concept, amount, expense_date, category, description } = req.body;
    const expense = await db.get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!expense) return res.status(404).json({ error: 'No encontrado' });
    await db.run(
      "UPDATE expenses SET concept = ?, amount = ?, expense_date = ?, category = ?, description = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [concept || expense.concept, amount || expense.amount, expense_date || expense.expense_date, category || expense.category, description ?? expense.description, req.params.id]
    );
    await db.audit(req.user.id, req.user.username, 'editar', 'gasto', req.params.id, { concept, amount });
    io.emit('entity:changed', { type: 'expenses', action: 'update' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

expensesRouter.delete('/:id', adminOnly, async (req, res) => {
  try {
    const expense = await db.get('SELECT * FROM expenses WHERE id = ?', [req.params.id]);
    if (!expense) return res.status(404).json({ error: 'No encontrado' });
    await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    await db.audit(req.user.id, req.user.username, 'eliminar', 'gasto', req.params.id, { concept: expense.concept, amount: expense.amount });
    io.emit('entity:changed', { type: 'expenses', action: 'delete' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reports
app.get('/api/reports/summary', authMiddleware, async (req, res) => {
  try {
    const totalIncome = await db.get("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now')");
    const totalExpenses = await db.get("SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')");
    const incomeByConcept = await db.query("SELECT concept, COALESCE(SUM(amount),0) as total FROM payments WHERE strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now') GROUP BY concept");
    const expensesByCategory = await db.query("SELECT category, COALESCE(SUM(amount),0) as total FROM expenses WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now') GROUP BY category");
    const monthly = await db.query(`
      SELECT strftime('%Y-%m', date) as mes, SUM(ingresos) as ingresos, SUM(gastos) as gastos FROM (
        SELECT payment_date as date, amount as ingresos, 0 as gastos FROM payments
        UNION ALL
        SELECT expense_date as date, 0 as ingresos, amount as gastos FROM expenses
      ) sub GROUP BY mes ORDER BY mes DESC LIMIT 6
    `);
    const totalStudents = await db.get("SELECT COUNT(*) as count FROM students WHERE status = 'activo'");
    res.json({
      totalIncome: totalIncome.total,
      totalExpenses: totalExpenses.total,
      balance: Number(totalIncome.total) - Number(totalExpenses.total),
      incomeByConcept, expensesByCategory,
      monthly: monthly.reverse(),
      totalStudents: totalStudents.count
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/range', authMiddleware, async (req, res) => {
  try {
    const { start, end } = req.query;
    let income, expenses;
    if (start && end) {
      income = await db.query('SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id WHERE p.payment_date >= ? AND p.payment_date <= ? ORDER BY p.payment_date', [start, end]);
      expenses = await db.query('SELECT * FROM expenses WHERE expense_date >= ? AND expense_date <= ? ORDER BY expense_date', [start, end]);
    } else {
      income = await db.query('SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id ORDER BY p.payment_date DESC LIMIT 100');
      expenses = await db.query('SELECT * FROM expenses ORDER BY expense_date DESC LIMIT 100');
    }
    const totalIncome = income.reduce((s, i) => s + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    res.json({ income, expenses, totalIncome, totalExpenses, balance: totalIncome - totalExpenses });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/by-student/:id', authMiddleware, async (req, res) => {
  try {
    const payments = await db.query('SELECT * FROM payments WHERE student_id = ? ORDER BY payment_date DESC', [req.params.id]);
    const total = payments.reduce((s, p) => s + Number(p.amount), 0);
    res.json({ payments, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Audit
app.get('/api/audit', authMiddleware, async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const logs = await db.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?', [parseInt(limit) || 50, parseInt(offset) || 0]);
    const count = await db.get('SELECT COUNT(*) as total FROM audit_log');
    res.json({ logs, total: count.total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Export PDF
app.get('/api/export/pdf', authMiddleware, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { type, start, end } = req.query;
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte.pdf');
    doc.pipe(res);
    doc.fontSize(18).text('Colegio Boy Scouts', { align: 'center' });
    doc.fontSize(14).text('Reporte Financiero', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Generado: ${new Date().toLocaleDateString('es-CO')}`, { align: 'right' });
    doc.moveDown();
    if (type === 'payments' || !type) {
      let payments;
      if (start && end) {
        payments = await db.query('SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id WHERE p.payment_date >= ? AND p.payment_date <= ? ORDER BY p.payment_date DESC LIMIT 100', [start, end]);
      } else {
        payments = await db.query('SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id ORDER BY p.payment_date DESC LIMIT 100');
      }
      doc.fontSize(12).text('Ingresos (Pagos)', { underline: true });
      doc.moveDown(0.5);
      payments.forEach(p => {
        doc.fontSize(9).text(`${p.payment_date} | ${p.student_name} | ${p.concept} | $${Number(p.amount).toLocaleString('es-CO')} | ${p.payment_method}`);
      });
      const total = payments.reduce((s, p) => s + Number(p.amount), 0);
      doc.moveDown();
      doc.fontSize(10).text(`Total Ingresos: $${total.toLocaleString('es-CO')}`, { bold: true });
      doc.addPage();
    }
    if (type === 'expenses' || !type) {
      let expenses;
      if (start && end) {
        expenses = await db.query('SELECT * FROM expenses WHERE expense_date >= ? AND expense_date <= ? ORDER BY expense_date DESC LIMIT 100', [start, end]);
      } else {
        expenses = await db.query('SELECT * FROM expenses ORDER BY expense_date DESC LIMIT 100');
      }
      doc.fontSize(12).text('Gastos', { underline: true });
      doc.moveDown(0.5);
      expenses.forEach(e => {
        doc.fontSize(9).text(`${e.expense_date} | ${e.concept} | ${e.category} | $${Number(e.amount).toLocaleString('es-CO')}`);
      });
      const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
      doc.moveDown();
      doc.fontSize(10).text(`Total Gastos: $${total.toLocaleString('es-CO')}`);
    }
    doc.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Export Excel
app.get('/api/export/excel', authMiddleware, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { type, start, end } = req.query;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Colegio Boy Scouts';
    workbook.created = new Date();
    if (type === 'payments' || !type) {
      const sheet = workbook.addWorksheet('Ingresos');
      sheet.columns = [
        { header: 'Fecha', key: 'date', width: 14 }, { header: 'Estudiante', key: 'student', width: 25 },
        { header: 'Concepto', key: 'concept', width: 20 }, { header: 'Monto', key: 'amount', width: 15 },
        { header: 'Método', key: 'method', width: 15 }, { header: 'Recibo', key: 'receipt', width: 15 }
      ];
      let payments;
      if (start && end) {
        payments = await db.query('SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id WHERE p.payment_date >= ? AND p.payment_date <= ? ORDER BY p.payment_date DESC LIMIT 1000', [start, end]);
      } else {
        payments = await db.query('SELECT p.*, s.full_name as student_name FROM payments p JOIN students s ON p.student_id = s.id ORDER BY p.payment_date DESC LIMIT 1000');
      }
      payments.forEach(p => sheet.addRow({ date: p.payment_date, student: p.student_name, concept: p.concept, amount: p.amount, method: p.payment_method, receipt: p.receipt_number || '' }));
    }
    if (type === 'expenses' || !type) {
      const sheet = workbook.addWorksheet('Gastos');
      sheet.columns = [
        { header: 'Fecha', key: 'date', width: 14 }, { header: 'Concepto', key: 'concept', width: 25 },
        { header: 'Categoría', key: 'category', width: 20 }, { header: 'Monto', key: 'amount', width: 15 },
        { header: 'Descripción', key: 'desc', width: 30 }
      ];
      let expenses;
      if (start && end) {
        expenses = await db.query('SELECT * FROM expenses WHERE expense_date >= ? AND expense_date <= ? ORDER BY expense_date DESC LIMIT 1000', [start, end]);
      } else {
        expenses = await db.query('SELECT * FROM expenses ORDER BY expense_date DESC LIMIT 1000');
      }
      expenses.forEach(e => sheet.addRow({ date: e.expense_date, concept: e.concept, category: e.category, amount: e.amount, desc: e.description || '' }));
    }
    const summarySheet = workbook.addWorksheet('Resumen');
    let totalIncomeResult, totalExpensesResult;
    if (start && end) {
      totalIncomeResult = await db.query('SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE payment_date >= ? AND payment_date <= ?', [start, end]);
      totalExpensesResult = await db.query('SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE expense_date >= ? AND expense_date <= ?', [start, end]);
    } else {
      totalIncomeResult = await db.query('SELECT COALESCE(SUM(amount),0) as t FROM payments');
      totalExpensesResult = await db.query('SELECT COALESCE(SUM(amount),0) as t FROM expenses');
    }
    summarySheet.addRow(['Tipo', 'Total']);
    summarySheet.addRow(['Total Ingresos', Number(totalIncomeResult[0].t)]);
    summarySheet.addRow(['Total Gastos', Number(totalExpensesResult[0].t)]);
    summarySheet.addRow(['Balance', Number(totalIncomeResult[0].t) - Number(totalExpensesResult[0].t)]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Config routes
app.get('/api/config/concepts', authMiddleware, (req, res) => res.json(['Matrícula', 'Mensualidad', 'Uniformes', 'Materiales', 'Eventos', 'Transporte', 'Otros']));
app.get('/api/config/categories', authMiddleware, (req, res) => res.json(['Servicios', 'Material didáctico', 'Salarios', 'Mantenimiento', 'Eventos', 'Transporte', 'Otros']));
app.get('/api/config/grades', authMiddleware, (req, res) => res.json(['Párvulo', 'Pre Jardín', 'Jardín', 'Transición', 'Primero', 'Segundo']));
app.get('/api/config/payment-methods', authMiddleware, (req, res) => res.json(['Efectivo', 'Transferencia', 'Tarjeta', 'Otros']));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.initialize().then(() => {
  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Usuarios: admin/admin123, contador/contador123`);
  });
}).catch(err => {
  console.error('Error al iniciar:', err);
  process.exit(1);
});
