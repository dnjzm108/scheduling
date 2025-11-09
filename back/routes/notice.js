// server/routes/notice.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const  authMiddleware = require('../middleware/auth');
const { storeAdmin, globalAdmin } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');

// 파일 업로드 설정
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => {
      const dir = path.join(__dirname, '../Uploads');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('이미지만 가능'));
  }
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
     VALUES (?, ?, 'notice', ?, ?, NOW())`,
    [action, actorId, targetId, JSON.stringify(details)]
  );

// 1. 공지사항 목록 (level 기반)
router.get('/', authMiddleware, async (req, res) => {
  const { store_id } = req.query;
  const userLevel = req.user.level;
  const userStoreId = req.user.store_id;

  try {
    let sql = `
      SELECT n.*, u.name AS author_name
      FROM notices n
      JOIN users u ON n.author_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // level 1 (직원): 본인 매장 + 전체 공지
    if (userLevel === 1) {
      sql += ' AND (n.store_id IS NULL OR n.store_id = ?)';
      params.push(userStoreId);
    }
    // level 2+ (관리자): 필터 있으면 적용
    else if (store_id) {
      sql += ' AND (n.store_id IS NULL OR n.store_id = ?)';
      params.push(store_id);
    }

    sql += ' ORDER BY n.published_at DESC';
    const [rows] = await pool(req).query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[/notices] GET Error:', err);
    res.status(500).json({ message: '공지사항 조회 실패' });
  }
});

// 2. 공지사항 생성 (매장관리자 이상)
router.post(
  '/',
  authMiddleware,
  storeAdmin,
  upload.array('attachments', 3),
  async (req, res) => {
    const { title, body, store_id, visibility = 'all' } = req.body;
    const files = req.files || [];
    const attachments = files.map(f => `/Uploads/${f.filename}`);

    if (!title?.trim()) return res.status(400).json({ message: '제목 필수' });

    try {
      const result = await withTransaction(req, async (conn) => {
        const [insert] = await conn.query(
          `INSERT INTO notices 
           (title, body, store_id, attachments, author_id, visibility, published_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [title, body || '', store_id || null, JSON.stringify(attachments), req.user.id, visibility]
        );

        await logAudit(conn, 'notice_create', req.user.id, insert.insertId, { title });
        return { id: insert.insertId };
      });

      res.status(201).json({ message: '공지사항 작성 완료', ...result });
    } catch (err) {
      console.error('[/notices] POST Error:', err);
      res.status(500).json({ message: '작성 실패' });
    }
  }
);

// 3. 공지사항 삭제 (매장관리자 이상)
router.delete('/:id', authMiddleware, storeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await withTransaction(req, async (conn) => {
      const [notice] = await conn.query(`SELECT id, title FROM notices WHERE id = ? FOR UPDATE`, [id]);
      if (!notice[0]) throw { status: 404, msg: '공지사항 없음' };

      await conn.query(`DELETE FROM notices WHERE id = ?`, [id]);
      await logAudit(conn, 'notice_delete', req.user.id, id, { title: notice[0].title });

      return { id: parseInt(id) };
    });

    res.json({ message: '공지사항 삭제 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '삭제 실패' });
  }
});

module.exports = router;