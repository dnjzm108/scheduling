// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your_jwt_secret';
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const pool = (req) => req.app.get('db');

// 로그인
router.post('/login', async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });

  try {
    const [rows] = await pool(req).query('SELECT * FROM users WHERE userId = ?', [userId]);
    if (rows.length === 0) return res.status(401).json({ message: '존재하지 않는 아이디입니다.' });

    const user = rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ message: '비밀번호가 틀립니다.' });

    let approved = user.approved;
    if (approved === undefined) {
      approved = 1;
      await pool(req).query('UPDATE users SET approved=1 WHERE id=?', [user.id]);
    }
    if (!approved) return res.status(401).json({ message: '관리자 승인을 기다려주세요.' });

    const token = jwt.sign({ id: user.id, name: user.name, isAdmin: user.isAdmin }, SECRET_KEY, { expiresIn: '1d' });
    res.json({ token, isAdmin: user.isAdmin });
  } catch (err) {
    console.error('LOGIN ERROR:', err.message);
    res.status(500).json({ message: '로그인 서버 오류입니다.' });
  }
});

// 회원가입
router.post('/signup', async (req, res) => {
  const { name, userId, password, birthdate, phone, store_id, consent_records } = req.body;
  if (!name || !userId || !password || !birthdate || !phone || !store_id) {
    return res.status(400).json({ message: '모든 필수 항목을 입력하세요.' });
  }
  if (!consent_records?.privacy) {
    return res.status(400).json({ message: '개인정보 수집 동의가 필요합니다.' });
  }
  try {
    const [dup] = await pool(req).query('SELECT id FROM users WHERE userId = ? OR phone = ?', [userId, phone]);
    if (dup.length > 0) {
      return res.status(409).json({ message: '이미 사용 중인 아이디 또는 전화번호입니다.' });
    }
    const [store] = await pool(req).query('SELECT id FROM stores WHERE id = ?', [store_id]);
    if (store.length === 0) {
      return res.status(400).json({ message: '존재하지 않는 매장입니다.' });
    }
    const hashed = await bcrypt.hash(password, 10);
    await pool(req).query(
      `INSERT INTO users (name, userId, password, birthdate, phone, store_id, consent_records, approved, isAdmin, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'user')`,
      [name, userId, hashed, birthdate, phone, store_id, JSON.stringify(consent_records)]
    );
    res.status(201).json({ message: '회원가입 성공! 관리자 승인 후 로그인 가능합니다.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: '서버 오류가 발생했습니다.' });
  }
});



// userId 중복 체크
router.get('/check-userid', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ exists: false, message: 'userId 파라미터 필요' });
  }

  try {
    const [rows] = await pool(req).query('SELECT id FROM users WHERE userId = ?', [userId]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error('[/check-userid] Error:', err.message);
    res.status(500).json({ exists: false, message: '서버 오류' });
  }
});

// --- 8. 사용자 매장 정보 조회 (fetchUserStore와 완벽 매칭) ---
router.get('/user-store', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT u.store_id, s.name AS store_name 
       FROM users u 
       LEFT JOIN stores s ON u.store_id = s.id 
       WHERE u.id = ?`,
      [req.user.id]
    );

    const result = rows[0] || { store_id: null, store_name: null };
    res.json({
      store_id: result.store_id,
      store_name: result.store_name || '매장 정보 없음'
    });
  } catch (err) {
    console.error('[/user-store] Error:', err.message);
    res.status(500).json({ message: '매장 정보 조회 실패' });
  }
});

module.exports = router;