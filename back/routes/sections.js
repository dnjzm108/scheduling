const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { storeAdmin } = require('../middleware/levelMiddleware');

const pool = (req) => req.app.get('db');

// 관리자 권한 기반 허용 매장 도출
async function getAllowedStores(req) {
  const conn = pool(req);
  const user = req.user;

  // 🔥 총관리자: 모든 매장 기본 허용 + 추가 등록된 매장은 중복 제거
  if (user.level === 4) {
    const [[{count}]] = await conn.query(`SELECT COUNT(*) AS count FROM stores`);
    if (count > 0) {
      const [rows] = await conn.query(`SELECT id FROM stores`);
      return rows.map(r => r.id);
    }
    return [];
  }

  // 🔥 매장관리자: 자기 매장 + 부여받은 매장 목록
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


/* =====================================================
   섹션 목록 조회
===================================================== */
// 목록
router.get('/:type', auth, async (req, res) => {
  const { type } = req.params;
  const { store_id } = req.query;
  if (!store_id) return res.json([]);

  const table = type === 'hall' ? 'hall_sections' : 'kitchen_sections';

  const [rows] = await pool(req).query(
    `SELECT id, name, is_active, store_id 
     FROM ${table}
     WHERE store_id = ?
     ORDER BY id`,
    [store_id]
  );

  res.json(rows);
});

// 추가
router.post('/:type', auth, storeAdmin, async (req, res) => {
  const { type } = req.params;
  const { name, store_id } = req.body;

  const table = type === 'hall' ? 'hall_sections' : 'kitchen_sections';

  await pool(req).query(
    `INSERT INTO ${table} (store_id, name, is_active) VALUES (?, ?, 1)`,
    [store_id, name]
  );

  res.json({ message: '추가 완료' });
});

/* =====================================================
   섹션 추가
===================================================== */
router.post('/:type', auth, storeAdmin, async (req, res) => {
  const { type } = req.params;
  const { name, store_id } = req.body;

  const table = type === 'hall' ? 'hall_sections' :
                type === 'kitchen' ? 'kitchen_sections' : null;
  if (!table) return res.status(400).json({ message: '잘못된 타입' });

  const allowedStores = await getAllowedStores(req);
  if (!allowedStores.includes(Number(store_id))) {
    return res.status(403).json({ message: '해당 매장 권한 없음' });
  }

  await pool(req).query(
    `INSERT INTO ${table} (name, is_active, store_id) VALUES (?, 1, ?)`,
    [name, store_id]
  );

  res.json({ message: '추가 완료' });
});

/* =====================================================
   섹션 수정
===================================================== */
router.put('/:type/:id', auth, storeAdmin, async (req, res) => {
  const { type, id } = req.params;
  const { name, is_active } = req.body;

  const table = type === 'hall' ? 'hall_sections' :
                type === 'kitchen' ? 'kitchen_sections' : null;
  if (!table) return res.status(400).json({ message: '잘못된 타입' });

  const [[row]] = await pool(req).query(
    `SELECT store_id FROM ${table} WHERE id = ?`,
    [id]
  );
  if (!row) return res.status(404).json({ message: '섹션 없음' });

  const allowedStores = await getAllowedStores(req);
  if (!allowedStores.includes(row.store_id)) {
    return res.status(403).json({ message: '해당 매장 권한 없음' });
  }

  await pool(req).query(
    `UPDATE ${table} SET name=?, is_active=? WHERE id=?`,
    [name, is_active, id]
  );

  res.json({ message: '수정 완료' });
});

/* =====================================================
   섹션 삭제
===================================================== */
router.delete('/:type/:id', auth, storeAdmin, async (req, res) => {
  const { type, id } = req.params;

  const table = type === 'hall' ? 'hall_sections' :
                type === 'kitchen' ? 'kitchen_sections' : null;
  if (!table) return res.status(400).json({ message: '잘못된 타입' });

  const [[row]] = await pool(req).query(
    `SELECT store_id FROM ${table} WHERE id = ?`,
    [id]
  );
  if (!row) return res.status(404).json({ message: '섹션 없음' });

  const allowedStores = await getAllowedStores(req);
  if (!allowedStores.includes(row.store_id)) {
    return res.status(403).json({ message: '해당 매장 권한 없음' });
  }

  await pool(req).query(`DELETE FROM ${table} WHERE id = ?`, [id]);

  res.json({ message: '삭제 완료' });
});

module.exports = router;
