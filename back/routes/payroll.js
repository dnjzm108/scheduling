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
  const day = (d.getDay() + 6) % 7; // 월요일 기준
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

// Excel 컬럼 번호 → 문자 (2 -> B, 3 -> C ...)
function columnNumberToName(num) {
  let s = '';
  while (num > 0) {
    const mod = (num - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

// work_area → 한글 라벨
function workAreaLabel(area) {
  if (area === 'hall') return '홀';
  if (area === 'kitchen') return '주방';
  return '전체';
}

// yyyy-mm-dd → yymmdd
function toYYMMDD(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const yy = String(d.getFullYear()).slice(2);
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `${yy}${mm}${dd}`;
}

// 세금 라벨
function taxLabel(tax_type) {
  if (tax_type === 0 || tax_type === '0') return '3.3%';
  if (tax_type === 1 || tax_type === '1') return '4대보험';
  return '미확인';
}

// 은행(예금주) 라벨
function bankHolderLabel(bank_name, account_holder) {
  if (!bank_name && !account_holder) return '';
  if (!account_holder) return bank_name || '';
  if (!bank_name) return account_holder;
  return `${bank_name}(${account_holder})`;
}

// =========================================================
// getPayrollData - 섹션/파트/쉬는 시간 반영된 최종 계산 함수
//  🔥 알바: 세금 공제 없음 (net_pay = 세전 총액)
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

    // 직원 목록 (필요한 인적 정보 추가)
    const [employees] = await conn.query(
      `
      SELECT 
        u.id,
        u.name,
        u.level,
        u.hire_date,
        u.work_area,
        u.resident_id,
        u.tax_type,
        u.bank_name,
        u.account_holder,
        u.bank_account,
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

        const minutes = rec.final_minutes || 0;
        weeks[mondayIso].minutes += minutes;
        totalMinutes += minutes;

        weeks[mondayIso].days.push({
          date_iso: isoDate(dateObj),
          day_label: mdWeekLabel(dateObj),
          start: rec.start_time?.slice(0,5) || "",
          end: rec.end_time?.slice(0,5) || "",
          break: rec.break_minutes || 0,
          minutes,
          time_str: toHM(minutes),
          section_name: rec.section_name,
          work_area: rec.work_area
        });
      }

      // =========================================================
      // 월급자 처리 (level = 2, 정직원)
      //  - net_pay = monthly_salary 그대로 사용
      // =========================================================
      if (emp.level === 2) {
        const pay = emp.monthly_salary || 0;

        payrolls.push({
          store_id: sid,
          store_name: store?.name || "",
          user_id: emp.id,
          user_name: emp.name,
          employee_type: "full_time",
          hire_date: emp.hire_date,
          work_area: emp.work_area,

          resident_id: emp.resident_id,
          tax_type: emp.tax_type,
          bank_name: emp.bank_name,
          account_holder: emp.account_holder,
          bank_account: emp.bank_account,

          total_work_minutes: totalMinutes,
          total_work_time_str: toHM(totalMinutes),
          monthly_salary: emp.monthly_salary || 0,
          base_pay: emp.monthly_salary || 0,
          overtime_pay: 0,
          gross_pay: emp.monthly_salary || 0,
          total_deduction: 0,
          net_pay: pay,

          weeks: weekOrder.map(w => ({
            week_label: "",
            days: []     // 월급자는 상세 필요 없음
          }))
        });

        grandTotal += pay;
        continue;
      }

      // =========================================================
      // 알바 처리 (level = 1)
      //  🔥 세금 3.3% 공제 제거 → gross = net
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
      const net = gross; // 🔥 세금 공제 없음

      payrolls.push({
        store_id: sid,
        store_name: store?.name || "",
        user_id: emp.id,
        user_name: emp.name,
        employee_type: "part_time",
        hire_date: emp.hire_date,
        work_area: emp.work_area,

        resident_id: emp.resident_id,
        tax_type: emp.tax_type,
        bank_name: emp.bank_name,
        account_holder: emp.account_holder,
        bank_account: emp.bank_account,

        total_work_minutes: totalMinutes,
        total_work_time_str: toHM(totalMinutes),

        base_pay: basePay,
        overtime_pay: overtimePay,
        gross_pay: gross,
        total_deduction: 0,
        net_pay: net,

        weeks: weekResult
      });

      grandTotal += net;
    }
  }

  return { payrolls, total: grandTotal, month };
}

// =========================================================
// 엑셀 다운로드 (직원 / 알바 형식 분리)
// =========================================================
router.get('/:month/export', authMiddleware, async (req, res) => {
  const { month } = req.params;
  const { store_id = "all", employee_type = "all", work_area = "all" } = req.query;

  const userId = req.user.id;
  const userLevel = req.user.level || 1;

  if (!/^\d{6}$/.test(month)) {
    return res.status(400).json({ message: "월 형식 오류(YYYYMM)" });
  }

  const conn = await pool(req).getConnection();

  try {
    const { payrolls } = await getPayrollData(conn, month, userId, userLevel, {
      store_id,
      work_area,
      section_name: "all"
    });

    // employee_type 필터 적용
    let filtered = payrolls;
    if (employee_type && employee_type !== "all") {
      filtered = filtered.filter(p => p.employee_type === employee_type);
    }

    if (!filtered.length) {
      return res.status(404).json({ message: "엑셀로 내보낼 급여 데이터가 없습니다." });
    }

    const workbook = new ExcelJS.Workbook();

    const year = parseInt(month.slice(0, 4), 10);
    const mm = parseInt(month.slice(4, 6), 10);
    const monthNum = mm;
    const yy = year % 100;

    const areaLabel = workAreaLabel(work_area);
    const firstStoreName = filtered[0]?.store_name || "";
    const titleMonth = `${yy}년 ${monthNum}월`;

    const isEmployeeOnly = (employee_type === 'full_time');

    const borderThin = setBorder("thin");
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };

    // =====================================================
    // 1) 직원용 엑셀 (월급자 샘플 형식)
// =====================================================
    if (isEmployeeOnly) {
      const ws = workbook.addWorksheet("월급자");

      const count = filtered.length;
      const startCol = 2; // B열부터 직원
      const endCol = startCol + count - 1;
      const lastColName = columnNumberToName(endCol || 2);

      // 제목
      ws.mergeCells(`A1:${lastColName}1`);
      ws.getCell("A1").value = `${firstStoreName} 전체 월급자(${titleMonth})`;
      ws.getCell("A1").font = { bold: true, size: 14 };
      ws.getCell("A1").alignment = { horizontal: "center" };

      // 2행: 번호
      for (let i = 0; i < count; i++) {
        ws.getCell(2, startCol + i).value = i + 1;
        ws.getCell(2, startCol + i).alignment = { horizontal: "center" };
      }

      // 라벨 영역
      const labels = [
        "이름",      // 3
        "급여",      // 4
        "주민번호",  // 5
        "비자형태",  // 6
        "세금여부",  // 7
        "입사일",    // 8
        "퇴사일",    // 9
        "은행",      //10
        "계좌번호"   //11
      ];
      const labelStartRow = 3;

      labels.forEach((label, idx) => {
        const row = labelStartRow + idx;
        ws.getCell(row, 1).value = label;
        ws.getCell(row, 1).border = borderThin;
        ws.getCell(row, 1).alignment = { horizontal: "center" };
      });

      // 특이사항 / 급여 / 합계
      ws.getCell(13, 1).value = "";
      ws.getCell(14, 1).value = "특이사항";
      ws.getCell(14, 1).border = borderThin;
      ws.getCell(14, 1).alignment = { horizontal: "center" };

      ws.getCell(15, 1).value = "급여";
      ws.getCell(15, 1).border = borderThin;
      ws.getCell(15, 1).alignment = { horizontal: "center" };

      ws.getCell(17, 1).value = "합계";
      ws.getCell(17, 1).border = borderThin;
      ws.getCell(17, 1).alignment = { horizontal: "center" };

      // 데이터 채우기
      filtered.forEach((p, i) => {
        const col = startCol + i;

        // 3행: 이름 (  이름)
        ws.getCell(3, col).value = `${p.user_name}`;
        
        // 4행: 급여(정보용, 비워둠)
        ws.getCell(4, col).value = `${p.monthly_salary}`;

        // 5행: 주민번호
        ws.getCell(5, col).value = p.resident_id || "";

        // 6행: 비자형태 (기본값: 내국인)
        ws.getCell(6, col).value = "내국인";

        // 7행: 세금여부
        ws.getCell(7, col).value = taxLabel(p.tax_type);

        // 8행: 입사일 (yymmdd)
        ws.getCell(8, col).value = toYYMMDD(p.hire_date);

        // 9행: 퇴사일(없음)
        // 10행: 은행(예금주)
        ws.getCell(10, col).value = bankHolderLabel(p.bank_name, p.account_holder);

        // 11행: 계좌번호
        ws.getCell(11, col).value = p.bank_account || "";

        // 15행: 급여 (월급)
        ws.getCell(15, col).value = p.monthly_salary || p.net_pay || 0;
        ws.getCell(15, col).numFmt = "#,##0";

        // 테두리
        for (let r = 3; r <= 11; r++) {
          ws.getCell(r, col).border = borderThin;
        }
        ws.getCell(15, col).border = borderThin;
      });

      // 합계 (B열)
      if (count > 0) {
        const startColName = columnNumberToName(startCol);
        const endColName = columnNumberToName(endCol);
        ws.getCell(17, 2).value = { formula: `SUM(${startColName}15:${endColName}15)` };
        ws.getCell(17, 2).numFmt = "#,##0";
        ws.getCell(17, 2).border = borderThin;
      }

      // 컬럼 폭
      ws.getColumn(1).width = 12;
      for (let c = startCol; c <= endCol; c++) {
        ws.getColumn(c).width = 18;
      }

      const fileTypeLabel = "직원";
      const fileName = `(샤올) ${monthNum}월 ${areaLabel} ${fileTypeLabel} 급여.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"`
      );

      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    // =====================================================
    // 2) 알바 / 전체 엑셀 (알바 양식)
//  - 시트1: 알바정산표
//  - 시트N: 1_이름 (월 전체 날짜 + 주 단위 빈 행 구분 + 합계)
//  - 정산표 금액은 개인 시트 합계 셀을 참조
// =====================================================
    const partTimers = filtered.filter(p => p.employee_type === "part_time");

    if (!partTimers.length) {
      return res.status(404).json({ message: "알바 급여 데이터가 없습니다." });
    }

    const wsSummary = workbook.addWorksheet("알바정산표");

    // 정산표 컬럼: 이름 / 세금 / 은행(예금주) / 계좌번호 / 총 근무시간 / 총 근무일 / 지급총액
    wsSummary.columns = [
      { header: "이름", width: 16 },
      { header: "세금", width: 10 },
      { header: "은행(예금주)", width: 24 },
      { header: "계좌번호", width: 22 },
      { header: "총 근무시간", width: 16 },
      { header: "총 근무일", width: 12 },
      { header: "지급총액", width: 16 }
    ];

    // 제목
    wsSummary.mergeCells("A1:G1");
    wsSummary.getCell("A1").value = `${firstStoreName} 전체 ${titleMonth} 알바 급여 정산표`;
    wsSummary.getCell("A1").font = { bold: true, size: 16 };
    wsSummary.getCell("A1").alignment = { horizontal: "center" };

    // 헤더 (3행)
    wsSummary.getRow(3).values = wsSummary.columns.map(c => c.header);
    wsSummary.getRow(3).font = { bold: true };
    wsSummary.getRow(3).alignment = { horizontal: "center", vertical: "middle" };
    wsSummary.getRow(3).eachCell(cell => {
      cell.fill = headerFill;
      cell.border = borderThin;
    });

    // month → JS Date 범위 (한 달 전체)
    const baseYear = year;
    const baseMonth = mm - 1; // 0-index
    const firstDay = new Date(baseYear, baseMonth, 1);
    const lastDay = new Date(baseYear, baseMonth + 1, 0); // 말일

    // 정산표에서 참조할 detail 합계 위치를 나중에 채우기 위해 저장
    let summaryRowIdx = 4;

    partTimers.forEach((p, idx) => {
      const sheetName = `${idx + 1}_${p.user_name}`; // 예: 1_백서영

      // ========= 개인 상세 시트 생성 =========
      const ws = workbook.addWorksheet(sheetName);

      // 제목: 알바이름 25년 11월 상세 근무내역
      ws.mergeCells("A1:G1");
      ws.getCell("A1").value = `알바일 ${p.user_name} ${titleMonth} 상세 근무내역`;
      ws.getCell("A1").font = { bold: true, size: 15 };
      ws.getCell("A1").alignment = { horizontal: "center" };

      // 헤더 (3행)
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

      // 기존 근무 기록을 날짜별로 map
      const dayMap = {};
      p.weeks.forEach(w => {
        w.days.forEach(d => {
          dayMap[d.date_iso] = d;
        });
      });

      let rr = 4;
      let currentWeekKey = null;

      for (
        let d = new Date(firstDay);
        d.getTime() <= lastDay.getTime();
        d.setDate(d.getDate() + 1)
      ) {
        const dateIso = isoDate(d);
        const dayLabel = mdWeekLabel(d);

        // 주 단위 구분 (월요일 기준)
        const monday = getMonday(d);
        const weekKey = isoDate(monday);
        if (currentWeekKey && currentWeekKey !== weekKey) {
          // 주가 바뀔 때 빈 줄 삽입
          rr++;
        }
        currentWeekKey = weekKey;

        const dayData = dayMap[dateIso];

        if (dayData) {
          ws.getRow(rr).values = [
            dayData.day_label,
            dayData.start || "",
            dayData.end || "",
            `${dayData.break || 0}분`,
            dayData.time_str || "",
            dayData.hourly_rate_used || 0,
            dayData.pay || 0
          ];
        } else {
          // 근무 안 한 날
          ws.getRow(rr).values = [
            dayLabel,
            "",
            "",
            "",
            "",
            "",
            ""
          ];
        }

        ws.getRow(rr).eachCell((c, col) => {
          c.border = borderThin;
          if (col >= 5) c.alignment = { horizontal: "right" };
        });

        rr++;
      }

      const lastDataRow = rr - 1;
      const totalRow = rr;

      // 합계 행
      ws.getCell(totalRow, 1).value = "합계";
      ws.getCell(totalRow, 1).border = borderThin;
      ws.getCell(totalRow, 7).value = { formula: `SUM(G4:G${lastDataRow})` };
      ws.getCell(totalRow, 7).numFmt = "#,##0";
      ws.getCell(totalRow, 7).border = borderThin;
      ws.getCell(totalRow, 7).alignment = { horizontal: "right" };

      ws.columns = [
        { width: 18 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 14 },
        { width: 12 },
        { width: 16 }
      ];

      // ========= 정산표에 행 추가 =========
      const bankHolder = bankHolderLabel(p.bank_name, p.account_holder);
      const taxText = taxLabel(p.tax_type);

      const summaryRow = wsSummary.getRow(summaryRowIdx);
      summaryRow.values = [
        p.user_name,
        taxText,
        bankHolder,
        p.bank_account || "",
        p.total_work_time_str,
        p.weeks.reduce((cnt, w) => cnt + w.days.length, 0),
        null // 지급총액은 함수로 채움
      ];

      summaryRow.eachCell((c, col) => {
        c.border = borderThin;
        if (col >= 5) c.alignment = { horizontal: "right" };
      });

      // 지급총액 = 개인 시트 합계(GtotalRow) 참조
      const safeSheetName = sheetName.replace(/'/g, "''");
      wsSummary.getCell(summaryRowIdx, 7).value = {
        formula: `'${safeSheetName}'!G${totalRow}`
      };
      wsSummary.getCell(summaryRowIdx, 7).numFmt = "#,##0";

      summaryRowIdx++;
    });

    const fileTypeLabel = "알바";
    const fileName = `(샤올) ${monthNum}월 ${areaLabel} ${fileTypeLabel} 급여.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`
    );

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

module.exports = router;
