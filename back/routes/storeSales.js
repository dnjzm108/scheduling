// server/routes/storeSales.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");

const pool = (req) => req.app.get("db");

// =========================================================
// 특정 매장 매출 조회 (일/주/월/년 단위 지원)
// =========================================================
router.get("/:storeId", authMiddleware, async (req, res) => {
  const { storeId } = req.params;
  const { type, date } = req.query; // type: day/week/month/year

  const user = req.user;
  if (user.level !== 4 && user.store_id !== Number(storeId)) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  try {
    let query = "";
    let params = [];

    // 공통 SELECT: sales_date 를 YYYY-MM-DD 문자열로 보내기
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
      query =
        baseSelect +
        ` AND YEARWEEK(sales_date, 1) = YEARWEEK(?, 1)`;
      params = [storeId, date];
    } else if (type === "month") {
      query =
        baseSelect +
        ` AND DATE_FORMAT(sales_date, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`;
      params = [storeId, date];
    } else if (type === "year") {
      query =
        baseSelect +
        ` AND YEAR(sales_date) = YEAR(?)`;
      params = [storeId, date];
    } else {
      // 기본: 월 단위
      query =
        baseSelect +
        ` AND DATE_FORMAT(sales_date, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')`;
      params = [storeId, date];
    }

    const [rows] = await pool(req).query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("매출 조회 실패:", err);
    res.status(500).json({ message: "매출 조회 실패" });
  }
});

// =========================================================
// 매출 생성/수정
// =========================================================
router.post("/", authMiddleware, async (req, res) => {
  const { store_id, sales_date, sales_amount, memo } = req.body;

  const user = req.user;
  const storeIdNum = Number(store_id);
  if (user.level !== 4 && user.store_id !== storeIdNum) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  try {
    await pool(req).query(
      `INSERT INTO store_daily_sales (store_id, sales_date, sales_amount, memo)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         sales_amount = VALUES(sales_amount),
         memo = VALUES(memo)`,
      [storeIdNum, sales_date, sales_amount, memo || null]
    );
    res.json({ message: "매출 저장 완료" });
  } catch (err) {
    console.error("매출 저장 실패:", err);
    res.status(500).json({ message: "매출 저장 실패" });
  }
});

// =========================================================
// 매출 삭제
// =========================================================
router.delete("/", authMiddleware, async (req, res) => {
  const { store_id, sales_date } = req.body;

  const user = req.user;
  const storeIdNum = Number(store_id);
  if (user.level !== 4 && user.store_id !== storeIdNum) {
    return res.status(403).json({ message: "권한이 없습니다." });
  }

  try {
    const [result] = await pool(req).query(
      `DELETE FROM store_daily_sales 
       WHERE store_id = ? AND sales_date = ?`,
      [storeIdNum, sales_date]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "데이터가 없습니다." });
    }

    res.json({ message: "매출 삭제 완료" });
  } catch (err) {
    console.error("매출 삭제 실패:", err);
    res.status(500).json({ message: "매출 삭제 실패" });
  }
});

module.exports = router;
