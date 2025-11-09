// server/routes/schedule.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { storeAdmin, globalAdmin,employee } = require('../middleware/levelMiddleware');;
const { formatDate, formatTime } = require('../utils/date')

const pool = (req) => req.app.get('db');

// server/routes/schedule.js 상단
// const formatDate = (d) => d ? new Date(d).toISOString().split('T')[0] : null;
// const formatTime = (t) => t ? t.slice(0, 5) : null;
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
// server/routes/schedule.js
router.get('/', authMiddleware, storeAdmin, async (req, res) => {
  try {
    const { store_id } = req.query;
    let sql = `
      SELECT s.id, s.week_start, s.week_end, s.status, st.name AS store_name
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

    const result = rows.map(r => ({
      id: r.id,
      store_name: r.store_name,
      period: {
        start: formatDate(r.week_start),     // KST 기준
        end: formatDate(r.week_end),         // KST 기준
        label: `${formatDate(r.week_start)} ~ ${formatDate(r.week_end)}`
      },
      status: {
        value: r.status,
        text: r.status === 'open' ? '신청 중' :
          r.status === 'assigned' ? '배정 완료' : '마감'
      }
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '스케줄 목록 조회 실패' });
  }
});

// --- 2. 관리자: 스케줄 생성 ---
// server/routes/schedule.js
router.post('/', authMiddleware, storeAdmin, async (req, res) => {
  const { store_id, week_start } = req.body;
  if (!store_id || !week_start) return res.status(400).json({ message: '필수 항목 누락' });

  try {
    // 1. week_start가 YYYY-MM-DD 형식인지 확인
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week_start)) {
      return res.status(400).json({ message: '날짜 형식 오류' });
    }

    // 2. 월요일인지 확인 (필수 아님, 선택사항)
    const date = new Date(week_start + 'T00:00:00Z');
    if (date.getUTCDay() !== 1) {
      return res.status(400).json({ message: '월요일 날짜를 선택해주세요.' });
    }

    // 3. 주차 계산
    const weekEnd = new Date(date);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // 4. 중복 체크
    const [existing] = await pool(req).query(
      'SELECT id FROM schedules WHERE store_id = ? AND week_start = ?',
      [store_id, week_start]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: '이미 존재하는 스케줄' });
    }

    // 5. 삽입
    const [result] = await pool(req).query(
      'INSERT INTO schedules (store_id, week_start, week_end, status) VALUES (?, ?, ?, ?)',
      [store_id, week_start, weekEndStr, 'open']
    );

    const [store] = await pool(req).query('SELECT name FROM stores WHERE id = ?', [store_id]);

    res.status(201).json({
      id: result.insertId,
      message: '스케줄 오픈 완료',
      store_name: store[0]?.name,
      period: {
        start: week_start,
        end: weekEndStr,
        label: `${week_start} ~ ${weekEndStr}`
      }
    });
  } catch (err) {
    console.error('스케줄 생성 오류:', err);
    res.status(500).json({ message: '스케줄 생성 실패' });
  }
});

// --- 3. 관리자: 자동 배정 ---
router.post('/:id/auto-assign', authMiddleware, storeAdmin, async (req, res) => {
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
router.delete('/:id', authMiddleware, storeAdmin, async (req, res) => {
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

    // KST 기준 문자열 반환 (시간대 문제 없음)
    const start = schedule[0].week_start.toISOString().split('T')[0];
    const end = schedule[0].week_end.toISOString().split('T')[0];

    res.json({
      is_open: true,
      period: { start, end, label: `${start} ~ ${end}` }
    });
  } catch (err) {
    res.status(500).json({ message: '확인 실패' });
  }
});


// --- 6. 내 스케줄 목록 (신청 여부 포함) ---
// server/routes/schedule.js

// server/routes/schedule.js
router.get('/my-schedules', authMiddleware, async (req, res) => {
  try {
    const [user] = await pool(req).query('SELECT store_id FROM users WHERE id = ?', [req.user.id]);
    if (!user[0]?.store_id) return res.json([]);

    const [rows] = await pool(req).query(`
      SELECT 
        s.id,
        DATE_FORMAT(s.week_start, '%Y-%m-%d') AS week_start,
        DATE_FORMAT(s.week_end, '%Y-%m-%d') AS week_end,
        s.status,
        st.name AS store_name,
        sr.*
      FROM schedule_requests sr
      JOIN schedules s ON sr.schedule_id = s.id
      JOIN stores st ON s.store_id = st.id
      WHERE sr.user_id = ? AND s.store_id = ?
      ORDER BY s.week_start DESC
    `, [req.user.id, user[0].store_id]);

    if (!rows.length) return res.json([]);

    const dayMap = {
      mon: '월', tue: '화', wed: '수', thu: '목',
      fri: '금', sat: '토', sun: '일'
    };

    const result = rows.map(r => {
      // server/routes/schedule.js
      const daily = {};
      for (const [key, day] of Object.entries(dayMap)) {
        const type = r[`${key}_type`] || 'off';
        let time = '휴무';

        if (type === 'full') {
          time = '10:00 ~ 22:00'; // 또는 백엔드에서 매장 운영시간 가져오기
        } else if (type === 'part' && r[`${key}_start`] && r[`${key}_end`]) {
          time = `${formatTime(r[`${key}_start`])} ~ ${formatTime(r[`${key}_end`])}`;
        }

        daily[day] = { type, time, status: r.status };
      }


      return {
        id: r.id,
        store_name: r.store_name,
        week_start: r.week_start,
        week_end: r.week_end,
        label: `${r.week_start} ~ ${r.week_end}`,
        status: {
          value: r.status,
          text: r.status === 'requested' ? '신청됨' :
            r.status === 'assigned' ? '배정됨' :
              r.status === 'confirmed' ? '확정됨' : '취소됨'
        },
        daily
      };
    });

    res.json(result);
  } catch (err) {
    console.error('my-schedules error:', err);
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
// server/routes/schedule.js
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

      // 2. 스케줄 존재 + 'open' 상태 확인 (DATE 타입 비교)
      const [schedule] = await conn.query(
        `SELECT id FROM schedules 
         WHERE store_id = ? AND week_start = ? AND status = 'open'`,
        [store_id, week_start] // week_start는 YYYY-MM-DD 문자열 → MySQL이 자동 변환
      );

      if (!schedule[0]) {
        // 디버깅용 로그
        console.log('스케줄 없음:', { store_id, week_start });
        throw { status: 404, msg: '해당 주차의 스케줄이 없습니다.' };
      }

      const scheduleId = schedule[0].id;

      // 3. 기존 신청 삭제
      await conn.query(
        'DELETE FROM schedule_requests WHERE schedule_id = ? AND user_id = ?',
        [scheduleId, userId]
      );

      // 4. 신규 신청 삽입
      const fields = ['user_id', 'schedule_id'];
      const values = [userId, scheduleId];
      const placeholders = ['?', '?'];

      for (const [key, data] of Object.entries(schedules)) {
        if (!['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].includes(key)) continue;

        const typeField = `${key}_type`;
        const startField = `${key}_start`;
        const endField = `${key}_end`;

        fields.push(typeField, startField, endField);
        placeholders.push('?', '?', '?');
        values.push(data.type || 'off');
        values.push(data.type === 'off' ? null : (data.start || null));
        values.push(data.type === 'off' ? null : (data.end || null));
      }

      const sql = `
        INSERT INTO schedule_requests 
        (${fields.join(', ')})
        VALUES (${placeholders.join(', ')})
      `;

      await conn.query(sql, values);
    });

    res.json({ message: '스케줄 신청 완료!' });
  } catch (err) {
    console.error('schedule post error:', err);
    res.status(err.status || 500).json({ message: err.msg || '신청 실패' });
  }
});


// server/routes/store.js
router.put('/:id/settings/days', authMiddleware, storeAdmin, async (req, res) => {
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
router.post('/:id/auto-assign', authMiddleware, storeAdmin, async (req, res) => {
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
router.get('/:id/preview', authMiddleware, storeAdmin, async (req, res) => {
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

    const [rows] = await pool(req).query(`
      SELECT 
        s.id,
        s.week_start,
        s.week_end,
        st.name AS store_name,
        CASE WHEN sr.id IS NOT NULL THEN 1 ELSE 0 END AS has_applied
      FROM schedules s
      JOIN stores st ON s.store_id = st.id
      LEFT JOIN schedule_requests sr ON s.id = sr.schedule_id AND sr.user_id = ?
      WHERE s.store_id = ? AND s.status = 'open'
      ORDER BY s.week_start DESC
    `, [req.user.id, user[0].store_id]);

    const result = rows.map(r => {
      const start = formatDate(r.week_start);
      const end = formatDate(r.week_end);
      return {
        id: r.id,
        schedule_id: r.id, // 중요!
        store_name: r.store_name,
        period: {
          start,
          end,
          label: `${start} ~ ${end}`,
          week_start: start
        },
        has_applied: r.has_applied === 1
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '오픈 스케줄 조회 실패' });
  }
});

// server/routes/schedule.js
// server/routes/schedule.js
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool(req).query(`
      SELECT 
        s.id,
        DATE_FORMAT(s.week_start, '%Y-%m-%d') AS week_start,
        DATE_FORMAT(s.week_end, '%Y-%m-%d') AS week_end,
        s.store_id,
        st.name AS store_name
      FROM schedules s
      JOIN stores st ON s.store_id = st.id
      WHERE s.id = ?
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: '스케줄 없음' });

    const r = rows[0];

    res.json({
      id: r.id,
      store_id: r.store_id,
      store_name: r.store_name,
      week_start: r.week_start, // "2025-11-10"
      week_end: r.week_end      // "2025-11-16"
    });
  } catch (err) {
    console.error('스케줄 조회 오류:', err);
    res.status(500).json({ message: '조회 실패' });
  }
});

// server/routes/schedule.js
router.get('/:id/applicants', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool(req).query(`
      SELECT 
        u.name,
        u.userId,
        u.phone,
        sr.mon_type, sr.mon_start, sr.mon_end,
        sr.tue_type, sr.tue_start, sr.tue_end,
        sr.wed_type, sr.wed_start, sr.wed_end,
        sr.thu_type, sr.thu_start, sr.thu_end,
        sr.fri_type, sr.fri_start, sr.fri_end,
        sr.sat_type, sr.sat_start, sr.sat_end,
        sr.sun_type, sr.sun_start, sr.sun_end
      FROM schedule_requests sr
      JOIN users u ON sr.user_id = u.id
      WHERE sr.schedule_id = ?
      ORDER BY u.name
    `, [id]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: '신청자 조회 실패' });
  }
});

module.exports = router;