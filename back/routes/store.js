// server/routes/store.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const pool = (req) => req.app.get('db');

// 매장 목록 (전체 페이지 사용)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool(req).query(`
      SELECT s.id, s.name, s.address, s.manager_id, u.name AS manager_name
      FROM stores s
      LEFT JOIN users u ON s.manager_id = u.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('[/admin/stores] Error:', err.message);
    res.status(500).json({ message: '매장 목록 조회 실패' });
  }
});

// 매장 생성
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, address, manager_id } = req.body;
  try {
    const [result] = await pool(req).query(
      'INSERT INTO stores (name, address, manager_id) VALUES (?, ?, ?)',
      [name, address || null, manager_id || null]
    );
    res.status(201).json({ id: result.insertId, message: '매장 생성 완료' });
  } catch (err) {
    console.error('[/admin/stores POST] Error:', err.message);
    res.status(500).json({ message: '매장 생성 실패' });
  }
});

// 매장 수정
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, address, manager_id } = req.body;
  try {
    const [result] = await pool(req).query(
      'UPDATE stores SET name = ?, address = ?, manager_id = ? WHERE id = ?',
      [name, address || null, manager_id || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '매장을 찾을 수 없습니다.' });
    }
    res.json({ message: '매장 수정 완료' });
  } catch (err) {
    console.error('[/admin/stores PUT] Error:', err.message);
    res.status(500).json({ message: '매장 수정 실패' });
  }
});

// 매장 삭제
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool(req).query('DELETE FROM stores WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '매장을 찾을 수 없습니다.' });
    }
    res.json({ message: '매장 삭제 완료' });
  } catch (err) {
    console.error('[/admin/stores DELETE] Error:', err.message);
    res.status(500).json({ message: '매장 삭제 실패' });
  }
});

module.exports = router;