const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");

const pool = (req) => req.app.get("db");

// =========================================================
// 🔹 일일 매출 조회 (YYYY-MM-DD 단일 조회)
// GET /api/store-sales/daily?store_id=1&date=2025-01-01
// =========================================================
router.get("/daily", authMiddleware, async (req, res) => {
  const { store_id, date } = req.query;

  if (!store_id || !date) {
    return res.status(400).json({ message: "store_id 와 date 는 필수입니다." });
  }

  const user = req.user;
  if (user.level !== 4 && user.store_id !== Number(store_id)) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  try {
    const [rows] = await pool(req).query(
      `
      SELECT 
        store_id,
        DATE_FORMAT(sales_date,'%Y-%m-%d') AS date,
        sales_amount 
      FROM store_daily_sales
      WHERE store_id = ? AND sales_date = ?
      `,
      [store_id, date]
    );

    if (rows.length === 0) {
      return res.json({
        store_id,
        date,
        sales_amount: 0
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("일일 매출 조회 실패:", err);
    res.status(500).json({ message: "일일 매출 조회 실패" });
  }
});

// =========================================================
// 🔹 주간 매출 조회 (start_date 기준 7일)
// GET /api/store-sales/week?store_id=1&start_date=2025-01-01
// =========================================================
router.get("/week", authMiddleware, async (req, res) => {
  const { store_id, start_date } = req.query;

  if (!store_id || !start_date) {
    return res.status(400).json({ message: "store_id 와 start_date 는 필수입니다." });
  }

  const user = req.user;
  if (user.level !== 4 && user.store_id !== Number(store_id)) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  try {
    const [rows] = await pool(req).query(
      `
      SELECT 
        store_id,
        DATE_FORMAT(sales_date,'%Y-%m-%d') AS date,
        sales_amount
      FROM store_daily_sales
      WHERE store_id = ?
      AND sales_date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
      ORDER BY sales_date ASC
      `,
      [store_id, start_date, start_date]
    );

    const result = [];
    const start = new Date(start_date);

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);

      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const found = rows.find((r) => r.date === dateStr);

      result.push({
        date: dateStr,
        sales_amount: found?.sales_amount ?? 0
      });
    }

    res.json({
      store_id,
      start_date,
      daily_sales: result
    });
  } catch (err) {
    console.error("주간 매출 조회 실패:", err);
    res.status(500).json({ message: "주간 매출 조회 실패" });
  }
});

// =========================================================
// 🔹 월 / 연 / 주간 등 기존 조회 API
// NOTE: 동적 라우트는 항상 맨 아래 배치해야 함
// =========================================================
router.get("/:storeId", authMiddleware, async (req, res) => {
  const { storeId } = req.params;
  const { type, date } = req.query;

  const user = req.user;
  if (user.level !== 4 && user.store_id !== Number(storeId)) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  try {
    let query = "";
    let params = [];

    const baseSelect = `
      SELECT 
        id,
        store_id,
        DATE_FORMAT(sales_date, '%Y-%m-%d') AS sales_date,
        sales_amount,
        memo
      FROM store_daily_sales
      WHERE store_id = ?
    `;

    if (type === "day") {
      query = baseSelect + ` AND sales_date = ?`;
      params = [storeId, date];
    } else if (type === "week") {
      query = baseSelect + ` AND YEARWEEK(sales_date, 1) = YEARWEEK(?, 1)`;
      params = [storeId, date];
    } else if (type === "month") {
      query =
        baseSelect +
        ` AND DATE_FORMAT(sales_date, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`;
      params = [storeId, date];
    } else if (type === "year") {
      query = baseSelect + ` AND YEAR(sales_date) = YEAR(?)`;
      params = [storeId, date];
    } else {
      return res.status(400).json({ message: "type 이 필요합니다." });
    }

    const [rows] = await pool(req).query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("매출 조회 실패:", err);
    res.status(500).json({ message: "매출 조회 실패" });
  }
});


// ============================== // 조회 API // ============================== 
router.get("/:storeId", authMiddleware, async (req, res) => {
  const { storeId } = req.params;
  const { type, date } = req.query;
  const user = req.user;
  if (user.level !== 4 && user.store_id !== Number(storeId)) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }
  try {
    let query = "";
    let params = [];
    const baseSelect =
      `SELECT id, store_id, DATE_FORMAT(sales_date, '%Y-%m-%d') AS sales_date, sales_amount, memo FROM store_daily_sales WHERE store_id = ?`;
    if (type === "day") {
      query = baseSelect + `AND sales_date = ?`;
      params = [storeId, date];
    } else if (type === "week") {
      query = baseSelect + `AND YEARWEEK(sales_date, 1) = YEARWEEK(?, 1)`;
      params = [storeId, date];
    } else if (type === "month") {
      query = baseSelect + `AND DATE_FORMAT(sales_date, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`;
      params = [storeId, date];
    } else if (type === "year") {
      query = baseSelect + `AND YEAR(sales_date) = YEAR(?);`
      params = [storeId, date];
    }
    const [rows] = await pool(req).query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("매출 조회 실패:", err);
    res.status(500).json({ message: "매출 조회 실패" });
  }
});



// ============================== // 저장/수정 API // ============================== 
router.post("/", authMiddleware, async (req, res) => {
  const { store_id, sales_date, sales_amount, memo } = req.body;
  const user = req.user;
  const sid = Number(store_id);
  if (user.level !== 4 && user.store_id !== sid) {
    return res.status(403).json({
      message: "권한이 없습니다."
    });
  }
  try {
    await pool(req).query(
      `INSERT INTO store_daily_sales (store_id, sales_date, sales_amount, memo) 
        VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE sales_amount = VALUES(sales_amount), 
        memo = VALUES(memo)`,
      [sid, sales_date, sales_amount, memo || null]
    );
    res.json({ message: "매출 저장 완료" });
  } catch (err) {
    console.error("매출 저장 실패:", err);
    res.status(500).json({ message: "매출 저장 실패" });
  }
});

// ============================== // 삭제 API // ============================== 
router.delete("/", authMiddleware, async (req, res) => {
  const { store_id, sales_date } = req.body;
  const sid = Number(store_id);
  const user = req.user;
  if (user.level !== 4 && user.store_id !== sid) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }
  try {
    const [result] = await pool(req).query(
      `DELETE FROM store_daily_sales WHERE store_id = ? AND sales_date = ?`, [sid, sales_date]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: "데이터가 없습니다."
      });
    }
    res.json({
      message: "매출 삭제 완료"
    });
  } catch (err) {
    console.error("매출 삭제 실패:", err);
    res.status(500).json({ message: "매출 삭제 실패" });
  }
});



module.exports = router;
