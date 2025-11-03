// server/routes/schedule.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const pool = (req) => req.app.get('db');

// server/routes/schedule.js 상단
const formatDate = (d) => d ? new Date(d).toISOString().split('T')[0] : null;
const formatTime = (t) => t ? t.slice(0, 5) : null;
const getKoreanDay = (d) => ['일', '월', '화', '수', '목', '금', '토'][new Date(d).getDay()];
const getStatusText = (s) => ({
  open: '신청 중',
  assigned: '배정 완료',
  closed: '마감'
})[s] || s;

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

// --- 1. 관리자: 스케줄 목록 ---
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { store_id } = req.query;
  try {
    let sql = `
      SELECT s.id, s.week_start, s.week_end, s.status, st.name AS store_name, s.store_id
      FROM schedules s
      JOIN stores st ON s.store_id = st.id
      WHERE 1=1
    `;
    const params = [];
    if (store_id) {
      sql += ' AND s.store_id = ?';
      params.push(store_id);
    }
    sql += ' ORDER BY s.week_start DESC';

    const [rows] = await pool(req).query(sql, params);
    const result = rows.map(r => {
      const start = formatDate(r.week_start);
      const end = formatDate(r.week_end);
      return {
        id: r.id,
        store_name: r.store_name,
        store_id: r.store_id,
        period: { start, end, label: `${start} ~ ${end}` },
        status: { value: r.status, text: getStatusText(r.status), color: r.status === 'open' ? 'green' : r.status === 'assigned' ? 'blue' : 'gray' }
      };
    });
    res.json(result);
  } catch (err) {
    console.error('[/schedules] GET Error:', err.message);
    res.status(500).json({ message: '스케줄 목록 조회 실패' });
  }
});

// --- 2. 관리자: 스케줄 생성 ---
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { store_id, week_start } = req.body;
  if (!store_id || !week_start) return res.status(400).json({ message: '필수 항목 누락' });

  try {
    const start = new Date(week_start);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const weekEnd = end.toISOString().split('T')[0];

    const [existing] = await pool(req).query(
      'SELECT id FROM schedules WHERE store_id = ? AND week_start = ?',
      [store_id, week_start]
    );
    if (existing.length > 0) return res.status(409).json({ message: '이미 존재하는 스케줄' });

    const [result] = await pool(req).query(
      'INSERT INTO schedules (store_id, week_start, week_end, status) VALUES (?, ?, ?, ?)',
      [store_id, week_start, weekEnd, 'open']
    );

    const [store] = await pool(req).query('SELECT name FROM stores WHERE id = ?', [store_id]);
    res.status(201).json({
      id: result.insertId,
      message: '스케줄 오픈 완료',
      store_name: store[0]?.name,
      period: { start: week_start, end: weekEnd, label: `${week_start} ~ ${weekEnd}` }
    });
  } catch (err) {
    console.error('[/schedules] POST Error:', err.message);
    res.status(500).json({ message: '스케줄 생성 실패' });
  }
});

// --- 3. 관리자: 자동 배정 ---
router.post('/:id/auto-assign', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool(req).query(
      'UPDATE schedules SET status = "assigned" WHERE id = ? AND status = "open"',
      [id]
    );
    if (result.affectedRows === 0) return res.status(409).json({ message: '배정 불가' });
    res.json({ message: '자동 배정 완료' });
  } catch (err) {
    res.status(500).json({ message: '자동 배정 실패' });
  }
});

// --- 4. 관리자: 스케줄 삭제 ---
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    await withTransaction(req, async (conn) => {
      await conn.query('DELETE FROM applications WHERE schedule_id = ?', [id]);
      await conn.query('DELETE FROM schedule_assignments WHERE schedule_id = ?', [id]);
      const [result] = await conn.query('DELETE FROM schedules WHERE id = ?', [id]);
      if (result.affectedRows === 0) throw new Error('스케줄 없음');
    });
    res.json({ message: '스케줄 삭제 완료' });
  } catch (err) {
    res.status(500).json({ message: err.message.includes('없음') ? '스케줄 없음' : '삭제 실패' });
  }
});

// --- 5. 신청 기간 확인 (store_name 포함) ---
// server/routes/schedule.js
router.get('/check-schedule-open', authMiddleware, async (req, res) => {
  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json({ is_open: false });

    const [schedule] = await pool(req).query(
      `SELECT week_start, week_end FROM schedules 
       WHERE store_id = ? AND status = 'open'
       ORDER BY week_start DESC LIMIT 1`,
      [user[0].store_id]
    );

    if (!schedule[0]) return res.json({ is_open: false });

    const start = formatDate(schedule[0].week_start);
    const end = formatDate(schedule[0].week_end);
    res.json({
      is_open: true,
      period: { start, end, label: `${start} ~ ${end}` }
    });
  } catch (err) {
    res.status(500).json({ message: '확인 실패' });
  }
});

// --- 6. 내 스케줄 목록 (신청 여부 포함) ---
router.get('/my-schedules', authMiddleware, async (req, res) => {
  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json([]);

    const [rows] = await pool(req).query(
      `SELECT 
         s.id,
         s.week_start,
         s.week_end,
         s.status,
         st.name AS store_name,
         CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS has_applied
       FROM schedules s
       JOIN stores st ON s.store_id = st.id
       LEFT JOIN applications a ON s.id = a.schedule_id AND a.user_id = ?
       WHERE s.store_id = ?
       ORDER BY s.week_start DESC`,
      [req.user.id, user[0].store_id]
    );

    const result = rows.map(r => {
      const start = formatDate(r.week_start);
      const end = formatDate(r.week_end);
      return {
        id: r.id,
        store_name: r.store_name,
        period: { start, end, label: `${start} ~ ${end}`, week_start: start },
        status: { value: r.status, text: getStatusText(r.status) },
        has_applied: r.has_applied === 1
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '내 스케줄 조회 실패' });
  }
});

// --- 7. 상세 스케줄 조회 (assignments 상세 포함) ---
// server/routes/schedule.js
router.get('/my-schedule-details', authMiddleware, async (req, res) => {
  const { schedule_id } = req.query; // week_start → schedule_id로 변경
  if (!schedule_id) return res.status(400).json({ message: 'schedule_id 필요' });

  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json({ assignments: [] });

    const [schedule] = await pool(req).query(
      `SELECT s.id, s.week_start, s.week_end, s.status, st.name AS store_name
       FROM schedules s
       JOIN stores st ON s.store_id = st.id
       WHERE s.id = ? AND s.store_id = ?`,
      [schedule_id, user[0].store_id]
    );
    if (!schedule[0]) return res.json({ assignments: [] });

    const { id: scheduleId, status, store_name, week_start, week_end } = schedule[0];

    const [assignments] = await pool(req).query(
      `SELECT date, start_time, end_time, status
       FROM schedule_assignments
       WHERE schedule_id = ? AND user_id = ?
       ORDER BY date`,
      [scheduleId, req.user.id]
    );

    const dayMap = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

    const formatted = assignments.map(a => {
      const dateObj = new Date(a.date);
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dateObj.getDay()];
      return {
        date: formatDate(a.date),
        day: dayMap[dayKey],
        time: { /* ... */ },
        status: { /* ... */ }
      };
    });

    res.json({
      schedule_id: scheduleId,
      store_name,
      period: {
        start: formatDate(week_start),
        end: formatDate(week_end),
        label: `${formatDate(week_start)} ~ ${formatDate(week_end)}`
      },
      status: { value: status, text: getStatusText(status) },
      assignments: formatted,
      total_days: formatted.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '상세 조회 실패' });
  }
});


// --- 8. 일반 사용자: 스케줄 신청 (handleSubmit와 완벽 매칭) ---
router.post('/schedule', authMiddleware, async (req, res) => {
  const { week_start, store_id, schedules } = req.body;
  const userId = req.user.id;

  if (!week_start || !store_id || !schedules || typeof schedules !== 'object') {
    return res.status(400).json({ message: 'week_start, store_id, schedules는 필수입니다.' });
  }

  try {
    await withTransaction(req, async (conn) => {
      // 1. 사용자 매장 검증
      const [user] = await conn.query('SELECT store_id FROM users WHERE id = ?', [userId]);
      if (!user[0] || user[0].store_id !== parseInt(store_id)) {
        throw { status: 403, msg: '본인 매장에만 신청 가능합니다.' };
      }

      // 2. 스케줄 존재 + 'open' 상태 확인
      const [schedule] = await conn.query(
        `SELECT id FROM schedules WHERE store_id = ? AND week_start = ?`,
        [store_id, week_start]
      );
      if (!schedule[0]) throw { status: 404, msg: '해당 주차의 스케줄이 없습니다.' };
      if (schedule[0].status !== 'open') throw { status: 400, msg: '신청 기간이 아닙니다.' };

      const scheduleId = schedule[0].id;

      // 3. 기존 신청 삭제
      await conn.query('DELETE FROM applications WHERE schedule_id = ? AND user_id = ?', [scheduleId, userId]);
      await conn.query('DELETE FROM schedule_assignments WHERE schedule_id = ? AND user_id = ?', [scheduleId, userId]);

      // 4. 신청 기록
      await conn.query(
        `INSERT INTO applications (user_id, schedule_id, status, applied_at)
         VALUES (?, ?, 'requested', NOW())`,
        [userId, scheduleId]
      );

      // 5. 근무 시간 저장 (정확한 day 키)
      const dayOffset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
      for (const [day, data] of Object.entries(schedules)) {
        const offset = dayOffset[day];
        if (offset === undefined) continue;

        const workDate = new Date(week_start);
        workDate.setDate(workDate.getDate() + offset);
        const dateStr = workDate.toISOString().split('T')[0];

        if (data.type === 'off') {
          await conn.query(
            `INSERT INTO schedule_assignments 
             (schedule_id, user_id, date, start_time, end_time, status)
             VALUES (?, ?, ?, NULL, NULL, 'requested')
             ON DUPLICATE KEY UPDATE start_time = NULL, end_time = NULL, status = 'requested'`,
            [scheduleId, userId, dateStr]
          );
        } else if (data.type === 'part' && data.start && data.end) {
          await conn.query(
            `INSERT INTO schedule_assignments 
             (schedule_id, user_id, date, start_time, end_time, status)
             VALUES (?, ?, ?, ?, ?, 'requested')
             ON DUPLICATE KEY UPDATE start_time = ?, end_time = ?, status = 'requested'`,
            [scheduleId, userId, dateStr, data.start, data.end, data.start, data.end]
          );
        }
      }
    });

    res.json({ message: '스케줄 신청 완료!' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '신청 실패' });
  }
});

// server/routes/store.js
router.put('/:id/settings/days', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const settings = req.body; // 배열: [{ day_type, open_time, ... }]

  try {
    await withTransaction(req, async (conn) => {
      // 기존 설정 삭제
      await conn.query('DELETE FROM store_settings WHERE store_id = ?', [id]);

      // 새 설정 삽입
      for (const s of settings) {
        await conn.query(
          `INSERT INTO store_settings 
           (store_id, day_type, open_time, close_time, break_start, break_end, lunch_staff, dinner_staff)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, s.day_type, s.open_time || null, s.close_time || null,
            s.break_start || null, s.break_end || null,
            s.lunch_staff || 0, s.dinner_staff || 0
          ]
        );
      }
    });
    res.json({ message: '요일별 설정 저장 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '설정 저장 실패' });
  }
});

// server/routes/schedule.js
router.post('/:id/auto-assign', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const scheduleId = parseInt(id);

  try {
    await withTransaction(req, async (conn) => {
      // 1. 스케줄 정보 + 매장 설정 가져오기
      const [schedule] = await conn.query(
        `SELECT s.store_id, s.week_start, s.week_end, st.open_time, st.close_time,
                ss.day_type, ss.break_start, ss.break_end, ss.lunch_staff, ss.dinner_staff
         FROM schedules s
         JOIN stores st ON s.store_id = st.id
         LEFT JOIN store_settings ss ON st.id = ss.store_id
         WHERE s.id = ?`,
        [scheduleId]
      );
      if (!schedule[0]) throw { status: 404, msg: '스케줄 없음' };

      const { store_id, week_start } = schedule[0];

      // 2. 신청된 근무 시간 가져오기
      const [applications] = await conn.query(
        `SELECT sa.user_id, sa.date, sa.start_time, sa.end_time
         FROM applications a
         JOIN schedule_assignments sa ON a.schedule_id = sa.schedule_id AND a.user_id = sa.user_id
         WHERE a.schedule_id = ? AND a.status = 'requested' AND sa.start_time IS NOT NULL`,
        [scheduleId]
      );

      // 3. 날짜별 필요 인원 계산
      const needByDate = {};
      const dates = getDatesInWeek(week_start);
      for (const date of dates) {
        const dayType = getDayType(date); // weekday, weekend, holiday
        const setting = schedule.find(s => s.day_type === dayType) || {};
        needByDate[date] = {
          lunch: setting.lunch_staff || 4,
          dinner: setting.dinner_staff || 6
        };
      }

      // 4. 배치 실행
      const assignments = assignWorkers(applications, needByDate, schedule[0]);

      // 5. 배치 결과 저장
      for (const { user_id, date, start_time, end_time } of assignments) {
        await conn.query(
          `UPDATE schedule_assignments 
           SET status = 'assigned', assigned_by = ?
           WHERE schedule_id = ? AND user_id = ? AND date = ?`,
          [req.user.id, scheduleId, user_id, date]
        );
      }

      // 6. 스케줄 상태 업데이트
      await conn.query(`UPDATE schedules SET status = 'assigned' WHERE id = ?`, [scheduleId]);
    });

    res.json({ message: '자동 배치 완료' });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.msg || '자동 배치 실패' });
  }
});

// server/routes/schedule.js
router.get('/:id/preview', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool(req).query(
      `SELECT 
         sa.date,
         sa.start_time,
         sa.end_time,
         u.name AS worker_name,
         sa.status
       FROM schedule_assignments sa
       JOIN users u ON sa.user_id = u.id
       WHERE sa.schedule_id = ?
       ORDER BY sa.date, sa.start_time`,
      [id]
    );

    // 날짜별 그룹화
    const preview = {};
    for (const r of rows) {
      const date = r.date;
      if (!preview[date]) preview[date] = [];
      preview[date].push({
        worker: r.worker_name,
        time: `${r.start_time?.slice(0, 5)} ~ ${r.end_time?.slice(0, 5)}`,
        status: r.status
      });
    }

    res.json({ preview });
  } catch (err) {
    res.status(500).json({ message: '미리보기 실패' });
  }
});

// server/routes/schedule.js
router.get('/open', authMiddleware, async (req, res) => {
  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json([]);

    const [rows] = await pool(req).query(
      `SELECT 
         s.id,
         s.week_start,
         s.week_end,
         st.name AS store_name,
         CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS has_applied
       FROM schedules s
       JOIN stores st ON s.store_id = st.id
       LEFT JOIN applications a ON s.id = a.schedule_id AND a.user_id = ?
       WHERE s.store_id = ? AND s.status = 'open'
       ORDER BY s.week_start DESC`,
      [req.user.id, user[0].store_id]
    );

    const result = rows.map(r => {
      const start = formatDate(r.week_start);
      const end = formatDate(r.week_end);
      return {
        id: r.id,
        store_name: r.store_name,
        period: { start, end, label: `${start} ~ ${end}`, week_start: start },
        has_applied: r.has_applied === 1
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '오픈 스케줄 조회 실패' });
  }
});

module.exports = router;