const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;
const SECRET_KEY = process.env.SECRET_KEY || 'your_secure_secret_key_12345';

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '0000',
  database: 'shabu',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDB() {
  let conn;
  try {
    // 데이터베이스 연결 (database 지정 없이)
    const tempConn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '0000'
    });
    
    // 데이터베이스 존재 여부 확인
    const [databases] = await tempConn.query('SHOW DATABASES LIKE "shabu"');
    if (databases.length === 0) {
      console.log('Creating database "shabu"');
      await tempConn.query('CREATE DATABASE shabu');
    } else {
      console.log('Database "shabu" already exists');
    }
    await tempConn.end();

    // 풀을 사용하여 테이블 확인 및 생성
    conn = await pool.getConnection();
    console.log('Connected to MySQL database "shabu"');

    // 테이블 존재 여부 확인
    const [tables] = await conn.query('SHOW TABLES LIKE "stores"');
    if (tables.length === 0) {
      console.log('Creating tables...');
      
      await conn.query(`
        CREATE TABLE stores (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL
        )
      `);
      
      await conn.query(`
        CREATE TABLE users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          userId VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          birthdate VARCHAR(8),
          phone VARCHAR(11),
          store_id INT,
          isAdmin BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (store_id) REFERENCES stores(id)
        )
      `);
      
      await conn.query(`
        CREATE TABLE schedules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          store_id INT NOT NULL,
          week_start DATE NOT NULL,
          monday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          monday_start TIME,
          monday_end TIME,
          tuesday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          tuesday_start TIME,
          tuesday_end TIME,
          wednesday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          wednesday_start TIME,
          wednesday_end TIME,
          thursday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          thursday_start TIME,
          thursday_end TIME,
          friday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          friday_start TIME,
          friday_end TIME,
          saturday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          saturday_start TIME,
          saturday_end TIME,
          sunday_type ENUM('full', 'part', 'off') DEFAULT 'off',
          sunday_start TIME,
          sunday_end TIME,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
        )
      `);
      
      await conn.query(`
        CREATE TABLE schedule_periods (
          id INT AUTO_INCREMENT PRIMARY KEY,
          store_id INT NOT NULL,
          week_start DATE NOT NULL,
          week_end DATE NOT NULL,
          is_open BOOLEAN DEFAULT FALSE,
          FOREIGN KEY (store_id) REFERENCES stores(id)
        )
      `);
      
      // 초기 데이터 삽입
      await conn.query(`
        INSERT IGNORE INTO stores (name) VALUES
        ('샤브올데이 이천점'),
        ('명륜진사갈비 역동점'),
        ('명륜진사갈비 탄벌점')
      `);
      
      const hashedPassword = await bcrypt.hash('admin1234', 10);
      await conn.query(`
        INSERT IGNORE INTO users (name, userId, password, birthdate, phone, store_id, isAdmin)
        VALUES ('관리자', 'admin', ?, '19800101', '01012345678', 1, TRUE)
      `, [hashedPassword]);
      
      console.log('Tables created and initial data inserted');
    } else {
      console.log('Tables already exist, skipping creation');
    }
    
    console.log('DB initialization completed');
  } catch (err) {
    console.error('DB initialization error:', err.message);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth middleware - Authorization header:', authHeader); // 디버깅 로그 강화
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth middleware - No token provided or invalid format');
    return res.status(401).json({ message: 'No token provided or invalid format' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Auth middleware - Token:', token);
  if (!token) {
    console.log('Auth middleware - Token is empty');
    return res.status(401).json({ message: 'Token is empty' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('Auth middleware - Decoded token:', decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ message: `Invalid token: ${err.message}` });
  }
};
const adminMiddleware = (req, res, next) => {
  console.log('Admin middleware - User:', req.user);
  if (!req.user.isAdmin) {
    console.log('Admin middleware - Not an admin');
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

app.get('/check-userid', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ message: 'User ID is required' });
  }
  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE userId = ?', [userId]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error('Check userId error:', err.message);
    res.status(500).json({ message: 'Failed to check userId', error: err.message });
  }
});

app.get('/stores', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM stores');
    res.json(rows);
  } catch (err) {
    console.error('Stores fetch error:', err.message);
    res.status(500).json({ message: 'Failed to fetch stores', error: err.message });
  }
});

app.get('/user-profile', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT name, isAdmin FROM users WHERE id = ?', [req.user.id]);
    console.log('User profile - Query result:', rows);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ name: rows[0].name, isAdmin: rows[0].isAdmin });
  } catch (err) {
    console.error('User profile error:', err.message);
    res.status(500).json({ message: 'Failed to fetch user profile', error: err.message });
  }
});

app.post('/signup', async (req, res) => {
  const { name, userId, birthdate, phone, password, store_id } = req.body;
  if (!name || !userId || !birthdate || !phone || !password || !store_id) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (!/^[a-zA-Z0-9]{4,20}$/.test(userId)) {
    return res.status(400).json({ message: 'User ID must be 4-20 characters, alphanumeric only' });
  }
  if (!/^\d{8}$/.test(birthdate)) {
    return res.status(400).json({ message: 'Birthdate must be 8 digits (YYYYMMDD)' });
  }
  if (!/^010\d{8}$/.test(phone)) {
    return res.status(400).json({ message: 'Phone must start with 010 and be 11 digits' });
  }
  try {
    const [storeCheck] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (storeCheck.length === 0) {
      return res.status(400).json({ message: 'Invalid store ID' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, userId, password, birthdate, phone, store_id) VALUES (?, ?, ?, ?, ?, ?)',
      [name, userId, hashedPassword, birthdate, phone, store_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Signup error:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'User ID already exists' });
    } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      res.status(400).json({ message: 'Invalid store ID' });
    } else {
      res.status(500).json({ message: 'Signup failed', error: err.message });
    }
  }
});

app.post('/login', async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ message: 'User ID and password are required' });
  }
  try {
    const [rows] = await pool.query('SELECT id, name, userId, password, isAdmin FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid password' });
    const token = jwt.sign({ id: user.id, name: user.name, isAdmin: user.isAdmin }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token, isAdmin: user.isAdmin });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

app.post('/admin/open-schedule', authMiddleware, adminMiddleware, async (req, res) => {
  const { store_id, week_start, week_end } = req.body;
  if (!store_id || !week_start || !week_end) {
    return res.status(400).json({ message: 'Store ID, week start, and week end are required' });
  }
  try {
    const [storeCheck] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (storeCheck.length === 0) {
      return res.status(400).json({ message: 'Invalid store ID' });
    }
    await pool.query('UPDATE schedule_periods SET is_open = FALSE WHERE store_id = ?', [store_id]);
    await pool.query(
      'INSERT INTO schedule_periods (store_id, week_start, week_end, is_open) VALUES (?, ?, ?, TRUE)',
      [store_id, week_start, week_end]
    );
    res.status(201).json({ message: 'Schedule period opened' });
  } catch (err) {
    console.error('Open schedule error:', err.message);
    res.status(500).json({ message: 'Failed to open schedule period', error: err.message });
  }
});

app.put('/admin/close-schedule/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('UPDATE schedule_periods SET is_open = FALSE WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Schedule period not found' });
    }
    res.json({ message: 'Schedule period closed' });
  } catch (err) {
    console.error('Close schedule error:', err.message);
    res.status(500).json({ message: 'Failed to close schedule period', error: err.message });
  }
});

app.get('/admin/schedule-periods', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT sp.id, sp.store_id, sp.week_start, sp.week_end, sp.is_open, COALESCE(s.name, 'Unknown Store') AS store_name
      FROM schedule_periods sp
      LEFT JOIN stores s ON sp.store_id = s.id
      ORDER BY sp.week_start DESC
    `);
    res.json(rows.map(row => ({
      id: row.id,
      store_id: row.store_id,
      store_name: row.store_name,
      week_start: row.week_start.toISOString().split('T')[0],
      week_end: row.week_end.toISOString().split('T')[0],
      is_open: row.is_open
    })));
  } catch (err) {
    console.error('Fetch schedule periods error:', err.message);
    res.status(500).json({ message: 'Failed to fetch schedule periods', error: err.message });
  }
});

app.get('/check-schedule-open', authMiddleware, async (req, res) => {
  try {
    console.log('Checking schedule open for user_id:', req.user.id); // 디버깅 로그
    const [rows] = await pool.query(`
      SELECT sp.week_start, sp.week_end, sp.store_id, COALESCE(s.name, 'Unknown Store') AS store_name
      FROM schedule_periods sp
      LEFT JOIN stores s ON sp.store_id = s.id
      WHERE sp.is_open = TRUE AND sp.store_id = (SELECT store_id FROM users WHERE id = ?)
      ORDER BY sp.week_start DESC LIMIT 1
    `, [req.user.id]);
    console.log('Open period result:', rows); // 디버깅 로그
    if (rows.length === 0) return res.json({ is_open: false });
    res.json({
      is_open: true,
      week_start: rows[0].week_start.toISOString().split('T')[0],
      week_end: rows[0].week_end.toISOString().split('T')[0],
      store_name: rows[0].store_name
    });
  } catch (err) {
    console.error('Check schedule open error:', err.message);
    res.status(500).json({ message: 'Failed to check schedule open', error: err.message });
  }
});

app.get('/user-store', authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  try {
    const [rows] = await pool.query(`
      SELECT s.id AS store_id, COALESCE(s.name, 'Unknown Store') AS store_name 
      FROM users u 
      LEFT JOIN stores s ON u.store_id = s.id 
      WHERE u.id = ?
    `, [user_id]);
    if (rows.length === 0 || !rows[0].store_id) return res.status(404).json({ message: 'Store not found for user' });
    res.json(rows[0]);
  } catch (err) {
    console.error('User store error:', err.message);
    res.status(500).json({ message: 'Failed to fetch user store', error: err.message });
  }
});

app.post('/schedule', authMiddleware, async (req, res) => {
  const { week_start, store_id, schedules } = req.body;
  const user_id = req.user.id;
  if (!week_start || !store_id || typeof schedules !== 'object') {
    return res.status(400).json({ message: 'Week start, store ID, and schedules object are required' });
  }
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    const daySchedule = schedules[day] || { type: 'off', start: null, end: null };
    if (!['full', 'part', 'off'].includes(daySchedule.type)) {
      return res.status(400).json({ message: `Invalid type for ${day}` });
    }
    if (daySchedule.type === 'part' && (!daySchedule.start || !daySchedule.end)) {
      return res.status(400).json({ message: `Start and end time required for part time on ${day}` });
    }
  }
  try {
    const [storeCheck] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (storeCheck.length === 0) {
      return res.status(400).json({ message: 'Invalid store ID' });
    }
    const [existingSchedule] = await pool.query('SELECT id FROM schedules WHERE user_id = ? AND week_start = ?', [user_id, week_start]);
    if (existingSchedule.length > 0) {
      return res.status(409).json({ message: 'Schedule already exists for this week' });
    }
    const query = `
      INSERT INTO schedules (user_id, store_id, week_start, monday_type, monday_start, monday_end, tuesday_type, tuesday_start, tuesday_end, 
      wednesday_type, wednesday_start, wednesday_end, thursday_type, thursday_start, thursday_end, friday_type, friday_start, friday_end, 
      saturday_type, saturday_start, saturday_end, sunday_type, sunday_start, sunday_end) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [user_id, store_id, week_start];
    days.forEach(day => {
      const daySchedule = schedules[day] || { type: 'off', start: null, end: null };
      values.push(daySchedule.type, daySchedule.start || null, daySchedule.end || null);
    });
    const [result] = await pool.query(query, values);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Schedule submission error:', err.message);
    res.status(500).json({ message: 'Schedule submission failed', error: err.message });
  }
});

app.get('/my-schedules', authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  try {
    const [rows] = await pool.query(`
      SELECT s.week_start, COALESCE(st.name, 'Unknown Store') AS store_name 
      FROM schedules s 
      LEFT JOIN stores st ON s.store_id = st.id 
      WHERE s.user_id = ?
      ORDER BY s.week_start DESC
    `, [user_id]);
    res.json(rows.map(row => ({
      week_start: row.week_start ? row.week_start.toISOString().split('T')[0] : null,
      store_name: row.store_name
    })));
  } catch (err) {
    console.error('My schedules error:', err.message);
    res.status(500).json({ message: 'Failed to fetch my schedules', error: err.message });
  }
});

app.get('/my-schedule-details', authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  const { week_start } = req.query;
  try {
    console.log('Fetching schedule details for user_id:', user_id, 'week_start:', week_start); // 디버깅 로그
    const [rows] = await pool.query(`
      SELECT s.*, COALESCE(st.name, 'Unknown Store') AS store_name 
      FROM schedules s 
      LEFT JOIN stores st ON s.store_id = st.id 
      WHERE s.user_id = ? AND s.week_start = ?
    `, [user_id, week_start]);
    console.log('Schedule details result:', rows); // 디버깅 로그
    res.json(rows[0] || {});
  } catch (err) {
    console.error('Schedule details error:', err.message);
    res.status(500).json({ message: 'Failed to fetch schedule details', error: err.message });
  }
});


app.get('/admin/employees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, userId, birthdate, phone, store_id, isAdmin FROM users');
    res.json(rows);
  } catch (err) {
    console.error('Employees error:', err.message);
    res.status(500).json({ message: 'Failed to fetch employees', error: err.message });
  }
});

app.put('/admin/employees/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, userId, birthdate, phone, store_id, isAdmin } = req.body;
  if (!name || !userId || !birthdate || !phone || !store_id) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  try {
    const [storeCheck] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (storeCheck.length === 0) {
      return res.status(400).json({ message: 'Invalid store ID' });
    }
    const [result] = await pool.query(
      'UPDATE users SET name = ?, userId = ?, birthdate = ?, phone = ?, store_id = ?, isAdmin = ? WHERE id = ?',
      [name, userId, birthdate, phone, store_id, isAdmin, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Employee updated' });
  } catch (err) {
    console.error('Employee update error:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'User ID already exists' });
    } else {
      res.status(500).json({ message: 'Update failed', error: err.message });
    }
  }
});

app.put('/admin/employees/:id/admin', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { isAdmin } = req.body;
  try {
    const [result] = await pool.query('UPDATE users SET isAdmin = ? WHERE id = ?', [isAdmin, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Admin status updated' });
  } catch (err) {
    console.error('Admin status update error:', err.message);
    res.status(500).json({ message: 'Failed to update admin status', error: err.message });
  }
});

app.delete('/admin/employees/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    console.error('Employee delete error:', err.message);
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
});

app.get('/admin/schedules', authMiddleware, adminMiddleware, async (req, res) => {
  const { week_start, store_id } = req.query;
  try {
    let query = `
      SELECT u.name, s.*, COALESCE(st.name, 'Unknown Store') AS store_name 
      FROM schedules s 
      JOIN users u ON s.user_id = u.id 
      LEFT JOIN stores st ON s.store_id = st.id 
      WHERE s.week_start = ?
    `;
    const params = [week_start];
    if (store_id) {
      query += ' AND s.store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Admin schedules error:', err.message);
    res.status(500).json({ message: 'Failed to fetch schedules', error: err.message });
  }
});

app.get('/admin/schedules/export', authMiddleware, adminMiddleware, async (req, res) => {
  const { week_start, store_id } = req.query;
  try {
    let query = `
      SELECT u.name, COALESCE(st.name, 'Unknown Store') AS store_name,
      CONCAT(s.monday_type, IF(s.monday_type = 'part', CONCAT(' (', s.monday_start, '-', s.monday_end, ')'), '')) AS monday,
      CONCAT(s.tuesday_type, IF(s.tuesday_type = 'part', CONCAT(' (', s.tuesday_start, '-', s.tuesday_end, ')'), '')) AS tuesday,
      CONCAT(s.wednesday_type, IF(s.wednesday_type = 'part', CONCAT(' (', s.wednesday_start, '-', s.wednesday_end, ')'), '')) AS wednesday,
      CONCAT(s.thursday_type, IF(s.thursday_type = 'part', CONCAT(' (', s.thursday_start, '-', s.thursday_end, ')'), '')) AS thursday,
      CONCAT(s.friday_type, IF(s.friday_type = 'part', CONCAT(' (', s.friday_start, '-', s.friday_end, ')'), '')) AS friday,
      CONCAT(s.saturday_type, IF(s.saturday_type = 'part', CONCAT(' (', s.saturday_start, '-', s.saturday_end, ')'), '')) AS saturday,
      CONCAT(s.sunday_type, IF(s.sunday_type = 'part', CONCAT(' (', s.sunday_start, '-', s.sunday_end, ')'), '')) AS sunday
      FROM schedules s 
      JOIN users u ON s.user_id = u.id 
      LEFT JOIN stores st ON s.store_id = st.id 
      WHERE s.week_start = ?
    `;
    const params = [week_start];
    if (store_id) {
      query += ' AND s.store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool.query(query, params);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, week_start.replace(/\//g, '-'));
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', `attachment; filename=${week_start.replace(/\//g, '-')}_schedules.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Export schedules error:', err.message);
    res.status(500).json({ message: 'Export failed', error: err.message });
  }
});

async function startServer() {
  try {
    await initDB();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();