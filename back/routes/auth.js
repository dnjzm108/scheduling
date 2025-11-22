// server/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const { storeAdmin, globalAdmin } = require('../middleware/levelMiddleware');

const SECRET_KEY = process.env.JWT_SECRET || 'your_jwt_secret';
const pool = (req) => req.app.get('db');

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 입력하세요.' });
    }

    const [rows] = await pool(req).query(
      'SELECT * FROM users WHERE userId = ? LIMIT 1',
      [userId]
    );
    if (!rows[0]) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    const user = rows[0];

    // 퇴사/비활성
    const today = new Date();
    const resignDate = user.resign_date ? new Date(user.resign_date) : null;

    if (user.is_active === 0 || (resignDate && resignDate <= today)) {
      return res.status(403).json({ message: '이미 퇴사 처리된 계정입니다.' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }

    // 🔥🔥🔥 여기 추가해야 로그인 완료됨 🔥🔥🔥

    const token = jwt.sign(
      {
        id: user.id,
        level: user.level,
        store_id: user.store_id,
        admin_role: user.admin_role,
        name: user.name
      },
      SECRET_KEY,
      { expiresIn: '7d' }
    );

    return res.json({
      message: '로그인 성공',
      token,
      user: {
        id: user.id,
        name: user.name,
        level: user.level,
        store_id: user.store_id,
        admin_role: user.admin_role
      }
    });

    // -----------------------------------------------------

  } catch (err) {
    console.error('LOGIN ERROR:', err);
    return res.status(500).json({ message: '서버 오류' });
  }
});




// 회원가입
router.post('/signup', async (req, res) => {
  try {
    const {
      name, userId, password, resident_id, phone,
      store_id, bank_name, bank_account, account_holder, tax_type,
      consent_records
    } = req.body;

    // 필수 검증
    if (!name || !userId || !password || !resident_id || !phone || !store_id) {
      return res.status(400).json({ message: '모든 필수 항목을 입력하세요.' });
    }
    if (!consent_records?.privacy) {
      return res.status(400).json({ message: '개인정보 수집 동의 필요' });
    }

    // 중복 체크
    const [dup] = await pool(req).query(
      'SELECT id FROM users WHERE userId = ? OR phone = ?',
      [userId, phone]
    );
    if (dup.length > 0) {
      return res.status(409).json({ message: '이미 사용 중인 아이디 또는 전화번호' });
    }

    // 존재 매장 체크
    const [store] = await pool(req).query(
      'SELECT id FROM stores WHERE id = ?',
      [store_id]
    );
    if (!store[0]) {
      return res.status(400).json({ message: '존재하지 않는 매장입니다.' });
    }

    const hashedPw = await bcrypt.hash(password, 10);

    await pool(req).query(
      `
      INSERT INTO users 
      (name, userId, password, resident_id, phone, store_id,
       bank_name, bank_account, account_holder, tax_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name, userId, hashedPw, resident_id, phone, store_id,
        bank_name, bank_account, account_holder, tax_type
      ]
    );

    res.status(201).json({ message: '회원가입 완료! 관리자 승인 후 로그인 가능' });

  } catch (err) {
    console.error('SIGNUP ERROR:', err);

    // 서버가 절대 죽지 않도록 처리
    if (!res.headersSent) {
      res.status(500).json({ message: '서버 내부 오류가 발생했습니다.' });
    }
  }
});

// 아이디 중복 체크
router.get('/check-userid', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ exists: false });

  try {
    const [rows] = await pool(req).query('SELECT 1 FROM users WHERE userId = ?', [userId]);
    res.json({ exists: rows.length > 0 });
  } catch (err) {
    res.status(500).json({ exists: false });
  }
});

// server/routes/auth.js (맨 아래 부분만)
router.get('/user-store', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT u.store_id, s.name AS store_name 
       FROM users u 
       LEFT JOIN stores s ON u.store_id = s.id 
       WHERE u.id = ?`,
      [req.user.id]
    );

    const row = rows[0] || {};
    res.json({
      store_id: row.store_id || null,
      store_name: row.store_name || '매장 없음'
    });
  } catch (err) {
    console.error('[/user-store] Error:', err);
    res.status(500).json({ message: '매장 정보 조회 실패' });
  }
});



module.exports = router;