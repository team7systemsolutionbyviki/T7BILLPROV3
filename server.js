const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const os = require('os');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the static frontend
app.use(express.static(path.join(__dirname, '/')));

// --- Utility: Get Local IP ---
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// Initialize SQLite Database
const dbPath = path.join(__dirname, 't7billpro.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Database connection error:", err.message);
    else console.log("Connected to SQLite database.");
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS waiters (
        id TEXT PRIMARY KEY,
        name TEXT,
        username TEXT,
        passwordHash TEXT,
        role TEXT,
        active BOOLEAN,
        createdAt TEXT
    )`, (err) => {
        if (!err) {
            // Attempt to add new columns if the table already existed from older versions
            db.run(`ALTER TABLE waiters ADD COLUMN username TEXT`, () => {});
            db.run(`ALTER TABLE waiters ADD COLUMN passwordHash TEXT`, () => {});
            db.run(`ALTER TABLE waiters ADD COLUMN role TEXT`, () => {});
        }
    });
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        price REAL,
        active BOOLEAN,
        available BOOLEAN
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS tables (
        id TEXT PRIMARY KEY,
        name TEXT,
        status TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        orderId TEXT PRIMARY KEY,
        waiterId TEXT,
        waiterName TEXT,
        tableId TEXT,
        tableName TEXT,
        items TEXT,
        subtotal REAL,
        discount REAL,
        total REAL,
        status TEXT,
        createdAt TEXT,
        updatedAt TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
});

// Helper for DB queries
const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
    });
});

const getQuery = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

// --- API Endpoints ---

app.get('/api/server-info', (req, res) => {
    const ip = getLocalIP();
    res.json({
        ip: ip,
        port: 3000,
        waiterUrl: `http://${ip}:3000/?mode=waiter`
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    db.get('SELECT * FROM waiters WHERE username = ? AND active = 1', [username], async (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row || !row.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, row.passwordHash);
        if (match) {
            res.json({ success: true, user: { id: row.id, name: row.name, role: row.role, username: row.username } });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.get('/api/sync/master', async (req, res) => {
    try {
        const products = await getQuery("SELECT * FROM products");
        const tables = await getQuery("SELECT * FROM tables");
        const waiters = await getQuery("SELECT * FROM waiters");
        
        products.forEach(p => { p.active = !!p.active; p.available = !!p.available; });
        waiters.forEach(w => { w.active = !!w.active; delete w.passwordHash; }); // Do not send password hashes
        
        const cats = [...new Set(products.map(p => p.category))].map(c => ({ id: c, name: c, active: true }));

        res.json({ products, tables, waiters, categories: cats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/sync', async (req, res) => {
    const data = req.body;
    try {
        if (data.products) {
            await runQuery("DELETE FROM products");
            for (const p of data.products) {
                await runQuery("INSERT INTO products (id, name, category, price, active, available) VALUES (?, ?, ?, ?, ?, ?)",
                    [p.id, p.name, p.category, p.price, p.active ? 1 : 0, p.available ? 1 : 0]);
            }
        }
        if (data.waiters) {
            for (const w of data.waiters) {
                let pHash = w.passwordHash || null; // Preserve existing hash if password isn't updated
                if (w.password && w.password.trim() !== '') {
                    pHash = await bcrypt.hash(w.password, 10);
                }
                
                db.get("SELECT passwordHash FROM waiters WHERE id = ?", [w.id], (err, row) => {
                    if (row && !pHash) pHash = row.passwordHash;
                    
                    db.run('INSERT OR REPLACE INTO waiters (id, name, username, passwordHash, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [w.id, w.name, w.username || '', pHash, w.role || 'Waiter', w.active ? 1 : 0, w.createdAt]);
                });
            }
        }
        res.json({ success: true });
        broadcastMasterDataUpdate();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- WebSocket Architecture ---

const wss = new WebSocket.Server({ port: 3001 }, () => {
    console.log("WebSocket Server running on port 3001");
});

let wsClients = new Set();
wss.on('connection', (ws) => {
    wsClients.add(ws);
    
    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);
            
            if (msg.type === 'new_order') {
                const orderData = msg.data;
                // Duplicate Protection
                db.get('SELECT orderId FROM orders WHERE orderId = ?', [orderData.id], (err, row) => {
                    if (row) {
                        console.log(`Duplicate order ${orderData.id} rejected.`);
                        return; 
                    }
                    
                    db.run('INSERT INTO orders (orderId, waiterId, waiterName, tableId, tableName, items, subtotal, discount, total, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [orderData.id, orderData.waiterId || '', orderData.waiterName || '', orderData.tableNumber || '', orderData.customerName || '', JSON.stringify(orderData.items), orderData.totalAmount || 0, 0, orderData.totalAmount || 0, 'SENT', new Date().toISOString(), new Date().toISOString()]);
                    
                    orderData.status = 'SENT';
                    broadcastMessage('new_order_validated', orderData);
                });
            }
            
            if (msg.type === 'sync_request') {
                const products = await getQuery("SELECT * FROM products");
                const tables = await getQuery("SELECT * FROM tables");
                const cats = [...new Set(products.map(p => p.category))].map(c => ({ id: c, name: c, active: true }));
                
                ws.send(JSON.stringify({
                    type: 'sync_data',
                    products: products,
                    categories: cats,
                    tables: tables
                }));
            }
            
            if (msg.type === 'update_order_status') {
                const { orderId, status: newStatus } = msg;
                const validTransitions = {
                    'SENT': ['RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
                    'RECEIVED': ['ACCEPTED', 'REJECTED', 'CANCELLED'],
                    'ACCEPTED': ['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
                    'PREPARING': ['READY', 'CANCELLED'],
                    'READY': ['SERVED', 'CANCELLED'],
                    'SERVED': ['COMPLETED'],
                    'COMPLETED': [],
                    'REJECTED': [],
                    'CANCELLED': []
                };

                db.get('SELECT status FROM orders WHERE orderId = ?', [orderId], (err, row) => {
                    if (row) {
                        const currentStatus = row.status || 'SENT';
                        if (newStatus === 'ACCEPTED' || newStatus === 'REJECTED' || newStatus === 'CANCELLED' || (validTransitions[currentStatus] && validTransitions[currentStatus].includes(newStatus))) {
                            db.run('UPDATE orders SET status = ?, updatedAt = ? WHERE orderId = ?', [newStatus, new Date().toISOString(), orderId]);
                            broadcastMessage('order_status', { orderId: orderId, status: newStatus });
                        } else {
                            console.log(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
                        }
                    }
                });
            }
        } catch (e) {
            console.error("Error handling WebSocket message:", e);
        }
    });

    ws.on('close', () => wsClients.delete(ws));
});

function broadcastMessage(type, data) {
    const msg = JSON.stringify({ type, data });
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function broadcastMasterDataUpdate() {
    broadcastMessage('master_data_updated', {});
}

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`T7 BillPro Master Server running at http://localhost:${PORT}`);
});
