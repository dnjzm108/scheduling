// server/routes/schedule.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { storeAdmin } = require('../middleware/levelMiddleware');
const { formatDate, formatTime } = require('../utils/date');

const pool = (req) => req.app.get('db');

// 트랜잭션 헬퍼
const withTx = async (req, fn) => {
  const conn = await pool(req).getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// 안전한 시간 변환 함수
function safeTime(value) {
  if (!value || value === "" || value === "null") return null;
  if (/^\d{2}:\d{2}$/.test(value)) return value + ":00";  // HH:MM → HH:MM:00
  return null;
}


const getKDay = (d) => ['일', '월', '화', '수', '목', '금', '토'][new Date(d).getDay()];
const statusText = (s) =>
  s === 'open' ? '신청 중' :
    s === 'assigned' ? '배정 완료' :
      s === 'closed' ? '마감' : s;

// 🔹 관리자 권한별 관리 가능한 매장 목록 조회
async function getAllowedStores(req) {
  const conn = pool(req);
  const user = req.user;

  // 총관리자: 모든 매장
  if (user.level === 4) {
    const [[{ count }]] = await conn.query(`SELECT COUNT(*) AS count FROM stores`);
    if (count > 0) {
      const [rows] = await conn.query(`SELECT id FROM stores`);
      return rows.map(r => r.id);
    }
    return [];
  }

  // 매장관리자: 자기 매장 + 부여받은 매장 목록
  if (user.level === 3) {
    const [extra] = await conn.query(
      `SELECT store_id FROM admin_store_access WHERE admin_user_id = ?`,
      [user.id]
    );
    return [user.store_id, ...extra.map(r => r.store_id)];
  }

  // 직원 및 그 이하: 자기 매장만
  return [user.store_id];
}

/* =========================================================
   1. 관리자 스케줄 목록 조회 (정렬 + 페이지네이션)
========================================================= */
router.get('/', authMiddleware, storeAdmin, async (req, res) => {
  try {
    const {
      store_id,
      page = 1,
      pageSize = 10,
      sort = 'desc',  // 'desc' = 최신순, 'asc' = 오래된순
    } = req.query;

    const allowedStores = await getAllowedStores(req);
    if (!allowedStores.length) return res.json({ total: 0, page: 1, pageSize: Number(pageSize), pages: 0, items: [] });

    const filterStoreId = store_id ? Number(store_id) : null;
    if (filterStoreId && !allowedStores.includes(filterStoreId)) {
      return res.status(403).json({ message: '해당 매장 관리 권한 없음' });
    }

    const sortOrder = sort === 'asc' ? 'ASC' : 'DESC';
    const limit = Number(pageSize);
    const offset = (Number(page) - 1) * limit;

    const params = [allowedStores];
    let whereStore = 's.store_id IN (?)';
    if (filterStoreId) {
      whereStore += ' AND s.store_id = ?';
      params.push(filterStoreId);
    }

    // 전체 개수
    const [[{ total }]] = await pool(req).query(
      `SELECT COUNT(*) AS total FROM schedules s WHERE ${whereStore}`,
      params
    );

    // 목록 조회
    params.push(limit, offset);

    const [rows] = await pool(req).query(
      `
      SELECT 
        s.id, s.week_start, s.week_end, s.status,
        s.work_area,
        st.name AS store_name
      FROM schedules s
      JOIN stores st ON s.store_id = st.id
      WHERE ${whereStore}
      ORDER BY s.week_start ${sortOrder}
      LIMIT ? OFFSET ?
      `,
      params
    );

    res.json({
      total,
      page: Number(page),
      pageSize: limit,
      pages: Math.ceil(total / limit),
      items: rows.map((r) => ({
        id: r.id,
        store_name: r.store_name,
        work_area: r.work_area || 'both',
        period: {
          start: formatDate(r.week_start),
          end: formatDate(r.week_end),
          label: `${formatDate(r.week_start)} ~ ${formatDate(r.week_end)}`
        },
        status: { value: r.status, text: statusText(r.status) }
      }))
    });
  } catch (err) {
    console.error('스케줄 목록 오류:', err);
    res.status(500).json({ message: '스케줄 목록 조회 실패' });
  }
});

/* =========================================================
   2. 관리자 스케줄 생성 (work_area: hall/kitchen/both)
   - 같은 날짜에 (hall + kitchen) 조합만 허용
   - (hall, both) / (kitchen, both) / (both, both) 금지
========================================================= */
router.post('/', authMiddleware, storeAdmin, async (req, res) => {
  const { store_id, week_start, work_area } = req.body;

  if (!store_id || !week_start) {
    return res.status(400).json({ message: '필수 항목 누락' });
  }

  try {
    const allowedStores = await getAllowedStores(req);
    if (!allowedStores.includes(Number(store_id))) {
      return res.status(403).json({ message: '해당 매장 관리 권한 없음' });
    }

    const area = work_area || 'both';

    // 이미 같은 매장+시작일에 존재하는 스케줄 확인
    const [existing] = await pool(req).query(
      'SELECT id, work_area FROM schedules WHERE store_id = ? AND week_start = ?',
      [store_id, week_start]
    );

    if (existing.length > 0) {
      // 이미 1개 이상 존재 → 규칙 확인
      const existingAreas = existing.map(r => r.work_area);

      // 이미 both가 있으면 어떤 area도 추가 불가
      if (existingAreas.includes('both')) {
        return res.status(400).json({
          message: '이미 전체(홀+주방) 스케줄이 있어 추가 생성이 불가합니다.'
        });
      }

      // 새로 만드는 것이 both인 경우에도 안됨
      if (area === 'both') {
        return res.status(400).json({
          message: '이미 홀/주방 스케줄이 있어 전체 스케줄 생성이 불가합니다.'
        });
      }

      // hall / kitchen 조합은 최대 2개까지만 허용 (hall, kitchen)
      if (existingAreas.includes(area)) {
        return res.status(409).json({ message: '이미 동일 구역 스케줄이 존재합니다.' });
      }
    }

    const start = new Date(`${week_start}T00:00:00Z`);
    if (start.getUTCDay() !== 1) {
      return res.status(400).json({ message: '월요일을 선택하세요.' });
    }

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const weekEndStr = end.toISOString().split('T')[0];

    const [result] = await pool(req).query(
      `
      INSERT INTO schedules (store_id, week_start, week_end, status, work_area)
      VALUES (?, ?, ?, 'open', ?)
      `,
      [store_id, week_start, weekEndStr, area]
    );

    res.status(201).json({
      id: result.insertId,
      period: {
        start: week_start,
        end: weekEndStr,
        label: `${week_start} ~ ${weekEndStr}`
      },
      work_area: area
    });
  } catch (err) {
    console.error('스케줄 생성 실패:', err);
    res.status(500).json({ message: '스케줄 생성 실패' });
  }
});

/* =========================================================
   3. 직원용 - 오픈된 스케줄 조회 (홀/주방 필터 반영)
========================================================= */
router.get('/open', authMiddleware, async (req, res) => {
  try {
    const conn = await pool(req).getConnection();
    try {
      const [[me]] = await conn.query(
        'SELECT store_id, work_area FROM users WHERE id = ?',
        [req.user.id]
      );

      if (!me || !me.store_id) return res.json([]);

      const myStore = me.store_id;
      const myArea = me.work_area || 'both';

      const [rows] = await conn.query(
        `
        SELECT 
          s.id, s.week_start, s.week_end, s.status,
          s.work_area,
          st.name AS store_name,
          (sr.id IS NOT NULL) AS has_applied
        FROM schedules s
        JOIN stores st ON s.store_id = st.id
        LEFT JOIN schedule_requests sr
          ON sr.schedule_id = s.id AND sr.user_id = ?
        WHERE s.store_id = ? AND s.status = 'open'
        ORDER BY s.week_start DESC
        `,
        [req.user.id, myStore]
      );

      const filtered = rows.filter((r) => {
        const area = r.work_area || 'both';
        if (myArea === 'both') return true;
        if (area === 'both') return true;
        return area === myArea;
      });

      res.json(
        filtered.map((r) => ({
          id: r.id,
          schedule_id: r.id,
          store_name: r.store_name,
          work_area: r.work_area || 'both',
          period: {
            start: formatDate(r.week_start),
            end: formatDate(r.week_end),
            label: `${formatDate(r.week_start)} ~ ${formatDate(r.week_end)}`
          },
          has_applied: !!r.has_applied
        }))
      );
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('오픈 스케줄 오류:', err);
    res.status(500).json({ message: '오픈 스케줄 조회 실패' });
  }
});

/* =========================================================
   4. 직원 스케줄 신청
========================================================= */
router.post('/schedule', authMiddleware, async (req, res) => {
  const { week_start, store_id, schedules, schedule_id } = req.body;
  console.log(week_start, store_id, schedules, schedule_id);

  const userId = req.user.id;

  if (!week_start || !store_id || !schedules) {
    return res.status(400).json({ message: '필수 항목 누락' });
  }

  try {
    await withTx(req, async (conn) => {
      const [[user]] = await conn.query(
        'SELECT store_id FROM users WHERE id = ?',
        [userId]
      );

      if (!user || user.store_id !== Number(store_id)) {
        throw { status: 403, msg: '본인 매장만 신청 가능' };
      }

      const [[sched]] = await conn.query(
        `SELECT id FROM schedules WHERE store_id = ? AND week_start = ? AND status = 'open'`,
        [store_id, week_start]
      );

      if (!sched) throw { status: 404, msg: '해당 주 스케줄 없음' };


      await conn.query(
        'DELETE FROM schedule_requests WHERE schedule_id = ? AND user_id = ?',
        [schedule_id, userId]
      );

      const fields = ['user_id', 'schedule_id'];
      const values = [userId, schedule_id];
      const ph = ['?', '?'];

      for (const [day, v] of Object.entries(schedules)) {
        fields.push(`${day}_type`, `${day}_start`, `${day}_end`);
        ph.push('?', '?', '?');
        values.push(v.type || 'off');
        values.push(v.type === 'off' ? null : v.start || null);
        values.push(v.type === 'off' ? null : v.end || null);
      }

      await conn.query(
        `INSERT INTO schedule_requests (${fields.join(',')}) VALUES (${ph.join(',')})`,
        values
      );
    });

    res.json({ message: '스케줄 신청 완료' });
  } catch (err) {
    console.error('신청 오류:', err);
    res.status(err.status || 500).json({ message: err.msg || '신청 실패' });
  }
});

/* =========================================================
   5. 직원 - 내가 신청한 스케줄 조회
========================================================= */
router.get('/my-schedules', authMiddleware, async (req, res) => {
  try {
    const [[me]] = await pool(req).query(
      'SELECT store_id FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!me || !me.store_id) return res.json([]);

    const [rows] = await pool(req).query(
      `
      SELECT s.id, s.week_start, s.week_end, s.status,
             st.name AS store_name, sr.*
      FROM schedule_requests sr
      JOIN schedules s ON s.id = sr.schedule_id
      JOIN stores st ON st.id = s.store_id
      WHERE sr.user_id = ? AND s.store_id = ?
      ORDER BY s.week_start DESC
      `,
      [req.user.id, me.store_id]
    );

    const day = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

    res.json(
      rows.map((r) => {
        const daily = {};
        for (const [key, kor] of Object.entries(day)) {
          const type = r[`${key}_type`] || 'off';
          const start = r[`${key}_start`];
          const end = r[`${key}_end`];

          daily[kor] = {
            type,
            time:
              type === 'full'
                ? '10:00 ~ 22:00'
                : type === 'part' && start && end
                  ? `${formatTime(start)} ~ ${formatTime(end)}`
                  : '휴무'
          };
        }

        return ({
          id: r.id,
          store_name: r.store_name,
          label: `${formatDate(r.week_start)} ~ ${formatDate(r.week_end)}`,
          status: {
            value: r.status,
            text:
              r.status === 'requested'
                ? '신청됨'
                : r.status === 'assigned'
                  ? '배정됨'
                  : '확정됨'
          },
          daily
        });
      })
    );
  } catch (err) {
    console.error('my-schedules 오류:', err);
    res.status(500).json({ message: '내 스케줄 조회 실패' });
  }
});

/* =========================================================
   6. 직원 - 확정된 스케줄 조회
========================================================= */
// =========================================================
// 📌 나의 확정 스케줄 조회 (full-time 안전 처리 완벽 버전)
// =========================================================
router.get('/my-final-schedule', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool(req).query(
      `
      SELECT 
        a.schedule_id,
        a.work_date,
        a.start_time,
        a.end_time,
        a.shift_type,
        a.break_minutes,

        s.week_start,
        s.week_end,
        s.status,
        st.name AS store_name,
        st.open_time,
        st.close_time
      FROM assigned_shifts a
      JOIN schedules s ON s.id = a.schedule_id
      JOIN stores st ON st.id = s.store_id
      WHERE a.user_id = ?
      ORDER BY s.week_start DESC, a.work_date ASC
      `,
      [userId]
    );

    if (!rows.length) return res.json([]);

    const m = new Map();

    for (const r of rows) {

      // 스케줄 묶음 생성
      if (!m.has(r.schedule_id)) {
        m.set(r.schedule_id, {
          id: r.schedule_id,
          store_name: r.store_name,
          label: `${formatDate(r.week_start)} ~ ${formatDate(r.week_end)}`,
          status: {
            value: r.status,
            text: r.status === 'confirmed' ? '확정됨' : '미확정'
          },
          daily: {}
        });
      }

      // ================================
      // 🔥 시간 보정 (full-time 대응)
      // ================================
      let startStr = "";
      let endStr = "";

      if (r.shift_type === "full") {
        // 가게 오픈/마감 시간 적용
        startStr = r.open_time ? r.open_time.slice(0, 5) : "09:00";
        endStr = r.close_time ? r.close_time.slice(0, 5) : "18:00";
      } else {
        // part-time → DB 값 사용
        startStr = r.start_time ? r.start_time.slice(0, 5) : "";
        endStr = r.end_time ? r.end_time.slice(0, 5) : "";
      }

      // ================================
      // 🔥 요일 라벨
      // ================================
      const dayKor = getKDay(r.work_date);

      // ================================
      // 🔥 daily 값 저장
      // ================================
      m.get(r.schedule_id).daily[dayKor] = {
        type: r.shift_type,
        break_minutes: r.break_minutes || 0,
        time: `${startStr} ~ ${endStr}`
      };
    }

    res.json([...m.values()]);
  } catch (err) {
    console.error('my-final-schedule 오류:', err);
    res.status(500).json({ message: '확정 스케줄 조회 실패' });
  }
});


/* =========================================================
   7. 관리자 - 스케줄 확정 저장 (최적화 버전)
========================================================= */
// 쉬는시간 저장 포함된 finalize API

router.post('/:id/finalize', authMiddleware, storeAdmin, async (req, res) => {
  const scheduleId = req.params.id;
  const { shifts } = req.body;

  if (!shifts) {
    return res.status(400).json({ message: "shifts 데이터가 없습니다." });
  }

  try {
    await withTx(req, async (conn) => {
      const [[sched]] = await conn.query(
        `SELECT store_id, week_start, work_area FROM schedules WHERE id = ?`,
        [scheduleId]
      );
      if (!sched) throw { status: 404, msg: "스케줄 없음" };

      const allowedStores = await getAllowedStores({ ...req, app:{ get:()=>conn } });
      if (!allowedStores.includes(sched.store_id)) {
        throw { status: 403, msg: "권한 없음" };
      }

      await conn.query(`DELETE FROM assigned_shifts WHERE schedule_id = ?`, [scheduleId]);

      const dayIndex = { mon:0, tue:1, wed:2, thu:3, fri:4, sat:5, sun:6 };
      const startDate = new Date(sched.week_start);

      const insertData = [];

      for (const [userId, daysObj] of Object.entries(shifts)) {
        for (const [day, info] of Object.entries(daysObj)) {
          if (!info || info.type === "off") continue;

          const idx = dayIndex[day];
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + idx);

          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");

          insertData.push([
            scheduleId,
            Number(userId),
            `${yyyy}-${mm}-${dd}`,
            info.type,
            info.start ? info.start + ":00" : null,
            info.end ? info.end + ":00" : null,
            info.break_minutes ?? 60,
            sched.work_area === "both" ? info.work_area : sched.work_area,
            info.section_name || null,
            info.custom_hourly_rate || null
          ]);
        }
      }

      if (insertData.length > 0) {
        await conn.query(
          `INSERT INTO assigned_shifts
           (schedule_id, user_id, work_date, shift_type, start_time, end_time, break_minutes, work_area, section_name, custom_hourly_rate)
           VALUES ?`,
          [insertData]
        );
      }

      await conn.query(
        `UPDATE schedules SET status='assigned', assigned_at=NOW() WHERE id=?`,
        [scheduleId]
      );
    });

    res.json({ message: "스케줄 확정 완료" });
    
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || "스케줄 확정 실패" });
  }
});


/* =========================================================
   8. 관리자 - 신청자/직원 목록 조회 (해당 매장 전체 직원 + 신청 정보)
========================================================= */
router.get('/:id/applicants', authMiddleware, storeAdmin, async (req, res) => {
  try {
    const scheduleId = req.params.id;

    const [[sched]] = await pool(req).query(
      'SELECT store_id, work_area FROM schedules WHERE id = ?',
      [scheduleId]
    );
    if (!sched) return res.status(404).json({ message: '스케줄 없음' });

    const allowedStores = await getAllowedStores(req);
    if (!allowedStores.includes(sched.store_id)) {
      return res.status(403).json({ message: '해당 매장 관리 권한 없음' });
    }

    const [rows] = await pool(req).query(
      `
      SELECT 
        u.id,
        u.name,
        u.work_area,
        u.level,
        u.hire_date,
        sr.mon_type, sr.mon_start, sr.mon_end,
        sr.tue_type, sr.tue_start, sr.tue_end,
        sr.wed_type, sr.wed_start, sr.wed_end,
        sr.thu_type, sr.thu_start, sr.thu_end,
        sr.fri_type, sr.fri_start, sr.fri_end,
        sr.sat_type, sr.sat_start, sr.sat_end,
        sr.sun_type, sr.sun_start, sr.sun_end
      FROM users u
      JOIN schedules s ON s.store_id = u.store_id AND s.id = ?
      LEFT JOIN schedule_requests sr
        ON sr.user_id = u.id AND sr.schedule_id = s.id
      WHERE u.store_id = s.store_id
        AND u.is_active = 1
        AND u.level IN (1,2,3)
        AND (
          s.work_area = 'both'
          OR u.work_area IS NULL
          OR u.work_area = 'both'
          OR u.work_area = s.work_area
        )
      ORDER BY 
        u.level DESC,
        (u.work_area = 'both') DESC,
        u.hire_date ASC
      `,
      [scheduleId]
    );

    res.json(rows);
  } catch (err) {
    console.error('신청자 조회 오류:', err);
    res.status(500).json({ message: '신청자 조회 실패' });
  }
});

/* =========================================================
   9. 특정 스케줄 기본 정보 조회 (work_area 포함)
========================================================= */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const [[sched]] = await pool(req).query(
      'SELECT store_id FROM schedules WHERE id = ?',
      [id]
    );
    if (!sched) {
      return res.status(404).json({ message: '스케줄 없음' });
    }

    const allowedStores = await getAllowedStores(req);
    if (!allowedStores.includes(sched.store_id)) {
      return res.status(403).json({ message: '해당 매장 관리 권한 없음' });
    }

    const [rows] = await pool(req).query(
      `
      SELECT 
        s.id,
        DATE_FORMAT(s.week_start, '%Y-%m-%d') AS week_start,
        DATE_FORMAT(s.week_end, '%Y-%m-%d') AS week_end,
        s.store_id,
        s.work_area,
        st.name AS store_name
      FROM schedules s
      JOIN stores st ON s.store_id = st.id
      WHERE s.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: '스케줄 없음' });
    }

    const r = rows[0];

    res.json({
      id: r.id,
      store_id: r.store_id,
      store_name: r.store_name,
      week_start: r.week_start,
      week_end: r.week_end,
      work_area: r.work_area || 'both'
    });
  } catch (err) {
    console.error('스케줄 조회 오류:', err);
    res.status(500).json({ message: '조회 실패' });
  }
});

/* =========================================================
   10. 자동 배치 (auto-assign) + 영업시간 제한
========================================================= */
router.post('/:id/auto-assign', authMiddleware, storeAdmin, async (req, res) => {
  const scheduleId = req.params.id;

  try {
    await withTx(req, async (conn) => {
      const [[sched]] = await conn.query(
        `
        SELECT s.id, s.store_id, s.week_start, st.open_time, st.close_time
        FROM schedules s
        JOIN stores st ON st.id = s.store_id
        WHERE s.id = ?
        `,
        [scheduleId]
      );

      if (!sched) throw { status: 404, msg: '스케줄 없음' };

      const allowedStores = await getAllowedStores({ ...req, app: { get: () => conn } });
      if (!allowedStores.includes(sched.store_id)) {
        throw { status: 403, msg: '해당 매장 관리 권한 없음' };
      }

      const openTime = sched.open_time || '10:00:00';
      const closeTime = sched.close_time || '22:00:00';

      await conn.query('DELETE FROM assigned_shifts WHERE schedule_id = ?', [scheduleId]);

      const [requests] = await conn.query(
        `
        SELECT *
        FROM schedule_requests
        WHERE schedule_id = ?
        `,
        [scheduleId]
      );

      if (!requests.length) {
        throw { status: 400, msg: '신청한 직원이 없습니다.' };
      }

      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const dayOffset = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

      const start = new Date(sched.week_start);
      const tasks = [];

      for (const r of requests) {
        for (const day of dayKeys) {
          const type = r[`${day}_type`];
          let st = r[`${day}_start`];
          let et = r[`${day}_end`];

          if (!type || type === 'off') continue;

          if (type === 'full') {
            st = openTime;
            et = closeTime;
          }

          if (!st || !et) continue;

          if (st < openTime) st = openTime;
          if (et > closeTime) et = closeTime;
          if (et <= st) continue;

          const d = new Date(sched.week_start);
          d.setDate(d.getDate() + dayOffset[day]);

          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;  // "2025-11-24" 이런식

          tasks.push(
            conn.query(
              `
              INSERT INTO assigned_shifts
              (schedule_id, user_id, work_date, shift_type, start_time, end_time, break_minutes)
              VALUES (?, ?, ?, ?, ?, ?, 60)
              `,
              [scheduleId, r.user_id, dateStr, type === 'full' ? 'full' : 'part', st, et]
            )
          );
        }
      }

      if (tasks.length) {
        await Promise.all(tasks);
      } else {
        throw { status: 400, msg: '배정 가능한 근무가 없습니다.' };
      }

      await conn.query(
        'UPDATE schedules SET status = "assigned", assigned_at = NOW() WHERE id = ?',
        [scheduleId]
      );
    });

    res.json({ message: '자동 배치 완료' });
  } catch (err) {
    console.error('자동 배치 오류:', err);
    res.status(err.status || 500).json({ message: err.msg || '자동 배치 실패' });
  }
});

/* =========================================================
   11. 주단위 인건비율 리포트
========================================================= */
router.get('/:id/labor-report', authMiddleware, storeAdmin, async (req, res) => {
  const scheduleId = req.params.id;

  try {
    const conn = await pool(req).getConnection();
    try {
      const [[sched]] = await conn.query(
        `
        SELECT s.id, s.store_id, s.week_start, s.week_end, st.name AS store_name
        FROM schedules s
        JOIN stores st ON st.id = s.store_id
        WHERE s.id = ?
        `,
        [scheduleId]
      );

      if (!sched) {
        return res.status(404).json({ message: '스케줄 없음' });
      }

      const allowedStores = await getAllowedStores(req);
      if (!allowedStores.includes(sched.store_id)) {
        return res.status(403).json({ message: '해당 매장 관리 권한 없음' });
      }

      const [laborRows] = await conn.query(
        `
        SELECT 
          a.user_id,
          SUM(a.final_minutes) AS minutes,
          es.salary_type,
          es.hourly_rate
        FROM assigned_shifts a
        LEFT JOIN employee_salary es ON es.user_id = a.user_id
        WHERE a.schedule_id = ?
        GROUP BY a.user_id, es.salary_type, es.hourly_rate
        `,
        [scheduleId]
      );

      let totalMinutes = 0;
      let totalLaborCost = 0;

      for (const r of laborRows) {
        const minutes = r.minutes || 0;
        totalMinutes += minutes;

        const hourly = r.hourly_rate || 0;
        const cost = (minutes / 60) * hourly;
        totalLaborCost += cost;
      }

      const [salesRows] = await conn.query(
        `
        SELECT SUM(sales_amount) AS total_sales
        FROM store_daily_sales
        WHERE store_id = ? AND sales_date BETWEEN ? AND ?
        `,
        [sched.store_id, sched.week_start, sched.week_end]
      );

      const totalSales = salesRows[0]?.total_sales || 0;
      const laborRate = totalSales > 0
        ? Number(((totalLaborCost / totalSales) * 100).toFixed(1))
        : 0;

      res.json({
        schedule_id: sched.id,
        store_id: sched.store_id,
        store_name: sched.store_name,
        week_start: formatDate(sched.week_start),
        week_end: formatDate(sched.week_end),
        totalMinutes,
        totalHours: Number((totalMinutes / 60).toFixed(1)),
        totalLaborCost: Math.round(totalLaborCost),
        totalSales,
        laborRate
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('labor-report 오류:', err);
    res.status(500).json({ message: '인건비 리포트 조회 실패' });
  }
});

router.get('/:id/assigned', authMiddleware, storeAdmin, async (req, res) => {
  try {
    const scheduleId = req.params.id;

    const [rows] = await pool(req).query(`
      SELECT 
        a.user_id,
        a.work_date,
        a.shift_type,
        a.start_time,
        a.end_time,
        a.work_area,
        a.section_name,
        a.custom_hourly_rate,
        a.break_minutes
      FROM assigned_shifts a
      WHERE a.schedule_id = ?
      ORDER BY a.work_date ASC
    `, [scheduleId]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '확정 스케줄 조회 실패' });
  }
});


// ===============================================
// 📌 스케줄 삭제 API
// DELETE /api/schedules/:id
// ===============================================
router.delete('/:id', authMiddleware, async (req, res) => {
  const scheduleId = req.params.id;
  const userId = req.user.id;
  const userLevel = req.user.level;

  const conn = await pool(req).getConnection();

  try {
    // 스케줄 존재 여부 확인
    const [[schedule]] = await conn.query(
      `SELECT id, store_id FROM schedules WHERE id = ?`,
      [scheduleId]
    );

    if (!schedule) {
      return res.status(404).json({ message: "해당 스케줄을 찾을 수 없습니다." });
    }

    // 🔥 권한 체크
    if (userLevel === 3) {
      // 매장 관리자 → 자기 매장만 삭제 가능
      const [[me]] = await conn.query(
        `SELECT store_id FROM users WHERE id = ?`,
        [userId]
      );

      if (!me || me.store_id !== schedule.store_id) {
        return res.status(403).json({ message: "해당 매장 스케줄을 삭제할 권한이 없습니다." });
      }
    }

    // 총관리자(level 4)는 모든 스케줄 삭제 가능

    // 🔥 삭제 처리 (assigned_shifts → schedules 순)
    await conn.beginTransaction();

    await conn.query(
      `DELETE FROM assigned_shifts WHERE schedule_id = ?`,
      [scheduleId]
    );

    await conn.query(
      `DELETE FROM schedules WHERE id = ?`,
      [scheduleId]
    );

    await conn.commit();

    res.json({ message: "스케줄 삭제 완료" });

  } catch (err) {
    await conn.rollback();
    console.error("스케줄 삭제 오류:", err);
    res.status(500).json({ message: "스케줄 삭제 실패", error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
