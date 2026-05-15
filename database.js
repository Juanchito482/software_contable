const path = require('path');
const fs = require('fs');
let initSqlJs, db, SQL;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'colegio.db');

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function save() {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

async function initialize() {
    initSqlJs = require('sql.js');
    SQL = await initSqlJs();
    ensureDir(DB_PATH);
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run("PRAGMA foreign_keys = ON");
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','contador','auxiliar')),
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        grade TEXT NOT NULL,
        guardian_name TEXT,
        guardian_phone TEXT,
        guardian_email TEXT,
        address TEXT,
        status TEXT DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id),
        concept TEXT NOT NULL,
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        receipt_number TEXT,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concept TEXT NOT NULL,
        amount REAL NOT NULL,
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        username TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    db.run('CREATE INDEX IF NOT EXISTS idx_students_name ON students(full_name)');
    db.run('CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date)');
    db.run('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');

    const bcrypt = require('bcryptjs');
    const adminExists = get('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const hash = bcrypt.hashSync('admin123', 10);
        run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['admin', hash, 'Administrador', 'admin']);
        console.log('Usuario admin creado (admin / admin123)');
    }
    const contadorExists = get('SELECT id FROM users WHERE username = ?', ['contador']);
    if (!contadorExists) {
        const hash = bcrypt.hashSync('contador123', 10);
        run("INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)", ['contador', hash, 'Contador Principal', 'contador']);
        console.log('Usuario contador creado (contador / contador123)');
    }
}

function query(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params && params.length > 0) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
    } catch (e) {
        throw new Error(`SQL Error: ${e.message} (SQL: ${sql.substring(0, 80)})`);
    }
}

function get(sql, params = []) {
    const rows = query(sql, params);
    return rows[0] || null;
}

function run(sql, params = []) {
    try {
        db.run(sql, params);
        const idResult = query('SELECT last_insert_rowid() as id');
        const lastInsertRowid = idResult.length > 0 ? idResult[0].id : null;
        const changes = db.getRowsModified();
        save();
        return { lastInsertRowid, changes };
    } catch (e) {
        throw new Error(`SQL Error: ${e.message} (SQL: ${sql.substring(0, 80)})`);
    }
}

function audit(userId, username, action, entityType, entityId, details = null) {
    run('INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, username, action, entityType, entityId, details ? JSON.stringify(details) : null]);
}

module.exports = { initialize, query, get, run, audit };
