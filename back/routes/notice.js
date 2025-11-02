// server/routes/notice.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const pool = (req) => req.app.get('db');

// --- 파일 업로드 설정 (최대 3개, 5MB, 이미지 전용) ---
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../Uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('이미지만 업로드 가능'));
    cb(null, true);
  }
});

// --- 트랜잭션 헬퍼 ---
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

// --- 감사 로그 기록 ---
const logAudit = async (conn, action, actorId, targetId, details) => {
  await conn.query(
    `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
     VALUES (?, ?, 'notice', ?, ?, NOW())`,
    [action, actorId, targetId, JSON.stringify(details)]
  );
};

// --- 1. 공지사항 목록 조회 (일반: 본인 매장만, 관리자: 필터 가능) ---
router.get('/', authMiddleware, async (req, res) => {
  const { store_id } = req.query;
  try {
    const [user] = await pool(req).query(
      'SELECT store_id, isAdmin FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user[0]) return res.status(404).json({ message: '사용자 없음' });

    const { isAdmin, store_id: userStoreId } = user[0];
    let sql = `
      SELECT n.*, u.name AS author_name
      FROM notices n
      JOIN users u ON n.author_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // 일반 사용자는 본인 매장 공지만
    if (!isAdmin) {
      sql += ' AND (n.store_id IS NULL OR n.store_id = ?)';
      params.push(userStoreId);
    }
    // 관리자는 선택한 매장만
    else if (store_id) {
      sql += ' AND (n.store_id IS NULL OR n.store_id = ?)';
      params.push(store_id);
    }

    sql += ' ORDER BY n.published_at DESC';
    const [rows] = await pool(req).query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[/notices] GET Error:', err.message);
    res.status(500).json({ message: '공지사항 조회 실패' });
  }
});

// --- 2. 공지사항 생성 (관리자 전용, 파일 첨부 가능) ---
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  upload.array('attachments', 3),
  async (req, res) => {
    const { title, body, store_id, visibility } = req.body;
    const attachments = req.files?.map(f => `/Uploads/${f.filename}`) || [];

    try {
      const result = await withTransaction(req, async (conn) => {
        const [insert] = await conn.query(
          `INSERT INTO notices 
           (title, body, store_id, attachments, author_id, visibility, published_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [title, body, store_id || null, JSON.stringify(attachments), req.user.id, visibility || 'all']
        );

        await logAudit(conn, 'notice_create', req.user.id, insert.insertId, { title });
        return { id: insert.insertId };
      });

      res.status(201).json({ message: '공지사항이 작성되었습니다.', ...result });
    } catch (err) {
      console.error('[/notices] POST Error:', err.message);
      res.status(500).json({ message: '공지사항 생성 실패' });
    }
  }
);

// --- 3. 공지사항 삭제 (관리자 전용) ---
router.delete('/:noticeId', authMiddleware, adminMiddleware, async (req, res) => {
  const { noticeId } = req.params;

  try {
    const result = await withTransaction(req, async (conn) => {
      const [notice] = await conn.query(
        `SELECT id, title FROM notices WHERE id = ? FOR UPDATE`,
        [noticeId]
      );
      if (!notice[0]) throw { status: 404, msg: '공지사항을 찾을 수 없습니다.' };

      await conn.query(`DELETE FROM notices WHERE id = ?`, [noticeId]);
      await logAudit(conn, 'notice_delete', req.user.id, noticeId, {
        deleted_title: notice[0].title
      });

      return { notice_id: parseInt(noticeId), title: notice[0].title };
    });

    res.json({ message: '공지사항이 삭제되었습니다.', ...result });
  } catch (err) {
    console.error('[/notices/:id] DELETE Error:', err.message);
    res.status(err.status || 500).json({ message: err.msg || '공지사항 삭제 실패' });
  }
});

module.exports = router;