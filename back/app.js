const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const app = express();
const PORT = 5001;
const SECRET_KEY = 'your_secret_key'; // 실제로는 환경 변수 사용

app.use(express.json());

// MySQL 연결 설정
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '0000', // 실제 비밀번호로 변경
  database: 'shabu', // 데이터베이스 생성 필요
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 테이블 생성 (초기화용, 실제로는 migration 도구 사용 권장)
async function initDB() {
  try {
    const conn = await pool.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        userId VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        birthdate VARCHAR(8),
        phone VARCHAR(11),
        isAdmin BOOLEAN DEFAULT FALSE
      )
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
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
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    conn.release();
    console.log('DB initialized');
  } catch (err) {
    console.error('DB init error:', err);
  }
}

initDB();

// 인증 미들웨어
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const adminMiddleware = (req, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin access required' });
  next();
};

// 회원가입
app.post('/signup', async (req, res) => {
  const{ name, userId, birthdate, phone, password } = req.body.attributes;
  try {
    console.log('들어옴');
    console.log(req.body.attributes);
    
    console.log(name, userId, birthdate, phone, password );
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.query(
      'INSERT INTO users (name, userId, password, birthdate, phone) VALUES (?, ?, ?, ?, ?)',
      [name, userId, hashedPassword, birthdate, phone]
    );
    console.log(result);
    
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ message: 'User ID already exists' });
    } else {
      res.status(500).json({ message: 'Signup failed', error: err.message });
    }
  }
});

// 로그인
app.post('/login', async (req, res) => {
  const { userId, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid password' });
    const token = jwt.sign({ id: user.id, isAdmin: user.isAdmin }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token, isAdmin: user.isAdmin });
  } catch (err) {
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// 스케줄 신청
app.post('/schedule', authMiddleware, async (req, res) => {
  const { week_start, schedules } = req.body; // front에서 { week_start, schedules: { monday: {type, start, end}, ... } } 형태 가정
  const user_id = req.user.id;
  try {
    const query = `
      INSERT INTO schedules (user_id, week_start, monday_type, monday_start, monday_end, tuesday_type, tuesday_start, tuesday_end, 
      wednesday_type, wednesday_start, wednesday_end, thursday_type, thursday_start, thursday_end, friday_type, friday_start, friday_end, 
      saturday_type, saturday_start, saturday_end, sunday_type, sunday_start, sunday_end) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [user_id, week_start];
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
      const daySchedule = schedules[day] || { type: 'off', start: null, end: null };
      values.push(daySchedule.type, daySchedule.start || null, daySchedule.end || null);
    });
    const [result] = await pool.query(query, values);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Schedule submission failed', error: err.message });
  }
});

// 내 스케줄 확인
app.get('/my-schedules', authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  try {
    const [rows] = await pool.query('SELECT week_start FROM schedules WHERE user_id = ? ORDER BY week_start DESC', [user_id]);
    res.json(rows.map(row => row.week_start)); // MySchedules에서 기간 리스트로 사용
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch my schedules', error: err.message });
  }
});

// 내 스케줄 상세
app.get('/my-schedule-details', authMiddleware, async (req, res) => {
  const user_id = req.user.id;
  const { week_start } = req.query;
  try {
    const [rows] = await pool.query('SELECT * FROM schedules WHERE user_id = ? AND week_start = ?', [user_id, week_start]);
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch schedule details', error: err.message });
  }
});

// 관리자: 직원 목록
app.get('/admin/employees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name, userId, birthdate, phone FROM users');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch employees', error: err.message });
  }
});

// 관리자: 직원 수정
app.put('/admin/employees/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, userId, birthdate, phone } = req.body;
  try {
    await pool.query('UPDATE users SET name = ?, userId = ?, birthdate = ?, phone = ? WHERE id = ?', [name, userId, birthdate, phone, id]);
    res.json({ message: 'Employee updated' });
  } catch (err) {
    res.status(500).json({ message: 'Update failed', error: err.message });
  }
});

// 관리자: 직원 삭제
app.delete('/admin/employees/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Employee deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
});

// 관리자: 스케줄 확인
app.get('/admin/schedules', authMiddleware, adminMiddleware, async (req, res) => {
  const { week_start } = req.query;
  try {
    const [rows] = await pool.query(`
      SELECT u.name, s.* FROM schedules s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.week_start = ?
    `, [week_start]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch schedules', error: err.message });
  }
});

// 관리자: 스케줄 엑셀 다운로드
app.get('/admin/schedules/export', authMiddleware, adminMiddleware, async (req, res) => {
  const { week_start } = req.query;
  try {
    const [rows] = await pool.query(`
      SELECT u.name, 
      CONCAT(s.monday_type, IF(s.monday_type = 'part', CONCAT(' (', s.monday_start, '-', s.monday_end, ')'), '')) AS monday,
      CONCAT(s.tuesday_type, IF(s.tuesday_type = 'part', CONCAT(' (', s.tuesday_start, '-', s.tuesday_end, ')'), '')) AS tuesday,
      CONCAT(s.wednesday_type, IF(s.wednesday_type = 'part', CONCAT(' (', s.wednesday_start, '-', s.wednesday_end, ')'), '')) AS wednesday,
      CONCAT(s.thursday_type, IF(s.thursday_type = 'part', CONCAT(' (', s.thursday_start, '-', s.thursday_end, ')'), '')) AS thursday,
      CONCAT(s.friday_type, IF(s.friday_type = 'part', CONCAT(' (', s.friday_start, '-', s.friday_end, ')'), '')) AS friday,
      CONCAT(s.saturday_type, IF(s.saturday_type = 'part', CONCAT(' (', s.saturday_start, '-', s.saturday_end, ')'), '')) AS saturday,
      CONCAT(s.sunday_type, IF(s.sunday_type = 'part', CONCAT(' (', s.sunday_start, '-', s.sunday_end, ')'), '')) AS sunday
      FROM schedules s 
      JOIN users u ON s.user_id = u.id 
      WHERE s.week_start = ?
    `, [week_start]);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, week_start.replace(/\//g, '-'));
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', `attachment; filename=${week_start.replace(/\//g, '-')}_schedules.xlsx`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Export failed', error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));