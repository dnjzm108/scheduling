// server/routes/payroll.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const ExcelJS = require('exceljs');

const pool = (req) => req.app.get('db');

// =========================================================
// 공통 Helper Functions
// =========================================================
function toHM(minutes) {
  const m = Math.round(minutes || 0);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}시간 ${mm}분`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function weekdayKorean(d) {
  const arr = ['일','월','화','수','목','금','토'];
  return arr[d.getDay()];
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `${y}-${m}-${d}`;
}

function mdWeekLabel(date) {
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdayKorean(date)})`;
}

function getMonday(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; 
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
  return d;
}

function setBorder(style) {
  return {
    top: { style },
    left: { style },
    bottom: { style },
    right: { style }
  };
}

// =========================================================
// getPayrollData - 섹션/파트/쉬는 시간 반영된 최종 계산 함수
// =========================================================
async function getPayrollData(conn, month, userId, userLevel, filters = {}) {
  const { store_id, work_area, section_name } = filters;

  const year = month.slice(0, 4);
  const mm = month.slice(4, 6);

  const startDateStr = `${year}-${mm}-01`;
  const endDateStr = `${year}-${mm}-31`;

  // 🔥 매장 범위
  let storeIds = [];
  if (userLevel >= 3) {
    const [rows] = await conn.query(`SELECT id FROM stores`);
    storeIds = rows.map(r => r.id);
  } else {
    const [[me]] = await conn.query(
      `SELECT store_id FROM users WHERE id = ?`,
      [userId]
    );
    storeIds = [me.store_id];
  }

  // store 필터 적용
  if (store_id && store_id !== "all") {
    storeIds = storeIds.filter(id => String(id) === String(store_id));
  }

  const payrolls = [];
  let grandTotal = 0;

  // =========================================================
  // 매장순 회전
  // =========================================================
  for (const sid of storeIds) {
    const [[store]] = await conn.query(
      `SELECT name FROM stores WHERE id = ?`,
      [sid]
    );

    // 직원 목록
    const [employees] = await conn.query(
      `
      SELECT 
        u.id,
        u.name,
        u.level,
        u.hire_date,
        u.work_area,
        es.salary_type,
        es.hourly_rate,
        es.hourly_rate_with_holiday,
        es.monthly_salary
      FROM users u
      LEFT JOIN employee_salary es ON es.user_id = u.id
      WHERE u.store_id = ? AND u.is_active = 1 AND u.level IN (1,2)
      ORDER BY u.hire_date ASC
      `,
      [sid]
    );

    // =========================================================
    // 직원별 계산
    // =========================================================
    for (const emp of employees) {
      // 🔥 work_area 필터 (hall / kitchen / all)
      if (work_area && work_area !== "all") {
        if (emp.work_area === "both") {
          // both는 항상 포함
        } else if (emp.work_area !== work_area) {
          continue;
        }
      }

      // 출근 기록 조회
      const [records] = await conn.query(
        `
        SELECT 
          work_date,
          start_time,
          end_time,
          break_minutes,
          work_area,
          section_name,
          final_minutes
        FROM assigned_shifts
        WHERE user_id = ?
          AND work_date BETWEEN ? AND ?
          AND status = 'confirmed'
        ORDER BY work_date ASC
        `,
        [emp.id, startDateStr, endDateStr]
      );

      // 🔥 섹션 필터 적용
      let filteredRecords = records;
      if (section_name && section_name !== "all") {
        filteredRecords = filteredRecords.filter(r => r.section_name === section_name);
      }

      if (filteredRecords.length === 0) continue;

      // =========================================================
      // 근무 기록 → 주차별 버킷 분리
      // =========================================================
      const weeks = {};
      const weekOrder = [];

      let totalMinutes = 0;

      for (const rec of filteredRecords) {
        const dateObj = new Date(rec.work_date);
        dateObj.setHours(0,0,0,0);
        const monday = getMonday(dateObj);
        const mondayIso = isoDate(monday);

        if (!weeks[mondayIso]) {
          weeks[mondayIso] = {
            monday: monday,
            minutes: 0,
            days: []
          };
          weekOrder.push(mondayIso);
        }

        // 쉬는시간 제외된 final_minutes 사용!
        const minutes = rec.final_minutes || 0;
        weeks[mondayIso].minutes += minutes;
        totalMinutes += minutes;

        weeks[mondayIso].days.push({
          date_iso: isoDate(dateObj),
          day_label: mdWeekLabel(dateObj),
          start: rec.start_time?.slice(0,5) || "-",
          end: rec.end_time?.slice(0,5) || "-",
          break: rec.break_minutes,
          minutes,
          time_str: toHM(minutes),
          section_name: rec.section_name,
          work_area: rec.work_area
        });
      }

      // =========================================================
      // 월급자 처리 (level = 2)
      // =========================================================
      if (emp.level === 2) {
        const netPay = emp.monthly_salary || 0;

        payrolls.push({
          store_id: sid,
          store_name: store?.name || "",
          user_id: emp.id,
          user_name: emp.name,
          employee_type: "full_time",
          hire_date: emp.hire_date,
          total_work_minutes: totalMinutes,
          total_work_time_str: toHM(totalMinutes),
          monthly_salary: emp.monthly_salary,
          net_pay: netPay,
          weeks: weekOrder.map(w => ({
            week_label: "",
            days: []     // 월급자는 상세 필요 없음
          }))
        });

        grandTotal += netPay;
        continue;
      }

      // =========================================================
      // 알바 처리 (level = 1)
      // =========================================================
      const weekResult = [];
      let basePay = 0;
      let overtimePay = 0;

      const MAX_BASE = 160 * 60;
      let remain = Math.min(MAX_BASE, totalMinutes);

      for (const mondayIso of weekOrder) {
        const wk = weeks[mondayIso];
        const wmin = wk.minutes;

        // 주휴 포함 시급 판단
        let rate = emp.hourly_rate;
        if (wmin >= 15 * 60 && emp.hourly_rate_with_holiday) {
          rate = emp.hourly_rate_with_holiday;
        }

        // base 구간
        const use = Math.min(wmin, remain);
        basePay += Math.round((use/60) * rate);
        remain -= use;

        // 전체 일급
        let weekTotalPay = 0;
        const daysPaid = wk.days.map(day => {
          const pay = Math.round((day.minutes / 60) * rate);
          weekTotalPay += pay;

          return {
            ...day,
            hourly_rate_used: rate,
            pay
          };
        });

        const endDate = new Date(wk.monday);
        endDate.setDate(endDate.getDate()+6);

        weekResult.push({
          week_start_iso: isoDate(wk.monday),
          week_end_iso: isoDate(endDate),
          week_label: `${mdWeekLabel(wk.monday)} ~ ${mdWeekLabel(endDate)}`,
          week_minutes: wmin,
          week_time_str: toHM(wmin),
          rate_for_week: rate,
          week_total_pay: weekTotalPay,
          days: daysPaid
        });
      }

      // 초과수당
      const overtime = Math.max(0, totalMinutes - MAX_BASE);
      overtimePay = Math.round((overtime / 60) * emp.hourly_rate * 1.5);

      const gross = basePay + overtimePay;
      const tax = Math.round(gross * 0.033);
      const net = gross - tax;

      payrolls.push({
        store_id: sid,
        store_name: store?.name || "",
        user_id: emp.id,
        user_name: emp.name,
        employee_type: "part_time",
        hire_date: emp.hire_date,
        total_work_minutes: totalMinutes,
        total_work_time_str: toHM(totalMinutes),

        base_pay: basePay,
        overtime_pay: overtimePay,
        gross_pay: gross,
        total_deduction: tax,
        net_pay: net,

        weeks: weekResult
      });

      grandTotal += net;
    }
  }

  return { payrolls, total: grandTotal, month };
}

// =========================================================
// 엑셀 다운로드 (알바 양식 + 직원 양식 완전 분리)
// =========================================================
router.get('/:month/export', authMiddleware, async (req, res) => {
  const { month } = req.params;
  const { store_id, employee_type, work_area } = req.query;
  

  const userId = req.user.id;
  const userLevel = req.user.level || 1;

  if (!/^\d{6}$/.test(month)) {
    return res.status(400).json({ message: "월 형식 오류(YYYYMM)" });
  }

  const conn = await pool(req).getConnection();

  try {
    let { payrolls } = await getPayrollData(conn, month, userId, userLevel);

    // ------------------------------------------------------
    // 🔥 1) 필터 적용 (프론트에서 보고 있는 사람만 추출)
    // ------------------------------------------------------
    if (store_id && store_id !== "all") {
      payrolls = payrolls.filter(p => String(p.store_id) === String(store_id));
    }
    if (employee_type && employee_type !== "all") {
      payrolls = payrolls.filter(p => p.employee_type === employee_type);
    }
    if (work_area && work_area !== "all") {
      payrolls = payrolls.map(p => {
        const weeks = p.weeks.map(w => ({
          ...w,
          days: w.days.filter(d => d.work_area === work_area)
        })).filter(w => w.days.length > 0);
        return { ...p, weeks };
      }).filter(p => p.weeks.length > 0);
    }

    const workbook = new ExcelJS.Workbook();
    const titleMonth = `${month.slice(0,4)}년 ${parseInt(month.slice(4))}월`;

    const borderThin = setBorder("thin");
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };

    // ============================================================
    // 📄 (1) 전체 정산표 — 사진① 형태
    // ============================================================
    const wsSummary = workbook.addWorksheet("전체정산표");

    wsSummary.columns = [
      { header: "이름", width: 16 },
      { header: "주민번호", width: 18 },
      { header: "직책", width: 12 },
      { header: "은행", width: 16 },
      { header: "계좌번호", width: 22 },
      { header: "총 근무시간", width: 14 },
      { header: "총 근무일", width: 12 },
      { header: "지급총액", width: 16 }
    ];

    wsSummary.mergeCells("A1:H1");
    wsSummary.getCell("A1").value = `${titleMonth} 급여 정산표`;
    wsSummary.getCell("A1").font = { bold: true, size: 16 };
    wsSummary.getCell("A1").alignment = { horizontal: "center" };

    wsSummary.getRow(3).values = wsSummary.columns.map(c => c.header);
    wsSummary.getRow(3).font = { bold: true };
    wsSummary.getRow(3).alignment = { horizontal: "center", vertical: "middle" };
    wsSummary.getRow(3).eachCell(cell => {
      cell.fill = headerFill;
      cell.border = borderThin;
    });

    let r = 4;
    payrolls.forEach(p => {
      wsSummary.getRow(r).values = [
        p.user_name,
        p.birthdate ?? "",
        p.employee_type === "part_time" ? "알바" : "정직원",
        p.bank_name ?? "",
        p.bank_account ?? "",
        p.total_work_time_str,
        p.weeks.reduce((cnt, w) => cnt + w.days.length, 0),
        p.net_pay
      ];

      wsSummary.getRow(r).eachCell((c, col) => {
        c.border = borderThin;
        if (col >= 6) c.alignment = { horizontal: "right" };
      });

      r++;
    });

    // ============================================================
    // 📄 (2) 알바 상세 페이지 — 사진② 형태
    // ============================================================
    payrolls.forEach((p, idx) => {
      if (p.employee_type !== "part_time") return;

      const ws = workbook.addWorksheet(`${idx+1}_${p.user_name}`);

      ws.mergeCells("A1:G1");
      ws.getCell("A1").value = `${p.user_name} ${titleMonth} 상세 근무내역`;
      ws.getCell("A1").font = { bold: true, size: 15 };
      ws.getCell("A1").alignment = { horizontal: "center" };

      ws.getRow(3).values = [
        "날짜",
        "출근",
        "퇴근",
        "쉬는시간",
        "근무시간",
        "시급",
        "일급"
      ];
      ws.getRow(3).font = { bold: true };
      ws.getRow(3).eachCell(cell => {
        cell.border = borderThin;
        cell.fill = headerFill;
        cell.alignment = { horizontal: "center" };
      });

      let rr = 4;

      p.weeks.forEach(w => {
        w.days.forEach(d => {
          ws.getRow(rr).values = [
            d.day_label,
            d.start,
            d.end,
            `${d.break_minutes}분`,
            d.time_str,
            d.hourly_rate_used,
            d.pay
          ];

          ws.getRow(rr).eachCell((c, col) => {
            c.border = borderThin;
            if (col >= 5) c.alignment = { horizontal: "right" };
          });

          rr++;
        });
      });

      ws.columns = [
        { width: 18 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 14 },
        { width: 12 },
        { width: 16 }
      ];
    });

    // ============================================================
    // 📄 (3) 정직원 페이지 — 사진③ 형태
    // ============================================================
    payrolls.forEach((p, idx) => {
      if (p.employee_type !== "full_time") return;

      const ws = workbook.addWorksheet(`정직원_${p.user_name}`);

      ws.mergeCells("A1:D1");
      ws.getCell("A1").value = `${p.user_name} ${titleMonth} 급여 요약`;
      ws.getCell("A1").font = { bold: true, size: 15 };
      ws.getCell("A1").alignment = { horizontal: "center" };

      const rows = [
        ["이름", p.user_name],
        ["총 근무시간", p.total_work_time_str],
        ["기본급", p.base_pay],
        ["초과수당", p.overtime_pay],
        ["지급총액", p.net_pay]
      ];

      let tr = 3;
      rows.forEach(rdata => {
        ws.getCell(`A${tr}`).value = rdata[0];
        ws.getCell(`A${tr}`).font = { bold: true };
        ws.getCell(`A${tr}`).alignment = { horizontal: "center" };
        ws.getCell(`A${tr}`).fill = headerFill;
        ws.getCell(`A${tr}`).border = borderThin;

        ws.getCell(`B${tr}`).value = rdata[1];
        ws.getCell(`B${tr}`).border = borderThin;
        ws.getCell(`B${tr}`).alignment = { horizontal: "right" };

        tr++;
      });

      ws.columns = [
        { width: 18 },
        { width: 20 }
      ];
    });

    // 응답
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=payroll_${month}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error("엑셀 생성 실패:", err);
    res.status(500).json({ message: "엑셀 생성 실패", error: err.message });
  } finally {
    conn.release();
  }
});



// =========================================================
// JSON 조회 라우트 (필터 포함)
// GET /api/payroll/:month?store_id=..&work_area=..&section_name=..
// =========================================================
router.get('/:month', authMiddleware, async (req, res) => {
  const { month } = req.params;
  const userId = req.user.id;
  const userLevel = req.user.level || 1;

  const filters = {
    store_id: req.query.store_id || "all",
    work_area: req.query.work_area || "all",
    section_name: req.query.section_name || "all"
  };

  if (!/^\d{6}$/.test(month)) {
    return res.status(400).json({ message: '월 형식 오류 (YYYYMM)' });
  }

  const conn = await pool(req).getConnection();
  try {
    const result = await getPayrollData(conn, month, userId, userLevel, filters);
    res.json(result);
  } catch (err) {
    console.error('급여 조회 실패:', err);
    res.status(500).json({ message: '급여 조회 실패', error: err.message });
  } finally {
    conn.release();
  }
});

// =========================================================
module.exports = router;
