// server/routes/request.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const pool = (req) => req.app.get('db');

// --- 파일 업로드 설정 (최대 3개, 5MB, 모든 파일 허용) ---
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
  fileFilter: (req, file, cb) => cb(null, true) // 모든 파일 허용
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


// 건의사항 목록
router.get('/', authMiddleware, async (req, res) => {
  const { store_id } = req.query;
  try {
    const [user] = await pool(req).query('SELECT store_id, isAdmin FROM users WHERE id = ?', [req.user.id]);
    if (user.length === 0) return res.status(404).json({ message: '사용자 없음' });

    const isAdmin = user[0].isAdmin;
    const userStoreId = user[0].store_id;

    let query = `
      SELECT r.*, u.name AS author_name
      FROM requests r
      JOIN users u ON r.author_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      query += ' AND r.store_id = ?';
      params.push(userStoreId);
    } else if (store_id) {
      query += ' AND r.store_id = ?';
      params.push(store_id);
    }

    query += ' ORDER BY r.created_at DESC';

    const [rows] = await pool(req).query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('[/requests] Error:', err.message);
    res.status(500).json({ message: '건의사항 조회 실패' });
  }
});

// 건의사항 삭제
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool(req).query('DELETE FROM requests WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '건의사항 없음' });
    }
    res.json({ message: '건의사항 삭제 완료' });
  } catch (err) {
    console.error('[/requests DELETE] Error:', err.message);
    res.status(500).json({ message: '건의사항 삭제 실패' });
  }
});

// --- 1. 건의사항 제출 (파일 첨부 포함) ---
router.post('/', authMiddleware, upload.array('files', 3), async (req, res) => {
  const { title, body } = req.body;
  const files = req.files ? req.files.map(f => `/Uploads/${f.filename}`) : [];

  if (!title || !body) {
    return res.status(400).json({ message: '제목과 내용을 입력해주세요.' });
  }

  try {
    const result = await withTransaction(req, async (conn) => {
      const [insert] = await conn.query(
        `INSERT INTO requests 
         (title, body, store_id, attachments, author_id, created_at)
         VALUES (?, ?, (SELECT store_id FROM users WHERE id = ?), ?, ?, NOW())`,
        [title, body, req.user.id, JSON.stringify(files), req.user.id]
      );

      // 감사 로그 (선택적)
      await conn.query(
        `INSERT INTO audit_logs (action, actor_id, target_type, target_id, details, timestamp)
         VALUES (?, ?, 'request', ?, ?, NOW())`,
        ['request_create', req.user.id, insert.insertId, JSON.stringify({ title })]
      );

      return { id: insert.insertId };
    });

    res.status(201).json({
      message: '건의사항 제출 완료!',
      request_id: result.id
    });
  } catch (err) {
    console.error('[/requests] POST Error:', err.message);
    res.status(500).json({ message: '제출 실패' });
  }
});

// --- 2. 내 건의사항 목록 (선택적) ---
router.get('/my-requests', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool(req).query(
      `SELECT r.id, r.title, r.body, r.attachments, r.created_at, s.name AS store_name
       FROM requests r
       LEFT JOIN stores s ON r.store_id = s.id
       WHERE r.author_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    const result = rows.map(r => ({
      ...r,
      created_at: new Date(r.created_at).toLocaleString('ko-KR'),
      attachments: r.attachments ? JSON.parse(r.attachments) : []
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: '목록 조회 실패' });
  }
});


module.exports = router;