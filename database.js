const { Pool } = require('pg');

let pool;

function convert(sql) {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now','localtime'\)/gi, "to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')")
    .replace(/strftime\('%Y-%m',\s*'now'\)/gi, "to_char(CURRENT_TIMESTAMP, 'YYYY-MM')")
    .replace(/strftime\('%Y-%m',\s*([a-z_]+)\)/gi, (_, c) => `to_char(${c.trim()}, 'YYYY-MM')`);
}

async function initialize() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('La variable DATABASE_URL no está configurada');
  }
  pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await pool.query('SELECT 1');
  console.log('Conectado a PostgreSQL');

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','contador','auxiliar')),
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    grade TEXT NOT NULL,
    guardian_name TEXT,
    guardian_phone TEXT,
    guardian_email TEXT,
    address TEXT,
    status TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')),
    updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id),
    concept TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    receipt_number TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    concept TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')),
    updated_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT,
    created_at TEXT DEFAULT (to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
  )`);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');

  const bcrypt = require('bcryptjs');
  const adminExists = await get('SELECT id FROM users WHERE username = $1', ['admin']);
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    await run("INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4)", ['admin', hash, 'Administrador', 'admin']);
    console.log('Usuario admin creado (admin / admin123)');
  }
  const contadorExists = await get('SELECT id FROM users WHERE username = $1', ['contador']);
  if (!contadorExists) {
    const hash = bcrypt.hashSync('contador123', 10);
    await run("INSERT INTO users (username, password, full_name, role) VALUES ($1, $2, $3, $4)", ['contador', hash, 'Contador Principal', 'contador']);
    console.log('Usuario contador creado (contador / contador123)');
  }
}

async function query(sql, params = []) {
  try {
    const pgSql = convert(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  } catch (e) {
    throw new Error(`SQL Error: ${e.message} (SQL: ${sql.substring(0, 80)})`);
  }
}

async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function run(sql, params = []) {
  try {
    const pgSql = convert(sql);
    const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    const finalSql = isInsert ? pgSql + ' RETURNING id' : pgSql;
    const result = await pool.query(finalSql, params);
    return {
      lastInsertRowid: result.rows[0]?.id ?? null,
      changes: result.rowCount,
    };
  } catch (e) {
    throw new Error(`SQL Error: ${e.message} (SQL: ${sql.substring(0, 80)})`);
  }
}

async function audit(userId, username, action, entityType, entityId, details = null) {
  await run('INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [userId, username, action, entityType, entityId, details ? JSON.stringify(details) : null]);
}

module.exports = { initialize, query, get, run, audit };
