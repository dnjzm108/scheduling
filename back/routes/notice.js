// server/routes/notice.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { storeAdmin } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');

/* ==============================
   📌 공통: 관리자 허용 매장 조회
   - level 3: 자기 매장 + admin_store_access
   - level 4: 모든 매장
================================ */
const getAllowedStoresForAdmin = async (req) => {
  const db = pool(req);
  const { level, id, store_id } = req.user;

  // 총관리자: 모든 매장
  if (level === 4) {
    const [rows] = await db.query('SELECT id FROM stores');
    return rows.map(r => r.id);
  }

  // 매장관리자: 자기 매장 + admin_store_access 에 등록된 매장
  if (level === 3) {
    const [rows] = await db.query(
      'SELECT store_id FROM admin_store_access WHERE admin_user_id = ?',
      [id]
    );
    const extra = rows.map(r => r.store_id);
    const base = store_id ? [store_id] : [];
    // 중복 제거
    return Array.from(new Set([...base, ...extra]));
  }

  return [];
};

// 업로드 설정 - 이미지만 허용
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => {
      const dir = path.join(__dirname, '../Uploads');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${unique}-${file.originalname}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('이미지 파일만 가능합니다.'));
    }
    cb(null, true);
  }
});

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

const logAudit = (conn, action, actor, id, details) =>
  conn.query(
    `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
     VALUES (?, ?, 'notice', ?, ?, NOW())`,
    [action, actor, id, JSON.stringify(details)]
  );

/* ========================================
   📌 공지 목록 조회 (권한 + 매장 필터)
======================================== */
router.get('/', authMiddleware, async (req, res) => {
  const { store_id } = req.query;
  const user = req.user;

  try {
    let sql = `
      SELECT n.*, u.name AS author_name, s.name AS store_name
      FROM notices n
      JOIN users u ON n.author_id = u.id
      LEFT JOIN stores s ON s.id = n.store_id
      WHERE 1=1
    `;
    const params = [];

    // 🔹 알바/직원: 본인 매장 + 전체 공지, visibility 제한
    if (user.level === 1 || user.level === 2) {
      sql += ` AND (n.store_id IS NULL OR n.store_id = ?)`;
      params.push(user.store_id);

      sql += ` AND n.visibility IN ('all','employees')`;
    }
    // 🔹 매장관리자
    else if (user.level === 3) {
      const allowedStores = await getAllowedStoresForAdmin(req);
      if (!allowedStores.length) {
        // 관리 가능한 매장이 하나도 없으면 빈 배열
        return res.json([]);
      }

      if (store_id) {
        const targetId = Number(store_id);
        if (!allowedStores.includes(targetId)) {
          return res.status(403).json({ message: '해당 매장 공지 조회 권한 없음' });
        }
        sql += ` AND (n.store_id IS NULL OR n.store_id = ?)`;
        params.push(targetId);
      } else {
        // 여러 매장 권한 → IN 조건
        sql += ` AND (n.store_id IS NULL OR n.store_id IN (?))`;
        params.push(allowedStores);
      }
      // visibility: 관리자이므로 admin 전용 포함 전체 조회
    }
    // 🔹 총관리자
    else if (user.level >= 4) {
      if (store_id) {
        sql += ` AND (n.store_id IS NULL OR n.store_id = ?)`;
        params.push(store_id);
      }
      // store_id 없으면 전체 매장 + 전체 공지
    }

    sql += ` ORDER BY n.published_at DESC`;

    const [rows] = await pool(req).query(sql, params);

    res.json(
      rows.map(r => {
        let attachments = [];
        if (r.attachments) {
          try {
            attachments = JSON.parse(r.attachments);
          } catch {
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
    console.error('[/notices] GET Error:', err);
    res.status(500).json({ message: '공지 조회 실패' });
  }
});

/* ========================================
   📌 공지 생성 - 매장관리자 이상
   - 첨부파일: [{ url, name, mimeType }]
======================================== */
router.post(
  '/',
  authMiddleware,
  storeAdmin,               // level 3(매장관리자) 이상
  upload.array('attachments', 3),
  async (req, res) => {
    const { title, body, store_id, visibility = 'all' } = req.body;
    const user = req.user;

    if (!title?.trim()) {
      return res.status(400).json({ message: '제목은 필수입니다.' });
    }

    // 첨부파일 메타 구성
    const files = (req.files || []).map(f => ({
      url: `/Uploads/${f.filename}`,
      name: f.originalname,
      mimeType: f.mimetype
    }));

    try {
      const result = await withTx(req, async (conn) => {
        let targetStoreId = store_id ? Number(store_id) : null;

        // 매장관리자는 본인/권한매장만
        if (user.level === 3) {
          const allowedStores = await getAllowedStoresForAdmin(req);
          // store_id 없으면 기본 자기 매장으로 고정
          if (!targetStoreId) {
            targetStoreId = user.store_id;
          }
          if (!allowedStores.includes(targetStoreId)) {
            throw { status: 403, msg: '해당 매장 공지 작성 권한 없음' };
          }
        }

        // 총관리자(4)는 모든 매장 가능, store_id 없으면 전체 공지(null)

        const [insert] = await conn.query(
          `INSERT INTO notices 
           (title, body, store_id, attachments, author_id, visibility, published_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [
            title.trim(),
            body || '',
            targetStoreId || null,
            JSON.stringify(files),
            user.id,
            visibility
          ]
        );

        await logAudit(conn, 'notice_create', user.id, insert.insertId, { title });

        return {
          id: insert.insertId,
          attachments: files
        };
      });

      res.status(201).json({
        message: '공지사항 등록 완료',
        ...result
      });
    } catch (err) {
      console.error('[/notices] POST Error:', err);
      if (err.status) {
        return res.status(err.status).json({ message: err.msg });
      }
      res.status(500).json({ message: '등록 실패' });
    }
  }
);

/* ========================================
   📌 공지 삭제 - 매장관리자 이상
======================================== */
router.delete('/:id', authMiddleware, storeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await withTx(req, async (conn) => {
      const [[origin]] = await conn.query(`SELECT * FROM notices WHERE id = ?`, [id]);
      if (!origin) throw { status: 404, msg: '공지 없음' };

      // 🔒 매장관리자 권한 매장 여부 체크
      if (req.user.level === 3) {
        const allowedStores = await getAllowedStoresForAdmin(req);
        const storeId = origin.store_id; // null(전체)일 수도
        // 전체 공지는 삭제 불가로 막고 싶으면 여기서 처리
        if (storeId && !allowedStores.includes(storeId)) {
          throw { status: 403, msg: '해당 매장 공지 삭제 권한 없음' };
        }
      }

      await conn.query(`DELETE FROM notices WHERE id=?`, [id]);
      await logAudit(conn, 'notice_delete', req.user.id, id, { title: origin.title });
    });

    res.json({ message: '삭제 완료' });
  } catch (err) {
    console.error('[/notices] DELETE Error:', err);
    res.status(err.status || 500).json({ message: err.msg || '삭제 실패' });
  }
});

module.exports = router;
