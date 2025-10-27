const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');
const path = require('path');
const sanitize = require('sanitize-filename');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;
const SECRET_KEY = process.env.JWT_SECRET || 'your_jwt_secret';

// 환경 변수 확인
if (!process.env.DB_DATABASE) {
  console.error('DB_DATABASE environment variable is not set');
  process.exit(1);
}

// 미들웨어 설정
app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

// 요청 속도 제한 미들웨어
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100,
  message: 'Too many requests from this IP'
});
app.use('/api', limiter);

// Multer 설정: 이미지 파일 업로드 처리
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'Uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const sanitizedFileName = sanitize(file.originalname);
    cb(null, `${Date.now()}-${sanitizedFileName}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 업로드 가능합니다.'));
    }
    cb(null, true);
  }
});

// 데이터베이스 생성 및 연결 풀 설정
async function createDatabaseAndPool() {
  let conn;
  try {
    const rootPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

    conn = await rootPool.getConnection();
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_DATABASE}`);
    console.log(`Database ${process.env.DB_DATABASE} ensured`);

    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    const testConn = await pool.getConnection();
    await testConn.query(`USE ${process.env.DB_DATABASE}`);
    console.log(`Selected database ${process.env.DB_DATABASE}`);
    testConn.release();

    return pool;
  } catch (err) {
    console.error('Database creation error:', {
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
      stack: err.stack
    });
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

// 인증 미들웨어: JWT 토큰 검증
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log('Auth middleware - Authorization header:', authHeader);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided or invalid format' });
  }
  const token = authHeader.split(' ')[1];
  console.log('Auth middleware - Token:', token);
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('Auth middleware - Decoded:', decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ message: `Invalid token: ${err.message}` });
  }
};

// 관리자 미들웨어: 관리자 권한 확인
const adminMiddleware = async (req, res, next) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.user.id]);
    console.log('Admin middleware - User check:', rows);
    if (rows.length === 0 || !rows[0].isAdmin) {
      return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
    }
    next();
  } catch (err) {
    console.error('Admin middleware error:', err.message);
    return res.status(500).json({ message: '관리자 권한 확인 실패', error: err.message });
  }
};

// 사용자 정보 조회: 로그인한 사용자의 정보 반환
app.get('/user', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query('SELECT id, name, userId, isAdmin FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('사용자 조회 오류:', err.message);
    res.status(500).json({ message: '사용자 조회 실패', error: err.message });
  }
});

// 매장 목록 조회: 모든 매장 정보 반환 (인증 필요)
app.get('/stores', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query(`
      SELECT s.id, s.name, s.address, s.manager_id, u.name as manager_name
      FROM stores s
      LEFT JOIN users u ON s.manager_id = u.id
    `);
    console.log('Stores fetched:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Fetch stores error:', err.message);
    res.status(500).json({ message: '매장 목록 조회 실패', error: err.message });
  }
});

// 사용자 목록 조회: 매니저 선택용 관리자 목록 반환 (관리자 전용)
app.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const { store_id } = req.query;
    let query = 'SELECT id, name FROM users WHERE isAdmin = TRUE OR role IN ("store_admin", "global_admin")';
    const params = [];
    if (store_id) {
      query += ' AND store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool.query(query, params);
    console.log('Users fetched:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Fetch users error:', err.message);
    res.status(500).json({ message: '사용자 목록 조회 실패', error: err.message });
  }
});

// 사용자 정보 조회 (store_id, store_name 포함)
app.get('/user', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.userId, u.isAdmin, u.store_id, s.name AS store_name
      FROM users u
      LEFT JOIN stores s ON u.store_id = s.id
      WHERE u.id = ?
    `, [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('User fetch error:', err.message);
    res.status(500).json({ message: '사용자 조회 실패', error: err.message });
  }
});

// 건의사항 생성 (기존 코드 활용, 중복 피함)
app.post('/requests', authMiddleware, upload.array('attachments', 3), async (req, res) => {
  const pool = app.get('db');
  const { title, body, store_id } = req.body;
  const attachments = req.files ? req.files.map(f => `/Uploads/${f.filename}`) : [];
  try {
    const [result] = await pool.query(
      'INSERT INTO requests (user_id, store_id, title, body, attachments) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, store_id || null, title, body, JSON.stringify(attachments)]
    );
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['create_request', req.user.id, 'request', result.insertId, JSON.stringify({ title })]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Create request error:', err.message);
    res.status(500).json({ message: '건의사항 생성 실패', error: err.message });
  }
});

// 건의사항 조회 (매장 필터링, 직원/관리자 구분)
app.get('/requests', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { store_id } = req.query;
  try {
    const [user] = await pool.query('SELECT store_id, isAdmin FROM users WHERE id = ?', [req.user.id]);
    if (user.length === 0) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    const isAdmin = user[0].isAdmin;
    const userStoreId = user[0].store_id;

    let query = `
      SELECT r.*, u.name AS user_name, s.name AS store_name
      FROM requests r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN stores s ON r.store_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      query += ' AND (r.store_id IS NULL OR r.store_id = ?)';
      params.push(userStoreId);
    } else if (store_id) {
      query += ' AND (r.store_id IS NULL OR r.store_id = ?)';
      params.push(store_id);
    }

    query += ' ORDER BY r.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Fetch requests error:', err.message);
    res.status(500).json({ message: '건의사항 조회 실패', error: err.message });
  }
});

// 건의사항 삭제 (관리자 전용)
app.delete('/requests/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM requests WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: '건의사항을 찾을 수 없습니다.' });
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['delete_request', req.user.id, 'request', id, JSON.stringify({ requestId: id })]);
    res.json({ message: '건의사항 삭제 성공' });
  } catch (err) {
    console.error('Delete request error:', err.message);
    res.status(500).json({ message: '건의사항 삭제 실패', error: err.message });
  }
});

// 매장 생성: 새 매장 추가 (관리자 전용)
app.post('/stores', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { name, address, manager_id } = req.body;
  try {
    const [result] = await pool.query(
      'INSERT INTO stores (name, address, manager_id) VALUES (?, ?, ?)',
      [name, address || null, manager_id || null]
    );
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['create_store', req.user.id, 'store', result.insertId, JSON.stringify({ name })]
    );
    console.log('Store created with ID:', result.insertId);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Create store error:', err.message);
    res.status(500).json({ message: '매장 생성 실패', error: err.message });
  }
});

// 매장 수정: 기존 매장 정보 업데이트 (관리자 전용)
app.put('/stores/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  const { name, address, manager_id } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE stores SET name = ?, address = ?, manager_id = ? WHERE id = ?',
      [name, address || null, manager_id || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '매장을 찾을 수 없습니다.' });
    }
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['update_store', req.user.id, 'store', id, JSON.stringify({ name })]
    );
    res.json({ message: '매장 수정 성공' });
  } catch (err) {
    console.error('Update store error:', err.message);
    res.status(500).json({ message: '매장 수정 실패', error: err.message });
  }
});

// 매장 삭제: 매장 제거 (관리자 전용)
app.delete('/stores/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM stores WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '매장을 찾을 수 없습니다.' });
    }
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['delete_store', req.user.id, 'store', id, JSON.stringify({ storeId: id })]
    );
    res.json({ message: '매장 삭제 성공' });
  } catch (err) {
    console.error('Delete store error:', err.message);
    res.status(500).json({ message: '매장 삭제 실패', error: err.message });
  }
});

// 스케줄 목록 조회: 관리자가 모든 스케줄 확인 (관리자 전용)
app.get('/schedules', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query(`
      SELECT s.id, s.store_id, s.week_start, s.week_end, s.status, st.name AS store_name
      FROM schedules s
      JOIN stores st ON s.store_id = st.id
      ORDER BY s.week_start DESC
    `);
    console.log('스케줄 조회 결과:', rows);
    res.json(rows);
  } catch (err) {
    console.error('스케줄 조회 오류:', err.message);
    res.status(500).json({ message: '스케줄 조회 실패', error: err.message });
  }
});

// 신규 스케줄 오픈: 새 스케줄 생성 (관리자 전용)
app.post('/schedule', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { store_id, week_start } = req.body;
  if (!store_id || !week_start) {
    return res.status(400).json({ message: '매장 ID와 시작 날짜는 필수입니다.' });
  }
  try {
    const startDate = new Date(week_start);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const [existing] = await pool.query(
      'SELECT id FROM schedules WHERE store_id = ? AND week_start = ?',
      [store_id, week_start]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: '해당 주에 이미 스케줄이 존재합니다.' });
    }

    const [result] = await pool.query(
      'INSERT INTO schedules (store_id, week_start, week_end, status) VALUES (?, ?, ?, ?)',
      [store_id, week_start, endDate.toISOString().split('T')[0], 'open']
    );
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['create_schedule', req.user.id, 'schedule', result.insertId, JSON.stringify({ store_id, week_start })]
    );
    res.status(201).json({ message: '스케줄 오픈 성공', id: result.insertId });
  } catch (err) {
    console.error('스케줄 오픈 오류:', err.message);
    res.status(500).json({ message: '스케줄 오픈 실패', error: err.message });
  }
});

// 자동 스케줄링: 스케줄에 직원 자동 배정 (관리자 전용)
app.post('/auto-schedule', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { schedule_id } = req.body;
  if (!schedule_id) {
    return res.status(400).json({ message: '스케줄 ID가 필요합니다.' });
  }
  try {
    const [schedule] = await pool.query(
      'SELECT store_id, week_start, week_end FROM schedules WHERE id = ?',
      [schedule_id]
    );
    if (schedule.length === 0) {
      return res.status(404).json({ message: '스케줄을 찾을 수 없습니다.' });
    }

    const { store_id, week_start, week_end } = schedule[0];
    const [employees] = await pool.query(
      'SELECT id FROM users WHERE store_id = ? AND isAdmin = 0',
      [store_id]
    );
    if (employees.length === 0) {
      return res.status(400).json({ message: '해당 매장에 직원이 없습니다.' });
    }

    const assignments = [];
    const startDate = new Date(week_start);
    const endDate = new Date(week_end);
    const days = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d).toISOString().split('T')[0]);
    }

    employees.forEach(emp => {
      days.forEach(day => {
        assignments.push({
          schedule_id,
          user_id: emp.id,
          date: day,
          status: 'assigned',
        });
      });
    });

    for (const assignment of assignments) {
      await pool.query(
        'INSERT INTO schedule_assignments (schedule_id, user_id, date, status) VALUES (?, ?, ?, ?)',
        [assignment.schedule_id, assignment.user_id, assignment.date, assignment.status]
      );
    }

    await pool.query('UPDATE schedules SET status = ? WHERE id = ?', ['assigned', schedule_id]);
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['auto_schedule', req.user.id, 'schedule', schedule_id, JSON.stringify({ schedule_id, store_id })]
    );
    res.json({ message: '자동 스케줄링 완료', assigned_users: employees.map(e => e.id) });
  } catch (err) {
    console.error('자동 스케줄링 오류:', err.message);
    res.status(500).json({ message: '자동 스케줄링 실패', error: err.message });
  }
});

// 스케줄 오픈 여부 확인: 사용자의 매장에 오픈된 스케줄 확인
app.get('/check-schedule-open', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query(`
      SELECT s.id, s.week_start
      FROM schedules s
      WHERE s.status = 'open' AND s.store_id = (SELECT store_id FROM users WHERE id = ?)
      ORDER BY s.week_start DESC LIMIT 1
    `, [req.user.id]);
    if (rows.length === 0) {
      return res.json({ is_open: false });
    }
    res.json({
      is_open: true,
      week_start: rows[0].week_start.toISOString().split('T')[0],
      week_end: new Date(rows[0].week_start.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
  } catch (err) {
    console.error('Check schedule open error:', err.message);
    res.status(500).json({ message: 'Failed to check schedule open', error: err.message });
  }
});

// 내 스케줄 조회: 사용자의 스케줄 목록 반환
app.get('/my-schedules', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT s.week_start, s.store_id, st.name AS store_name
      FROM schedule_assignments sa
      JOIN schedules s ON sa.schedule_id = s.id
      JOIN stores st ON s.store_id = st.id
      WHERE sa.user_id = ?
      ORDER BY s.week_start DESC
    `, [req.user.id]);
    res.json(rows.map(row => ({
      week_start: row.week_start.toISOString().split('T')[0],
      store_name: row.store_name
    })));
  } catch (err) {
    console.error('My schedules error:', err.message);
    res.status(500).json({ message: 'Failed to fetch schedules', error: err.message });
  }
});

// 내 스케줄 상세 조회: 특정 주의 스케줄 상세 정보 반환
app.get('/my-schedule-details', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ message: 'Week start is required' });
  try {
    const [rows] = await pool.query(`
      SELECT sa.*, s.store_id, st.name AS store_name
      FROM schedule_assignments sa
      JOIN schedules s ON sa.schedule_id = s.id
      JOIN stores st ON s.store_id = st.id
      WHERE sa.user_id = ? AND s.week_start = ?
      LIMIT 1
    `, [req.user.id, week_start]);
    if (rows.length === 0) return res.status(404).json({ message: 'No schedule found' });
    res.json({
      store_name: rows[0].store_name,
      status: rows[0].status
    });
  } catch (err) {
    console.error('Schedule details error:', err.message);
    res.status(500).json({ message: 'Failed to fetch schedule details', error: err.message });
  }
});

// 회원가입: 새 사용자 등록
const userSchema = Joi.object({
  name: Joi.string().pattern(/^[가-힣a-zA-Z]{2,20}$/).required(),
  userId: Joi.string().pattern(/^[a-zA-Z0-9]{4,20}$/).required(),
  birthdate: Joi.string().length(8).pattern(/^\d{8}$/).required(),
  phone: Joi.string().pattern(/^010\d{8}$/).required(),
  password: Joi.string().min(6).required(),
  store_id: Joi.number().integer().required(),
  consent_records: Joi.object({
    privacy: Joi.boolean().required(),
    marketing: Joi.boolean().required()
  }).required()
});

app.post('/signup', async (req, res) => {
  const pool = app.get('db');
  const { error } = userSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const { name, userId, birthdate, phone, password, store_id, consent_records } = req.body;
  try {
    const [storeCheck] = await pool.query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (storeCheck.length === 0) return res.status(400).json({ message: 'Invalid store ID' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, userId, password, birthdate, phone, store_id, consent_records) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, userId, hashedPassword, birthdate, phone, store_id, JSON.stringify(consent_records)]
    );
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['create_user', result.insertId, 'user', result.insertId, JSON.stringify({ userId })]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Signup error:', err.message);
    if (err.code === 'ER_DUP_ENTRY') res.status(409).json({ message: 'User ID or phone already exists' });
    else res.status(500).json({ message: 'Signup failed', error: err.message });
  }
});

// 로그인: 사용자 인증 및 JWT 토큰 발급
app.post('/login', async (req, res) => {
  const pool = app.get('db');
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ message: 'User ID and password required' });
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, name: user.name, isAdmin: user.isAdmin, role: user.role },
      SECRET_KEY,
      { expiresIn: '1d' }
    );
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['login', user.id, 'user', user.id, JSON.stringify({ userId })]);
    res.json({ token, isAdmin: user.isAdmin });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
});

// 사용자 ID 중복 확인
app.get('/check-userid', async (req, res) => {
  const pool = app.get('db');
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

// 직원 목록 조회: 매장별 직원 목록 반환 (관리자 전용)
app.get('/users/employees', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const { store_id } = req.query;
    let query = `
      SELECT id, name, userId, birthdate, phone, store_id, isAdmin, role, signup_date
      FROM users
      WHERE 1=1
    `;
    const params = [];
    if (store_id) {
      query += ' AND store_id = ?';
      params.push(store_id);
    }
    query += ' ORDER BY signup_date DESC';
    const [rows] = await pool.query(query, params);
    console.log('Fetched employees:', rows.length);
    res.json(rows);
  } catch (err) {
    console.error('Employees fetch error:', err.message);
    res.status(500).json({ message: 'Failed to fetch employees', error: err.message });
  }
});

// 직원 삭제: 사용자 제거 (관리자 전용)
app.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['delete_user', req.user.id, 'user', id, JSON.stringify({ userId: id })]);
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    console.error('Delete employee error:', err.message);
    res.status(500).json({ message: 'Failed to delete employee', error: err.message });
  }
});

// 직원 정보 수정: 사용자 정보 업데이트 (관리자 전용)
app.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  const { name, birthdate, phone, store_id } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE users SET name = ?, birthdate = ?, phone = ?, store_id = ? WHERE id = ?',
      [name, birthdate, phone, store_id, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['update_user', req.user.id, 'user', id, JSON.stringify({ name, birthdate, phone, store_id })]);
    res.json({ message: 'Employee updated successfully' });
  } catch (err) {
    console.error('Update employee error:', err.message);
    res.status(500).json({ message: 'Failed to update employee', error: err.message });
  }
});

// 비밀번호 변경: 사용자 비밀번호 업데이트 (관리자 전용)
app.put('/users/:id/password', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ message: 'Password is required' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['update_password', req.user.id, 'user', id, JSON.stringify({ id })]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Update password error:', err.message);
    res.status(500).json({ message: 'Failed to update password', error: err.message });
  }
});

// 관리자 권한 변경: 사용자 관리자 상태 업데이트 (관리자 전용)
app.put('/users/:id/admin', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  const { isAdmin } = req.body;
  try {
    const [result] = await pool.query('UPDATE users SET isAdmin = ? WHERE id = ?', [isAdmin, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['update_admin', req.user.id, 'user', id, JSON.stringify({ isAdmin })]);
    res.json({ message: 'Admin status updated successfully' });
  } catch (err) {
    console.error('Update admin status error:', err.message);
    res.status(500).json({ message: 'Failed to update admin status', error: err.message });
  }
});

// 공지사항 조회: 매장별 공지사항 목록 반환
app.get('/notices', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { store_id } = req.query;
  try {
    const [user] = await pool.query('SELECT store_id, isAdmin FROM users WHERE id = ?', [req.user.id]);
    if (user.length === 0) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    const isAdmin = user[0].isAdmin;
    const userStoreId = user[0].store_id;

    let query = `
      SELECT n.*, u.name AS author_name
      FROM notices n
      JOIN users u ON n.author_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      query += ' AND (n.store_id IS NULL OR n.store_id = ?)';
      params.push(userStoreId);
    } else if (store_id) {
      query += ' AND (n.store_id IS NULL OR n.store_id = ?)';
      params.push(store_id);
    }

    query += ' ORDER BY n.published_at DESC';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Fetch notices error:', err.message);
    res.status(500).json({ message: '공지사항 조회 실패', error: err.message });
  }
});

// 공지사항 생성: 새 공지사항 추가 (관리자 전용)
app.post('/notices', authMiddleware, adminMiddleware, upload.array('attachments', 3), async (req, res) => {
  const pool = app.get('db');
  const { title, body, store_id, visibility } = req.body;
  const attachments = req.files ? req.files.map(f => `/Uploads/${f.filename}`) : [];

  console.log('Received notice data:', { title, body, store_id, visibility, attachments });

  try {
    const [result] = await pool.query(
      'INSERT INTO notices (title, body, store_id, attachments, author_id, visibility) VALUES (?, ?, ?, ?, ?, ?)',
      [title, body, store_id || null, JSON.stringify(attachments), req.user.id, visibility || 'all']
    );
    await pool.query(
      'INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['create_notice', req.user.id, 'notice', result.insertId, JSON.stringify({ title, visibility })]
    );
    console.log('Notice created with ID:', result.insertId);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Create notice error:', {
      message: err.message,
      sqlMessage: err.sqlMessage,
      stack: err.stack
    });
    res.status(500).json({ message: '공지사항 생성 실패', error: err.message });
  }
});

// 공지사항 수정: 기존 공지사항 업데이트 (관리자 전용)
app.put('/notices/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  const { title, body, store_id, visibility } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE notices SET title = ?, body = ?, store_id = ?, visibility = ? WHERE id = ? AND author_id = ?',
      [title, body, store_id || null, visibility, id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: '공지사항을 찾을 수 없습니다.' });
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['update_notice', req.user.id, 'notice', id, JSON.stringify({ title, visibility })]);
    res.json({ message: '공지사항 수정 성공' });
  } catch (err) {
    console.error('Update notice error:', err.message);
    res.status(500).json({ message: '공지사항 수정 실패', error: err.message });
  }
});

// 공지사항 삭제: 공지사항 제거 (관리자 전용)
app.delete('/notices/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const pool = app.get('db');
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM notices WHERE id = ? AND author_id = ?', [id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: '공지사항을 찾을 수 없습니다.' });
    await pool.query('INSERT INTO audit_logs (action, actor_id, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)',
      ['delete_notice', req.user.id, 'notice', id, JSON.stringify({ noticeId: id })]);
    res.json({ message: '공지사항 삭제 성공' });
  } catch (err) {
    console.error('Delete notice error:', err.message);
    res.status(500).json({ message: '공지사항 삭제 실패', error: err.message });
  }
});

// 사용자 매장 정보 조회: 로그인한 사용자의 매장 정보 반환
app.get('/user-store', authMiddleware, async (req, res) => {
  const pool = app.get('db');
  try {
    const [rows] = await pool.query(`
      SELECT u.store_id, s.name AS store_name
      FROM users u
      JOIN stores s ON u.store_id = s.id
      WHERE u.id = ?
    `, [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ message: '사용자 또는 매장 정보를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('User store fetch error:', err.message);
    res.status(500).json({ message: '매장 정보 조회 실패', error: err.message });
  }
});




// 서버 시작
async function startServer() {
  try {
    const pool = await createDatabaseAndPool();
    const initDB = require('./initDB');
    await initDB(pool);
    app.set('db', pool);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();