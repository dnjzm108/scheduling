// server/routes/user.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');
const { storeAdmin, globalAdmin, employee } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');
const SALT_ROUNDS = 10;

// 트랜잭션 헬퍼
const withTransaction = async (req, callback) => {
  const conn = await pool(req).getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// 감사 로그
const logAudit = async (conn, action, actorId, targetId, details) => {
  await conn.query(
    `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
     VALUES (?, ?, 'user', ?, ?, NOW())`,
    [action, actorId, targetId, JSON.stringify(details)]
  );
};

// 1. 내 정보
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT u.id, u.name, u.userId, u.level, u.store_id, s.name AS store_name
       FROM users u LEFT JOIN stores s ON u.store_id = s.id 
       WHERE u.id = ?`,
      [req.user.id]
    );
    res.json(rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '내 정보 조회 실패' });
  }
});

// 2. 직원 목록 (level 1)
router.get('/employees', authMiddleware, storeAdmin, async (req, res) => {
  const { store_id } = req.query;
  try {
    let sql = `SELECT id, name, userId, phone, store_id, level, signup_date , hire_date
               FROM users WHERE level = 1`;
    const params = [];
    if (store_id && store_id !== 'all') {
      sql += ' AND store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool(req).query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: '직원 목록 조회 실패' });
  }
});

// 3. 승인 대기 (level 0)
router.get('/pending-users', authMiddleware, storeAdmin, async (req, res) => {
  try {
    const [rows] = await pool(req).query(`
      SELECT 
        u.id, 
        u.name, 
        u.userId, 
        u.phone, 
        u.signup_date AS created_at,
        u.store_id,
        s.name AS store_name
      FROM users u
      LEFT JOIN stores s ON u.store_id = s.id
      WHERE u.level = 0
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('승인 대기 조회 실패:', err);
    res.status(500).json({ message: '승인 대기 조회 실패' });
  }
});
// 4. 관리자 목록 (level 2~3)
router.get('/admins', authMiddleware, globalAdmin, async (req, res) => {
  const { store_id } = req.query;
  try {
    let sql = `SELECT id, name, userId, phone, store_id, level, signup_date 
               FROM users WHERE level >= 2`;
    const params = [];
    if (store_id && store_id !== 'all') {
      sql += ' AND store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool(req).query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: '관리자 목록 조회 실패' });
  }
});

// 5. 승인 (level 0 → 1)
router.put('/:userId/approve', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, level FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자 없음' };
      if (user[0].level !== 0) throw { status: 400, msg: '이미 승인됨' };

      await conn.query(`UPDATE users SET level = 1 WHERE id = ?`, [userId]);
      await logAudit(conn, 'user_approve', req.user.id, userId, { name: user[0].name });

      return { user_id: parseInt(userId), name: user[0].name };
    });

    res.json({ message: '승인 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '승인 실패' });
  }
});

// 6. 거부 (삭제)
router.put('/:userId/reject', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, level FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자 없음' };
      if (user[0].level !== 0) throw { status: 400, msg: '승인된 사용자는 거부 불가' };

      await conn.query(`DELETE FROM users WHERE id = ?`, [userId]);
      await logAudit(conn, 'user_reject', req.user.id, userId, { name: user[0].name });

      return { user_id: parseInt(userId), name: user[0].name };
    });

    res.json({ message: '거부 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '거부 실패' });
  }
});

// 7. 정보 수정
router.put('/:userId', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;
  const { name, userId: newUserId, phone, store_id, hire_date } = req.body;

  try {
    const result = await withTransaction(req, async (conn) => {
      if (!name || !newUserId || !phone) throw { status: 400, msg: '이름, 아이디, 전화번호 필수' };

      const [user] = await conn.query(`SELECT * FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자 없음' };

      // 중복 체크 (기존)
      for (const [field, value] of Object.entries({ userId: newUserId, phone })) {
        const [dup] = await conn.query(`SELECT id FROM users WHERE ${field} = ? AND id != ?`, [value, userId]);
        if (dup.length > 0) throw { status: 409, msg: `이미 사용 중인 ${field === 'userId' ? '아이디' : '전화번호'}` };
      }

      // 매장 존재 체크 (기존)
      if (store_id != null) {
        const [store] = await conn.query('SELECT id FROM stores WHERE id = ?', [store_id]);
        if (!store[0]) throw { status: 400, msg: '존재하지 않는 매장' };
      }

      // 입사일 유효성 검사 (추가)
      if (hire_date != null) {
        if (typeof hire_date !== 'string' || !/^\d{6}$/.test(hire_date)) {
          throw { status: 400, msg: '입사일은 YYMMDD 형식의 6자리 숫자여야 합니다. (예: 251116)' };
        }
        const yy = parseInt(hire_date.substring(0, 2));
        const mm = parseInt(hire_date.substring(2, 4));
        const dd = parseInt(hire_date.substring(4, 6));
        if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
          throw { status: 400, msg: '입사일의 월 또는 일이 유효하지 않습니다.' };
        }
      }

      // 업데이트 쿼리 (hire_date 추가)
      await conn.query(
        `UPDATE users 
         SET name = ?, userId = ?, phone = ?, store_id = ?, hire_date = ? 
         WHERE id = ?`,
        [name, newUserId, phone, store_id ?? null, hire_date ?? null, userId]
      );

      // 감사 로그 (hire_date 포함)
      const changedFields = ['name', 'userId', 'phone', 'store_id'];
      if (hire_date != null || user[0].hire_date !== hire_date) changedFields.push('hire_date');

      await logAudit(conn, 'user_update', req.user.id, userId, { fields: changedFields });

      return {
        id: parseInt(userId),
        name,
        userId: newUserId,
        phone,
        store_id: store_id ?? null,
        hire_date: hire_date ?? null  // 응답에 포함
      };
    });

    res.json({ message: '수정 완료', user: result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '수정 실패' });
  }
});

// 8. 비밀번호 변경
router.put('/:userId/password', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;
  const { password } = req.body;

  try {
    if (!password || password.length < 4) throw { status: 400, msg: '비밀번호 4자 이상' };

    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자 없음' };

      const hashed = await bcrypt.hash(password, SALT_ROUNDS);
      await conn.query(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId]);
      await logAudit(conn, 'password_reset', req.user.id, userId, { name: user[0].name });

      return { user_id: parseInt(userId) };
    });

    res.json({ message: '비밀번호 변경 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '변경 실패' });
  }
});

// 9. 권한 변경 (level 1 ↔ 2)
router.put('/:userId/level', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;
  const { level } = req.body;

  if (![1, 2].includes(level)) {
    return res.status(400).json({ message: 'level은 1(직원) 또는 2(매장관리자)만 가능' });
  }

  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, level FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자 없음' };
      if (user[0].level === level) throw { status: 400, msg: '이미 해당 권한' };

      await conn.query(`UPDATE users SET level = ? WHERE id = ?`, [level, userId]);
      await logAudit(conn, level === 2 ? 'grant_store_admin' : 'revoke_store_admin', req.user.id, userId, {
        name: user[0].name,
        new_level: level
      });

      return { user_id: parseInt(userId), level };
    });

    res.json({ 
      message: level === 2 ? '매장관리자 권한 부여' : '직원 권한으로 변경',
      ...result 
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '권한 변경 실패' });
  }
});

// 10. 삭제 (level 0~1만 가능)
router.delete('/:userId', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, level FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자 없음' };
      if (parseInt(userId) === req.user.id) throw { status: 400, msg: '자기 자신 삭제 불가' };
      if (user[0].level >= 2) throw { status: 403, msg: '관리자는 삭제 불가' };

      await conn.query(`DELETE FROM users WHERE id = ?`, [userId]);
      await logAudit(conn, 'user_delete', req.user.id, userId, { name: user[0].name });

      return { user_id: parseInt(userId), name: user[0].name };
    });

    res.json({ message: '삭제 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '삭제 실패' });
  }
});

module.exports = router;