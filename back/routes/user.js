// server/routes/user.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const bcrypt = require('bcryptjs');

const pool = (req) => req.app.get('db');
const SALT_ROUNDS = 10;

// --- 공통 헬퍼 ---
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

const logAudit = async (conn, action, actorId, targetId, details) => {
  await conn.query(
    `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
     VALUES (?, ?, 'user', ?, ?, NOW())`,
    [action, actorId, targetId, JSON.stringify(details)]
  );
};

// --- 1. 내 정보 ---
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT u.id, u.name, u.userId, u.isAdmin, u.store_id, s.name AS store_name
       FROM users u LEFT JOIN stores s ON u.store_id = s.id WHERE u.id = ?`,
      [req.user.id]
    );
    res.json(rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '사용자 정보 조회 실패' });
  }
});

// --- 2. 직원 목록 ---
router.get('/employees', authMiddleware, adminMiddleware, async (req, res) => {
  const { store_id } = req.query;
  try {
    let sql = `SELECT id, name, userId, phone, store_id, isAdmin, signup_date FROM users WHERE isAdmin = 0`;
    const params = [];
    if (store_id && store_id !== 'all') {
      sql += ' AND store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool(req).query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '직원 목록 조회 실패' });
  }
});

// --- 3. 승인 대기 ---
router.get('/pending-users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT id, name, userId, phone, signup_date AS created_at FROM users WHERE approved = 0`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '승인 대기 조회 실패' });
  }
});

// --- 4. 관리자 목록 ---
router.get('/admins', authMiddleware, adminMiddleware, async (req, res) => {
  const { store_id } = req.query;
  try {
    let sql = `SELECT id, name, userId, phone, store_id, isAdmin, signup_date FROM users WHERE isAdmin = 1`;
    const params = [];
    if (store_id && store_id !== 'all') {
      sql += ' AND store_id = ?';
      params.push(store_id);
    }
    const [rows] = await pool(req).query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '관리자 목록 조회 실패' });
  }
});

// --- 5. 승인 ---
router.put('/:userId/approve', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, approved FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자를 찾을 수 없습니다.' };
      if (user[0].approved === 1) throw { status: 400, msg: '이미 승인된 사용자입니다.' };

      await conn.query(`UPDATE users SET approved = 1 WHERE id = ?`, [userId]);
      await logAudit(conn, 'user_approve', req.user.id, userId, {
        approved_user: user[0].name,
        approved_by: req.user.id
      });

      return { user_id: parseInt(userId), user_name: user[0].name };
    });

    res.json({ message: '승인 완료', ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '승인 실패' });
  }
});

// --- 6. 거부 (삭제) ---
router.put('/:userId/reject', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, approved FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자를 찾을 수 없습니다.' };
      if (user[0].approved === 1) throw { status: 400, msg: '이미 승인된 사용자는 거부할 수 없습니다.' };

      await conn.query(`DELETE FROM users WHERE id = ?`, [userId]);
      await logAudit(conn, 'user_reject', req.user.id, userId, {
        rejected_user: user[0].name,
        rejected_by: req.user.id
      });

      return { user_id: parseInt(userId), user_name: user[0].name };
    });

    res.json({ message: '거부 완료', ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '거부 실패' });
  }
});

// --- 7. 정보 수정 ---
router.put('/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { name, userId: newUserId, phone, store_id } = req.body;

  try {
    const result = await withTransaction(req, async (conn) => {
      if (!name || !newUserId || !phone) throw { status: 400, msg: '이름, 아이디, 전화번호는 필수입니다.' };

      const [user] = await conn.query(`SELECT * FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자를 찾을 수 없습니다.' };

      // 중복 체크
      const checks = [
        { field: 'userId', value: newUserId },
        { field: 'phone', value: phone }
      ];
      for (const { field, value } of checks) {
        const [dup] = await conn.query(`SELECT id FROM users WHERE ${field} = ? AND id != ?`, [value, userId]);
        if (dup.length > 0) throw { status: 400, msg: `이미 사용 중인 ${field === 'userId' ? '아이디' : '전화번호'}입니다.` };
      }

      // 매장 존재 확인
      if (store_id != null) {
        const [store] = await conn.query(`SELECT id FROM stores WHERE id = ?`, [store_id]);
        if (store.length === 0) throw { status: 400, msg: '존재하지 않는 매장입니다.' };
      }

      await conn.query(
        `UPDATE users SET name = ?, userId = ?, phone = ?, store_id = ? WHERE id = ?`,
        [name, newUserId, phone, store_id ?? null, userId]
      );

      const changes = [];
      ['name', 'userId', 'phone'].forEach(field => {
        if (user[0][field] !== eval(field)) changes.push(`${field === 'userId' ? '아이디' : field === 'phone' ? '전화번호' : '이름'}: ${user[0][field]} → ${eval(field)}`);
      });
      if (user[0].store_id != store_id) changes.push(`매장: ${user[0].store_id ?? '없음'} → ${store_id ?? '없음'}`);

      await logAudit(conn, 'user_update', req.user.id, userId, { updated_fields: changes });

      return { id: parseInt(userId), name, userId: newUserId, phone, store_id: store_id ?? null };
    });

    res.json({ message: '수정 완료', user: result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '수정 실패' });
  }
});

// --- 8. 비밀번호 변경 ---
router.put('/:userId/password', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { password } = req.body;

  try {
    const result = await withTransaction(req, async (conn) => {
      if (!password || password.trim() === '') throw { status: 400, msg: '새 비밀번호를 입력해주세요.' };
      if (password.length < 4 || password.length > 20) throw { status: 400, msg: '비밀번호는 4~20자 사이여야 합니다.' };

      const [user] = await conn.query(`SELECT id, name, userId FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자를 찾을 수 없습니다.' };

      const hashed = await bcrypt.hash(password, SALT_ROUNDS);
      await conn.query(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId]);

      await logAudit(conn, 'password_reset', req.user.id, userId, {
        target_user: user[0].name,
        reset_by: req.user.id
      });

      return { user_id: parseInt(userId), user_name: user[0].name };
    });

    res.json({ message: '비밀번호 변경 완료', ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '비밀번호 변경 실패' });
  }
});

// --- 9. 관리자 권한 토글 ---
router.put('/:userId/admin', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { isAdmin } = req.body;

  try {
    const result = await withTransaction(req, async (conn) => {
      if (typeof isAdmin !== 'boolean') throw { status: 400, msg: 'isAdmin 값은 true/false여야 합니다.' };

      const [user] = await conn.query(`SELECT id, name, userId, isAdmin FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자를 찾을 수 없습니다.' };
      if (user[0].isAdmin === (isAdmin ? 1 : 0)) {
        throw { status: 400, msg: isAdmin ? '이미 관리자입니다.' : '이미 일반 사용자입니다.' };
      }

      await conn.query(`UPDATE users SET isAdmin = ? WHERE id = ?`, [isAdmin ? 1 : 0, userId]);
      await logAudit(conn, isAdmin ? 'grant_admin' : 'revoke_admin', req.user.id, userId, {
        target_user: user[0].name,
        new_status: isAdmin ? 'admin' : 'user'
      });

      return { user_id: parseInt(userId), isAdmin };
    });

    res.json({ message: isAdmin ? '관리자 권한 부여됨' : '관리자 권한 해제됨', ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '권한 변경 실패' });
  }
});

// --- 10. 직원 삭제 ---
router.delete('/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await withTransaction(req, async (conn) => {
      const [user] = await conn.query(`SELECT id, name, userId, isAdmin FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!user[0]) throw { status: 404, msg: '사용자를 찾을 수 없습니다.' };
      if (parseInt(userId) === req.user.id) throw { status: 400, msg: '자기 자신은 삭제할 수 없습니다.' };
      if (user[0].isAdmin === 1) throw { status: 403, msg: '관리자 계정은 삭제할 수 없습니다.' };

      await conn.query(`DELETE FROM users WHERE id = ?`, [userId]);
      await logAudit(conn, 'user_delete', req.user.id, userId, {
        deleted_user: user[0].name
      });

      return { user_id: parseInt(userId), user_name: user[0].name };
    });

    res.json({ message: '삭제 완료', ...result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '삭제 실패' });
  }
});

module.exports = router;