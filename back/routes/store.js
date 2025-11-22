// server/routes/store.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { globalAdmin } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');

// 매장 목록 조회
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool(req).query(`
      SELECT id, name, address, manager_id, open_time, close_time
      FROM stores
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: '매장 목록 조회 실패' });
  }
});

// 매장 생성 (총관리자만)
router.post('/', authMiddleware, globalAdmin, async (req, res) => {
  const { name, address, manager_id, open_time, close_time } = req.body;
  try {
    await pool(req).query(
      `INSERT INTO stores (name, address, manager_id, open_time, close_time)
       VALUES (?, ?, ?, ?, ?)`,
      [name, address || null, manager_id || null, open_time || null, close_time || null]
    );
    res.status(201).json({ message: '매장 생성 완료' });
  } catch (err) {
    res.status(500).json({ message: '매장 생성 실패' });
  }
});

// 매장 수정 (총관리자만)
router.put('/:id', authMiddleware, globalAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, address, manager_id, open_time, close_time } = req.body;

  try {
    const [result] = await pool(req).query(
      `UPDATE stores
       SET name=?, address=?, manager_id=?, open_time=?, close_time=?
       WHERE id=?`,
      [name, address || null, manager_id || null, open_time || null, close_time || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '매장을 찾을 수 없습니다.' });
    }

    res.json({ message: '매장 수정 완료' });
  } catch (err) {
    res.status(500).json({ message: '매장 수정 실패' });
  }
});

// 매장 삭제 (총관리자만)
router.delete('/:id', authMiddleware, globalAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool(req).query(`DELETE FROM stores WHERE id=?`, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '매장을 찾을 수 없습니다.' });
    }

    res.json({ message: '매장 삭제 완료' });
  } catch (err) {
    res.status(500).json({ message: '매장 삭제 실패' });
  }
});

module.exports = router;
