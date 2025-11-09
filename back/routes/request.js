// server/routes/request.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const  authMiddleware  = require('../middleware/auth');
const { storeAdmin, employee } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');

// 파일 업로드 (모든 파일 허용)
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

// 1. 건의사항 목록 (level 기반)
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

    // 직원 (level 1): 본인 매장만
    if (level === 1) {
      sql += ' AND r.store_id = ?';
      params.push(userStoreId);
    }
    // 관리자 (level 2+): 필터 있으면 적용
    else if (store_id) {
      sql += ' AND r.store_id = ?';
      params.push(store_id);
    }

    sql += ' ORDER BY r.created_at DESC';
    const [rows] = await pool(req).query(sql, params);

    res.json(rows.map(r => ({
      ...r,
      attachments: r.attachments ? JSON.parse(r.attachments) : []
    })));
  } catch (err) {
    console.error('[/requests] GET Error:', err);
    res.status(500).json({ message: '건의사항 조회 실패' });
  }
});

// 2. 내 건의사항 (직원 이상)
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

    res.json(rows.map(r => ({
      ...r,
      created_at: new Date(r.created_at).toLocaleString('ko-KR'),
      attachments: r.attachments ? JSON.parse(r.attachments) : []
    })));
  } catch (err) {
    res.status(500).json({ message: '내 건의사항 조회 실패' });
  }
});

// 3. 건의사항 제출 (직원 이상)
router.post('/', authMiddleware, employee, upload.array('files', 3), async (req, res) => {
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

// 4. 건의사항 삭제 (매장관리자 이상)
router.delete('/:id', authMiddleware, storeAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await withTransaction(req, async (conn) => {
      const [request] = await conn.query(`SELECT id, title FROM requests WHERE id = ? FOR UPDATE`, [id]);
      if (!request[0]) throw { status: 404, msg: '건의사항 없음' };

      await conn.query(`DELETE FROM requests WHERE id = ?`, [id]);
      await logAudit(conn, 'request_delete', req.user.id, id, { title: request[0].title });

      return { id: parseInt(id) };
    });

    res.json({ message: '건의사항 삭제 완료', ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.msg || '삭제 실패' });
  }
});

module.exports = router;