// server/routes/user.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');
const { storeAdmin, globalAdmin } = require('../middleware/levelMiddleware');

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
      `SELECT u.id, u.name, u.userId, u.level, u.store_id, u.work_area, s.name AS store_name ,
      u.phone,u.resident_id,u.bank_name,u.bank_account,u.account_holder 
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

// 2. 직원 목록
router.get('/employees', authMiddleware, async (req, res) => {
  const { store_id } = req.query;
  const requesterLevel = req.user.level;
  const requesterStoreId = req.user.store_id;

  try {
    let sql = `
      SELECT 
        u.id, u.name, u.userId, u.phone, u.store_id, u.level, 
        u.signup_date, u.hire_date,
        u.bank_name, u.bank_account, u.account_holder, u.tax_type, u.work_area,
        s.salary_type,
        s.hourly_rate,
        s.hourly_rate_with_holiday,
        s.monthly_salary
      FROM users u
      LEFT JOIN employee_salary s ON u.id = s.user_id
      WHERE u.level >= 1 AND u.is_active = 1
        AND u.level < ?
    `;
    const params = [requesterLevel];

    if (requesterLevel === 3) {
      sql += ' AND u.store_id = ?';
      params.push(requesterStoreId);
    }

    if (store_id && store_id !== 'all') {
      sql += ' AND u.store_id = ?';
      params.push(store_id);
    }

    sql += `
  ORDER BY 
    u.level DESC,
    (u.work_area = 'both') DESC,
    u.hire_date ASC,
    u.name ASC `;

    const [rows] = await pool(req).query(sql, params);

    const result = rows.map(row => ({
      id: row.id,
      name: row.name,
      userId: row.userId,
      phone: row.phone,
      store_id: row.store_id,
      level: row.level,
      signup_date: row.signup_date,
      hire_date: row.hire_date,

      bank_name: row.bank_name,
      bank_account: row.bank_account,
      account_holder: row.account_holder,
      tax_type: row.tax_type ?? 0,
      work_area: row.work_area || 'both',

      salary_info: {
        salary_type: row.salary_type || null,
        hourly_rate: row.hourly_rate || null,
        hourly_rate_with_holiday: row.hourly_rate_with_holiday || null,
        monthly_salary: row.monthly_salary || null
      }
    }));

    res.json(result);
  } catch (err) {
    console.error('직원 목록 조회 실패:', err);
    res.status(500).json({ message: '직원 목록을 불러오지 못했습니다.' });
  }
});

// 3. 승인 대기
router.get('/pending-users', authMiddleware, storeAdmin, async (req, res) => {
  try {
    const [rows] = await pool(req).query(`
      SELECT u.id, u.name, u.userId, u.phone, u.signup_date AS created_at, u.store_id, s.name AS store_name
      FROM users u LEFT JOIN stores s ON u.store_id = s.id
      WHERE u.level = 0
    `);
    res.json(rows);
  } catch (err) {
    console.error('승인 대기 조회 실패:', err);
    res.status(500).json({ message: '승인 대기 조회 실패' });
  }
});

// 4. 관리자 목록
router.get('/admins', authMiddleware, globalAdmin, async (req, res) => {
  const { store_id } = req.query;
  try {
    let sql = `SELECT id, name, userId, phone, store_id, level, signup_date FROM users WHERE level >= 2`;
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

// 5. 승인
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

// 6. 거부
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

// 9. 권한 변경
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

// 10. 삭제
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

// routes/users.js (또는 admin 전용 라우트)
router.patch('/:id/resign', authMiddleware, storeAdmin, async (req, res) => {
  const { id } = req.params;
  const { resign_date } = req.body;

  try {
    const date = resign_date || new Date().toISOString().split('T')[0];

    const [result] = await pool(req).query(
      `UPDATE users 
       SET is_active = 0, resign_date = ?
       WHERE id = ?`,
      [date, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '직원을 찾을 수 없습니다.' });
    }

    res.json({ message: '퇴사 처리 완료', resign_date: date });
  } catch (err) {
    console.error('RESIGN ERROR:', err);
    res.status(500).json({ message: '퇴사 처리 중 오류가 발생했습니다.' });
  }
});
// server/routes/user.js 같은 곳에
router.get('/allowed-stores', authMiddleware, async (req, res) => {
  const conn = req.app.get('db');
  const user = req.user;

  if (user.level === 4) {
    // 총관리자: 모든 매장 선택 가능
    return res.json({
      isSuperAdmin: true,
      allowedStores: []   // 프론트에서는 이 값은 무시
    });
  }

  if (user.level === 3) {
    const [rows] = await conn.query(
      'SELECT store_id FROM admin_store_access WHERE admin_user_id = ?',
      [user.id]
    );
    const extra = rows.map(r => r.store_id);
    return res.json({
      isSuperAdmin: false,
      allowedStores: [user.store_id, ...extra]
    });
  }

  return res.json({
    isSuperAdmin: false,
    allowedStores: []
  });
});

// ============================
// 직원 정보 조회
// ============================
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const userLevel = req.user.level;

    if (userLevel < 3) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    const [rows] = await pool(req).query(`
      SELECT 
        u.id, u.name, u.phone, u.resident_id, u.hire_date, u.resign_date,
        u.work_area, u.bank_name, u.bank_account, u.account_holder,
        u.is_active,
        es.hourly_rate
      FROM users u
      LEFT JOIN employee_salary es ON es.user_id = u.id
      WHERE u.id = ?
    `, [userId]);

    res.json(rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "직원 조회 실패" });
  }
});

// ============================
// 직원 정보 수정 API
// ============================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    const adminLevel = req.user.level;

    if (adminLevel < 3) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    const {
      name, phone, resident_id,
      hire_date, resign_date,
      work_area,
      bank_name, bank_account, account_holder,
      is_active,
      hourly_rate
    } = req.body;

    const conn = pool(req);

    // 직원 정보 업데이트
    await conn.query(`
      UPDATE users SET 
        name = ?, phone = ?, resident_id = ?, 
        hire_date = ?, resign_date = ?, work_area = ?,
        bank_name = ?, bank_account = ?, account_holder = ?,
        is_active = ?
      WHERE id = ?
    `, [
      name, phone, resident_id,
      hire_date, resign_date, work_area,
      bank_name, bank_account, account_holder,
      is_active,
      userId
    ]);

    // 급여테이블 업데이트
    await conn.query(`
      INSERT INTO employee_salary (user_id, hourly_rate)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE hourly_rate = VALUES(hourly_rate)
    `, [userId, hourly_rate]);

    res.json({ message: "수정 완료" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "직원 수정 실패" });
  }
});


// ===========================================
// 11. 개인정보 수정 (프론트 요청 API)
// PUT /api/user/:id/personal
// ===========================================
router.put("/:id/personal", authMiddleware, async (req, res) => {
  const userId = req.params.id;
  const requesterId = req.user.id;
  const requesterLevel = req.user.level;

  try {
    // 본인 또는 관리자 이상만 수정 가능
    if (parseInt(userId) !== requesterId && requesterLevel < 3) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    const {
      name,
      phone,
      resident_id,
      bank_name,
      bank_account,
      account_holder
    } = req.body;

    // 필수값 체크
    if (!name || !phone) {
      return res.status(400).json({ message: "이름과 전화번호는 필수입니다." });
    }

    const conn = req.app.get("db");

    // 중복 체크 (전화번호)
    const [dupPhone] = await conn.query(
      `SELECT id FROM users WHERE phone = ? AND id != ?`,
      [phone, userId]
    );
    if (dupPhone.length > 0) {
      return res.status(409).json({ message: "이미 사용 중인 전화번호입니다." });
    }

    // 개인정보 업데이트
    await conn.query(
      `
      UPDATE users SET
        name = ?,
        phone = ?,
        resident_id = ?,
        bank_name = ?,
        bank_account = ?,
        account_holder = ?
      WHERE id = ?
      `,
      [
        name,
        phone,
        resident_id || null,
        bank_name || null,
        bank_account || null,
        account_holder || null,
        userId
      ]
    );

    res.json({ message: "개인정보 수정 완료" });
  } catch (err) {
    console.error("개인정보 수정 오류:", err);
    res.status(500).json({
      message: "서버 오류: 개인정보를 수정할 수 없습니다.",
      error: err.message
    });
  }
});



// 7. 직원 정보 수정
router.put('/:userId', authMiddleware, storeAdmin, async (req, res) => {
  const { userId } = req.params;
  const {
    name,
    userId: newUserId,
    phone,
    store_id,
    hire_date,
    level,
    hourly_rate,
    hourly_rate_with_holiday,
    monthly_salary,

    bank_name,
    bank_account,
    account_holder,
    tax_type,
    work_area
  } = req.body;
  console.log(req.body);


  try {
    const result = await withTransaction(req, async (conn) => {
      const [userRows] = await conn.query(`SELECT * FROM users WHERE id = ? FOR UPDATE`, [userId]);
      if (!userRows[0]) throw { status: 404, msg: '사용자 없음' };
      const oldUser = userRows[0];

      if (!name || !newUserId || !phone) {
        throw { status: 400, msg: '이름, 아이디, 전화번호는 필수입니다.' };
      }

      // 중복 체크
      for (const [field, value] of Object.entries({ userId: newUserId, phone })) {
        if (value && value !== oldUser[field]) {
          const [dup] = await conn.query(
            `SELECT id FROM users WHERE ${field} = ? AND id != ?`,
            [value, userId]
          );
          if (dup.length > 0) {
            throw { status: 409, msg: `이미 사용 중인 ${field === 'userId' ? '아이디' : '전화번호'}입니다.` };
          }
        }
      }

      if (store_id != null) {
        const [store] = await conn.query('SELECT id FROM stores WHERE id = ?', [store_id]);
        if (!store[0]) throw { status: 400, msg: '존재하지 않는 매장입니다.' };
      }

      const finalLevel = level ?? oldUser.level;
      const finalWorkArea = work_area || oldUser.work_area || 'both';
      const finalTaxType = (tax_type !== undefined && tax_type !== null) ? parseInt(tax_type, 10) : (oldUser.tax_type ?? 0);

      // users 테이블 업데이트
      await conn.query(
        `UPDATE users 
         SET name = ?, userId = ?, phone = ?, store_id = ?, hire_date = ?, level = ?,
             bank_name = ?, bank_account = ?, account_holder = ?, tax_type = ?, work_area = ?
         WHERE id = ?`,
        [
          name, newUserId, phone, store_id ?? null, hire_date ?? null, finalLevel,
          bank_name || null,
          bank_account || null,
          account_holder || null,
          finalTaxType,
          finalWorkArea,
          userId
        ]
      );

      // 급여 정보
      if (finalLevel !== undefined || hourly_rate || hourly_rate_with_holiday || monthly_salary) {
        const isHourly = finalLevel === 1;
        const isMonthly = [2, 3].includes(finalLevel);

        if (isHourly) {
          const rate1 = hourly_rate ? parseInt(hourly_rate, 10) : null;
          const rate2 = hourly_rate_with_holiday ? parseInt(hourly_rate_with_holiday, 10) : null;
          if (!rate1 || !rate2 || isNaN(rate1) || isNaN(rate2) || rate1 <= 0 || rate2 <= 0) {
            throw { status: 400, msg: '알바는 기본 시급과 주휴수당 포함 시급을 올바르게 입력해야 합니다.' };
          }
        }

        if (isMonthly) {
          const salary = monthly_salary ? parseInt(monthly_salary, 10) : null;
          if (!salary || isNaN(salary) || salary <= 0) {
            throw { status: 400, msg: '정직원/매장관리자는 월급을 올바르게 입력해야 합니다.' };
          }
        }

        await conn.query(`
          INSERT INTO employee_salary 
            (user_id, salary_type, hourly_rate, hourly_rate_with_holiday, monthly_salary)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            salary_type = VALUES(salary_type),
            hourly_rate = VALUES(hourly_rate),
            hourly_rate_with_holiday = VALUES(hourly_rate_with_holiday),
            monthly_salary = VALUES(monthly_salary),
            updated_at = CURRENT_TIMESTAMP
        `, [
          userId,
          finalLevel === 1 ? 'hourly' : 'monthly',
          finalLevel === 1 ? parseInt(hourly_rate, 10) : null,
          finalLevel === 1 ? parseInt(hourly_rate_with_holiday, 10) : null,
          [2, 3].includes(finalLevel) ? parseInt(monthly_salary, 10) : null
        ]);
      }

      const changed = [];
      if (name !== oldUser.name) changed.push('name');
      if (newUserId !== oldUser.userId) changed.push('userId');
      if (phone !== oldUser.phone) changed.push('phone');
      if (store_id != oldUser.store_id) changed.push('store_id');
      if (hire_date != oldUser.hire_date) changed.push('hire_date');
      if (finalLevel !== oldUser.level) changed.push('level');
      if (bank_name !== oldUser.bank_name || bank_account !== oldUser.bank_account || account_holder !== oldUser.account_holder) changed.push('bank');
      if (finalTaxType !== oldUser.tax_type) changed.push('tax_type');
      if (finalWorkArea !== oldUser.work_area) changed.push('work_area');
      if (hourly_rate || hourly_rate_with_holiday || monthly_salary) changed.push('salary');

      if (changed.length > 0) {
        await logAudit(conn, 'user_update', req.user.id, userId, { fields: changed });
      }

      const [newUser] = await conn.query(`SELECT * FROM users WHERE id = ?`, [userId]);
      const [salary] = await conn.query(`SELECT * FROM employee_salary WHERE user_id = ?`, [userId]);

      return {
        ...newUser[0],
        salary_info: salary[0] || null
      };
    });

    res.json({ message: '직원 정보 수정 완료', user: result });
  } catch (err) {
    console.error('직원 수정 실패:', err);
    res.status(err.status || 500).json({ message: err.msg || '서버 오류 발생' });
  }
});


// 8. 비밀번호 변경
router.put('/:userId/password/personal', authMiddleware, async (req, res) => {
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
    console.log(err);
    
    res.status(err.status || 500).json({ message: err.msg || '변경 실패' });
  }
});

module.exports = router;
