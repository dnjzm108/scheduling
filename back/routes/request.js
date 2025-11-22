// server/routes/request.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { storeAdmin, employee } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');

// 파일 업로드 (이미지 등 파일 허용)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => {
      const dir = path.join(__dirname, '../Uploads');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// 트랜잭션 + 감사 로그
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

const logAudit = (conn, action, actorId, targetId, details) =>
  conn.query(
    `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
     VALUES (?, ?, 'request', ?, ?, NOW())`,
    [action, actorId, targetId, JSON.stringify(details)]
  );

/** 🔥 공통: 이 유저가 접근 가능한 매장 ID 목록 */
async function getAllowedStores(req) {
  const db = pool(req);
  const user = req.user;

  // 총관리자 (level 4): admin_store_access에 등록된 매장이 있으면 그 매장,
  // 없으면 모든 매장
  if (user.level === 4) {
    const [rows] = await db.query(
      'SELECT store_id FROM admin_store_access WHERE admin_user_id = ?',
      [user.id]
    );
    if (rows.length > 0) {
      return rows.map(r => r.store_id);
    }
    const [allStores] = await db.query('SELECT id FROM stores');
    return allStores.map(s => s.id);
  }

  // 매장관리자 (level 3): 본인 store_id + admin_store_access 추가 매장
  if (user.level === 3) {
    const [[me]] = await db.query(
      'SELECT store_id FROM users WHERE id = ?',
      [user.id]
    );
    const baseStoreId = me?.store_id || null;

    const [extra] = await db.query(
      'SELECT store_id FROM admin_store_access WHERE admin_user_id = ?',
      [user.id]
    );

    const set = new Set();
    if (baseStoreId) set.add(baseStoreId);
    extra.forEach(r => set.add(r.store_id));

    return [...set];
  }

  // 그 외 관리자 (level 2): 본인 store_id만
  if (user.level === 2) {
    const [[me]] = await db.query(
      'SELECT store_id FROM users WHERE id = ?',
      [user.id]
    );
    return me?.store_id ? [me.store_id] : [];
  }

  // 직원/미승인 등
  return [];
}

/* =========================================================
   1. 건의사항 목록
   - 직원: 본인 매장만
   - 매장관리자/총관리자: 권한 있는 매장 범위 내에서만 조회
========================================================= */
router.get('/', authMiddleware, async (req, res) => {
  const { store_id } = req.query;
  const { level, store_id: userStoreId } = req.user;

  try {
    let sql = `
      SELECT r.*, u.name AS author_name, s.name AS store_name
      FROM requests r
      JOIN users u ON r.author_id = u.id
      LEFT JOIN stores s ON r.store_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (level === 1) {
      // 직원: 본인 매장만
      sql += ' AND r.store_id = ?';
      params.push(userStoreId);
    } else {
      // 관리자 이상: allowedStores 기준
      const allowedStores = await getAllowedStores(req);

      if (!allowedStores.length) {
        return res.json([]);
      }

      let filterStoreId = null;
      if (store_id) {
        const sid = Number(store_id);
        if (allowedStores.includes(sid)) {
          filterStoreId = sid;
        }
      }

      if (filterStoreId) {
        sql += ' AND r.store_id = ?';
        params.push(filterStoreId);
      } else {
        sql += ' AND r.store_id IN (?)';
        params.push(allowedStores);
      }
    }

    sql += ' ORDER BY r.created_at DESC';
    const [rows] = await pool(req).query(sql, params);

    // 🔥 attachments 를 서버에서 배열로 변환해서 내려줌
    res.json(
      rows.map(r => {
        let attachments = [];
        if (r.attachments) {
          try {
            attachments = JSON.parse(r.attachments);
          } catch (e) {
            attachments = [];
          }
        }
        return {
          ...r,
          attachments
        };
      })
    );
  } catch (err) {
    console.error('[/requests] GET Error:', err);
    res.status(500).json({ message: '건의사항 조회 실패' });
  }
});

/* =========================================================
   2. 내 건의사항 (직원 이상)
========================================================= */
router.get('/my-requests', authMiddleware, employee, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT r.*, s.name AS store_name
       FROM requests r
       LEFT JOIN stores s ON r.store_id = s.id
       WHERE r.author_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json(
      rows.map(r => {
        let attachments = [];
        if (r.attachments) {
          try {
            attachments = JSON.parse(r.attachments);
          } catch (e) {
            attachments = [];
          }
        }
        return {
          ...r,
          created_at: new Date(r.created_at).toLocaleString('ko-KR'),
          attachments
        };
      })
    );
  } catch (err) {
    res.status(500).json({ message: '내 건의사항 조회 실패' });
  }
});

/* =========================================================
   3. 건의사항 제출 (직원 이상)
   - 필드명: attachments
========================================================= */
router.post('/', authMiddleware, employee, upload.array('attachments', 3), async (req, res) => {
  const { title, body } = req.body;
  const files = req.files?.map(f => `/Uploads/${f.filename}`) || [];

  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ message: '제목과 내용을 입력하세요.' });
  }

  try {
    const result = await withTransaction(req, async (conn) => {
      const [insert] = await conn.query(
        `INSERT INTO requests 
         (title, body, store_id, attachments, author_id, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [title, body, req.user.store_id, JSON.stringify(files), req.user.id]
      );

      await logAudit(conn, 'request_create', req.user.id, insert.insertId, { title });
      return { id: insert.insertId };
    });

    res.status(201).json({ message: '건의사항 제출 완료!', ...result });
  } catch (err) {
    console.error('[/requests] POST Error:', err);
    res.status(500).json({ message: '제출 실패' });
  }
});

/* =========================================================
   4. 건의사항 삭제 (매장관리자 이상)
========================================================= */
router.delete('/:id', authMiddleware, storeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await withTransaction(req, async (conn) => {
      const [request] = await conn.query(
        `SELECT id, title FROM requests WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (!request[0]) throw { status: 404, msg: '건의사항 없음' };

      await conn.query(`DELETE FROM requests WHERE id = ?`, [id]);
      await logAudit(conn, 'request_delete', req.user.id, id, { title: request[0].title });

      return { id: parseInt(id, 10) };
    });

    res.json({ message: '건의사항 삭제 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '삭제 실패' });
  }
});

module.exports = router;
