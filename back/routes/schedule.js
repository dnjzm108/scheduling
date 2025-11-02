// server/routes/schedule.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const pool = (req) => req.app.get('db');

// --- 헬퍼 함수 ---
const formatDate = (dateStr) => dateStr ? new Date(dateStr).toISOString().split('T')[0] : null;
const formatTime = (timeStr) => timeStr ? timeStr.slice(0, 5) : null;
const getKoreanDay = (dateStr) => ['일', '월', '화', '수', '목', '금', '토'][new Date(dateStr).getDay()];
const getStatusText = (status) => ({
  open: '신청 중',
  closed: '신청 마감',
  assigned: '배정 완료'
})[status] || status;

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

// --- 5. 일반 사용자: 신청 기간 확인 ---
router.get('/check-schedule-open', authMiddleware, async (req, res) => {
  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json({ is_open: false, message: '매장 정보 없음' });

    const [schedule] = await pool(req).query(
      `SELECT s.week_start, s.week_end, st.name AS store_name 
       FROM schedules s 
       JOIN stores st ON s.store_id = st.id 
       WHERE s.store_id = ? AND s.status = 'open' 
       ORDER BY s.week_start DESC LIMIT 1`,
      [user[0].store_id]
    );

    if (!schedule[0]) return res.json({ is_open: false, message: '신청 가능한 스케줄 없음' });

    const { week_start, week_end, store_name } = schedule[0];
    const start = formatDate(week_start);
    const end = formatDate(week_end);
    res.json({
      is_open: true,
      store_name,
      period: { start, end, label: `${start} ~ ${end}` },
      message: '신청 기간입니다.'
    });
  } catch (err) {
    res.status(500).json({ message: '확인 실패' });
  }
});

// --- 6. 일반 사용자: 내 스케줄 목록 (매장명 포함) ---
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
         COUNT(sa.id) AS assignment_count
       FROM schedules s
       JOIN stores st ON s.store_id = st.id
       LEFT JOIN schedule_assignments sa ON s.id = sa.schedule_id AND sa.user_id = ?
       WHERE s.store_id = ?
       GROUP BY s.id
       ORDER BY s.week_start DESC`,
      [req.user.id, user[0].store_id]
    );

    const result = rows.map(r => {
      const start = formatDate(r.week_start);
      const end = formatDate(r.week_end);
      return {
        id: r.id,
        store_name: r.store_name,
        period: {
          start,
          end,
          label: `${start} ~ ${end}`,
          week_start: start,
          week_end: end
        },
        status: {
          value: r.status,
          text: getStatusText(r.status),
          color: r.status === 'open' ? 'green' : r.status === 'assigned' ? 'blue' : 'gray'
        },
        assignment_count: r.assignment_count,
        has_assignment: r.assignment_count > 0
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '내 스케줄 조회 실패' });
  }
});

// --- 7. 일반 사용자: 상세 스케줄 조회 (매장명 포함) ---
router.get('/my-schedule-details', authMiddleware, async (req, res) => {
  const { week_start } = req.query;
  if (!week_start) return res.status(400).json({ message: 'week_start 필요' });

  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json({ assignments: [] });

    const [schedule] = await pool(req).query(
      `SELECT s.id, s.week_start, s.week_end, s.status, st.name AS store_name
       FROM schedules s
       JOIN stores st ON s.store_id = st.id
       WHERE s.store_id = ? AND s.week_start = ?`,
      [user[0].store_id, week_start]
    );
    if (!schedule[0]) return res.json({ assignments: [] });

    const { id: scheduleId, status, store_name } = schedule[0];

    const [assignments] = await pool(req).query(
      `SELECT sa.date, sa.start_time, sa.end_time, sa.status, u.name AS assigned_by_name
       FROM schedule_assignments sa
       LEFT JOIN users u ON sa.assigned_by = u.id
       WHERE sa.schedule_id = ? AND sa.user_id = ?
       ORDER BY sa.date`,
      [scheduleId, req.user.id]
    );

    const formattedAssignments = assignments.map(a => ({
      date: formatDate(a.date),
      day: getKoreanDay(a.date),
      time: {
        start: formatTime(a.start_time),
        end: formatTime(a.end_time),
        label: `${formatTime(a.start_time)} ~ ${formatTime(a.end_time)}`
      },
      status: { value: a.status, text: a.status === 'assigned' ? '배정됨' : '확정됨' },
      assigned_by: a.assigned_by_name || '시스템'
    }));

    res.json({
      schedule_id: scheduleId,
      store_name,
      period: {
        start: formatDate(schedule[0].week_start),
        end: formatDate(schedule[0].week_end),
        label: `${formatDate(schedule[0].week_start)} ~ ${formatDate(schedule[0].week_end)}`
      },
      status: { value: status, text: getStatusText(status), color: status === 'open' ? 'green' : status === 'assigned' ? 'blue' : 'gray' },
      assignments: formattedAssignments,
      total_days: formattedAssignments.length,
      has_assignment: formattedAssignments.length > 0
    });
  } catch (err) {
    res.status(500).json({ message: '상세 조회 실패' });
  }
});

// --- 8. 일반 사용자: 스케줄 신청 (handleSubmit와 완벽 매칭) ---
router.post('/schedule', authMiddleware, async (req, res) => {
  const { week_start, store_id, schedules } = req.body;
  const userId = req.user.id;

  // 1. 입력 검증
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
        `SELECT id, status FROM schedules WHERE store_id = ? AND week_start = ?`,
        [store_id, week_start]
      );
      if (!schedule[0]) throw { status: 404, msg: '해당 주차의 스케줄이 없습니다.' };
      if (schedule[0].status !== 'open') throw { status: 400, msg: '신청 기간이 아닙니다.' };

      const scheduleId = schedule[0].id;

      // 3. 기존 신청 삭제 (중복 방지)
      await conn.query(
        'DELETE FROM applications WHERE schedule_id = ? AND user_id = ?',
        [scheduleId, userId]
      );

      // 4. applications 테이블에 신청 기록
      await conn.query(
        `INSERT INTO applications (user_id, schedule_id, status, applied_at)
         VALUES (?, ?, 'requested', NOW())`,
        [userId, scheduleId]
      );

      // 5. schedule_assignments에 요일별 근무 시간 저장
      const dayOffset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
      const insertPromises = Object.entries(schedules).map(async ([day, data]) => {
        const offset = dayOffset[day.toLowerCase()];
        if (offset === undefined) return;

        const workDate = new Date(week_start);
        workDate.setDate(workDate.getDate() + offset);
        const dateStr = workDate.toISOString().split('T')[0];

        if (data.type === 'off') {
          // 휴무: NULL 처리
          return conn.query(
            `INSERT INTO schedule_assignments 
             (schedule_id, user_id, date, start_time, end_time, status)
             VALUES (?, ?, ?, NULL, NULL, 'requested')
             ON DUPLICATE KEY UPDATE 
               start_time = NULL, end_time = NULL, status = 'requested'`,
            [scheduleId, userId, dateStr]
          );
        }

        if (data.type === 'part' && data.start && data.end) {
          // 파트타임: 시간 저장
          return conn.query(
            `INSERT INTO schedule_assignments 
             (schedule_id, user_id, date, start_time, end_time, status)
             VALUES (?, ?, ?, ?, ?, 'requested')
             ON DUPLICATE KEY UPDATE 
               start_time = ?, end_time = ?, status = 'requested'`,
            [scheduleId, userId, dateStr, data.start, data.end, data.start, data.end]
          );
        }
      }).filter(Boolean);

      await Promise.all(insertPromises);

      // 6. 감사 로그
      await conn.query(
        `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
         VALUES ('schedule_apply', ?, 'application', NULL, ?, NOW())`,
        [userId, JSON.stringify({ week_start, store_id })]
      );
    });

    res.json({ message: '스케줄 신청 완료!' });
  } catch (err) {
    console.log(err);
    
    console.error('[/schedule] POST Error:', err.msg);
    res.status(err.status || 500).json({ message: err.msg || '스케줄 신청 실패' });
  }
});


module.exports = router;