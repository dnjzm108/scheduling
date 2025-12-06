import React, { useState, useEffect } from "react";
import axios from "axios";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx"; // 화면용 테이블은 그대로 두려면 유지
import { BASE_URL } from "../../config";
import { getToken } from "../../utils/auth";
import "./index.css";
import ExcelJS from "exceljs";

function SchedulePreview({ scheduleId, onClose }) {
  const [scheduleInfo, setScheduleInfo] = useState({});
  const [applicants, setApplicants] = useState([]);
  const [assignedRaw, setAssignedRaw] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const token = getToken();

  useEffect(() => {
    const load = async () => {
      try {
        const [infoRes, applicantsRes, assignedRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/schedules/${scheduleId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${BASE_URL}/api/schedules/${scheduleId}/applicants`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get(`${BASE_URL}/api/schedules/${scheduleId}/assigned`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        setScheduleInfo(infoRes.data);
        setApplicants(applicantsRes.data || []);
        setAssignedRaw(assignedRes.data || []);

        const converted = convertAssigned(assignedRes.data || [], applicantsRes.data || []);
        setAssigned(converted);
      } catch (err) {
        console.error("미리보기 로드 실패:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [scheduleId, token]);

  const isFinalized = assignedRaw.length > 0;

  // ---------------------------
  // UTC → KST
  // ---------------------------
  const toKST = (utcString) => {
    const d = new Date(utcString);
    return new Date(d.getTime() + 9 * 60 * 60 * 1000);
  };

  // ---------------------------
  // 요일 키 변환
  // ---------------------------
  const getDayKey = (dateObj) => {
    const k = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return k[dateObj.getDay()];
  };

  // ---------------------------
  // assigned → user별 / 요일별 구조 변환
  // ---------------------------
  const convertAssigned = (assignedRaw, applicantsList) => {
    const userMap = {};

    applicantsList.forEach((u) => {
      userMap[u.id] = {
        user_id: u.id,
        user_name: u.name,
        work_area: u.work_area || "both",
        hourly_rate: u.hourly_rate || 11000,
        shifts: {
          mon: null,
          tue: null,
          wed: null,
          thu: null,
          fri: null,
          sat: null,
          sun: null,
        },
      };
    });

    assignedRaw.forEach((item) => {
      const kst = toKST(item.work_date);
      const dayKey = getDayKey(kst);

      if (!userMap[item.user_id]) return;

      userMap[item.user_id].shifts[dayKey] = {
        type: item.shift_type,
        start: item.start_time,
        end: item.end_time,
        break_minutes: item.break_minutes || 60,
        section_name: item.section_name,
        work_area: item.work_area,
      };
    });

    return Object.values(userMap);
  };

  // ---------------------------
  // 신청 스케줄 표시 포맷
  // ---------------------------
  const formatApplicantDay = (type, start, end) => {
    if (type === "full") return "풀타임";
    if (type === "part") return `${start?.slice(0, 5)}~${end?.slice(0, 5)}`;
    return "";
  };

  // ---------------------------
  // 확정 스케줄 표시 포맷 (화면용)
  // ---------------------------
  const formatAssignedDay = (shift) => {
    if (!shift) return "";
    if (shift.type === "full") {
      return `${shift.section_name || "풀타임"}`;
    }
    if (shift.start && shift.end) {
      return `${shift.section_name !==null ?shift.section_name:"홀퇴식" } ${shift.start.slice(0, 5)}~${shift.end.slice(0, 5)}`;
    }
    return "";
  };

  // -----------------------------
  // HH:MM → 10.5 형태로 변환
  // -----------------------------
  const convertTimeToDecimal = (timeStr) => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(":").map(Number);
    return h + m / 60;
  };

  // 📌 엑셀 다운로드 (사진 구조)

  const exportFinalExcel = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("근무표");

      const weekDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];

      // 날짜 계산
      const baseDate = new Date(scheduleInfo.week_start);
      const dateObjects = weekDays.map((_, i) => {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i);
        return d;
      });

      // 주간 매출(7일) 한 번에 가져오기
      const weekSalesRes = await axios.get(
        `${BASE_URL}/api/store-sales/week`,
        {
          params: {
            store_id: scheduleInfo.store_id,
            start_date: scheduleInfo.week_start,
          },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const dailySales = (weekSalesRes.data?.daily_sales || []).map(
        (d) => d.sales_amount || 0
      );
      const weeklySales = dailySales.reduce((sum, v) => sum + v, 0);

      // 공통 스타일
      const cellStyle = {
        alignment: { vertical: "middle", horizontal: "center" },
        border: {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        },
      };

      // ---------------------------
      // 헤더 구성
      // ---------------------------
      const totalDayCols = 4 * 7; // 하루당 4열 (출근/퇴근/쉬는/근무)
      const lastCol = 1 + totalDayCols; // A=1 → 맨 마지막 열 index

      // 열 너비 설정
      sheet.getColumn(1).width = 14; // 이름
      for (let c = 2; c <= lastCol; c++) {
        sheet.getColumn(c).width = 9;
      }

      // 1행: 요일+날짜 병합
      sheet.getCell(1, 1).value = "이름";
      Object.assign(sheet.getCell(1, 1), { style: { ...cellStyle, font: { bold: true } } });

      for (let i = 0; i < 7; i++) {
        const baseCol = 2 + i * 4;
        const endCol = baseCol + 3;
        const d = dateObjects[i];
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");

        sheet.mergeCells(1, baseCol, 1, endCol);
        const cell = sheet.getCell(1, baseCol);
        cell.value = `${dayLabels[i]}(${mm}/${dd})`;
        Object.assign(cell, { style: { ...cellStyle, font: { bold: true } } });
      }

      // 2행: 출근/퇴근/쉬는 시간/근무 시간
      const header2 = sheet.getRow(2);
      header2.getCell(1).value = "";
      for (let i = 0; i < 7; i++) {
        const baseCol = 2 + i * 4;
        header2.getCell(baseCol).value = "출근";
        header2.getCell(baseCol + 1).value = "퇴근";
        header2.getCell(baseCol + 2).value = "쉬는시간";
        header2.getCell(baseCol + 3).value = "근무시간";
      }
      header2.eachCell((cell) => {
        Object.assign(cell, { style: { ...cellStyle, font: { bold: true } } });
      });

      // 숨겨질 시급, 섹션용 컬럼(마지막 뒤쪽)
      const hourlyColIndex = lastCol + 1; // 시급
      const areaColIndex = lastCol + 2; // 주방/홀
      sheet.getColumn(hourlyColIndex).hidden = true;
      sheet.getColumn(areaColIndex).hidden = true;

      // ---------------------------
      // 주방 / 홀 순으로 직원 행 작성
      // ---------------------------
      const kitchenStaff = assigned.filter((u) => u.work_area === "kitchen");
      const hallStaff = assigned.filter((u) => u.work_area !== "kitchen");

      let currentRow = 3;
      const firstDataRow = currentRow;

      // 주방 인원 라벨
      if (kitchenStaff.length > 0) {
        const row = sheet.getRow(currentRow++);
        row.getCell(1).value = "주방 인원";
        Object.assign(row.getCell(1), {
          style: { ...cellStyle, alignment: { horizontal: "left" }, font: { bold: true } },
        });
      }

      const writeStaffRows = (staffList) => {
        const startRow = currentRow;
        staffList.forEach((u) => {
          const r = sheet.getRow(currentRow);
          r.getCell(1).value = u.user_name;
          Object.assign(r.getCell(1), { style: cellStyle });

          // 숨김 컬럼: 시급 / 구역
          r.getCell(hourlyColIndex).value = u.hourly_rate || 11000;
          r.getCell(areaColIndex).value = u.work_area || "";

          for (let i = 0; i < 7; i++) {
            const baseCol = 2 + i * 4;
            const shift = u.shifts[weekDays[i]];

            const startCell = r.getCell(baseCol);
            const endCell = r.getCell(baseCol + 1);
            const breakCell = r.getCell(baseCol + 2);
            const workCell = r.getCell(baseCol + 3);

            if (!shift) {
              // 출근 안 한 날 → 0
              startCell.value = 0;
              endCell.value = 0;
              breakCell.value = 0;
              workCell.value = 0;
            } else {
              let start = shift.start ? convertTimeToDecimal(shift.start) : 0;
              let end = shift.end ? convertTimeToDecimal(shift.end) : 0;
              let breakMin = shift.break_minutes || 60;

              if (shift.type === "full") {
                // 풀타임: 가게 오픈/마감 시간으로 기본 채움 (필요하면 수정)
                // 여기 값은 필요시 바꿔도 근무시간 수식은 그대로 동작
                start = 10; // 예시: 10시
                end = 22;   // 예시: 22시
                breakMin = 60;
              }

              startCell.value = start;
              endCell.value = end;
              breakCell.value = breakMin / 60; // 시간 단위
              const sAddr = startCell.address;
              const eAddr = endCell.address;
              const bAddr = breakCell.address;

              workCell.value = {
                formula: `${eAddr}-${sAddr}-${bAddr}`
              };
            }

            [startCell, endCell, breakCell, workCell].forEach((c) =>
              Object.assign(c, { style: cellStyle })
            );
          }

          currentRow++;
        });
        return { startRow, endRow: currentRow - 1 };
      };

      let kitchenRange = null;
      let hallRange = null;

      if (kitchenStaff.length > 0) {
        kitchenRange = writeStaffRows(kitchenStaff);
        currentRow++; // 빈 줄
      }

      if (hallStaff.length > 0) {
        const row = sheet.getRow(currentRow++);
        row.getCell(1).value = "홀 인원";
        Object.assign(row.getCell(1), {
          style: { ...cellStyle, alignment: { horizontal: "left" }, font: { bold: true } },
        });

        hallRange = writeStaffRows(hallStaff);
      }

      const lastDataRow = currentRow - 1;

      // ---------------------------
      // 인건비 / 매출 / 인건비율 (일별)
      // ---------------------------
      currentRow += 1; // 한 줄 띄우기
      const laborRowIndex = currentRow++;
      const salesRowIndex = currentRow++;
      const ratioRowIndex = currentRow++;

      const laborRow = sheet.getRow(laborRowIndex);
      const salesRow = sheet.getRow(salesRowIndex);
      const ratioRow = sheet.getRow(ratioRowIndex);

      laborRow.getCell(1).value = "인건비";
      salesRow.getCell(1).value = "매출";
      ratioRow.getCell(1).value = "인건비율(%)";

      [laborRow, salesRow, ratioRow].forEach((row) => {
        Object.assign(row.getCell(1), {
          style: { ...cellStyle, alignment: { horizontal: "left" }, font: { bold: true } },
        });
      });

      const dayLaborCells = [];
      const daySalesCells = [];

      for (let i = 0; i < 7; i++) {
        const baseCol = 2 + i * 4;
        const workColIndex = baseCol + 3; // 근무시간 열

        const workColLetter = sheet.getColumn(workColIndex).letter;
        const hourlyColLetter = sheet.getColumn(hourlyColIndex).letter;

        // 인건비 (SUMPRODUCT 시급 * 근무시간)
        const laborCell = laborRow.getCell(baseCol);
        laborCell.value = {
          formula: `SUMPRODUCT($${hourlyColLetter}$${firstDataRow}:$${hourlyColLetter}$${lastDataRow},${workColLetter}$${firstDataRow}:${workColLetter}$${lastDataRow})`,
        };
        sheet.mergeCells(laborRowIndex, baseCol, laborRowIndex, baseCol + 3);
        Object.assign(laborCell, { style: cellStyle });
        dayLaborCells.push(laborCell.address);

        // 매출
        const salesCell = salesRow.getCell(baseCol);
        const salesValue = dailySales[i] || 0;
        salesCell.value = salesValue;
        sheet.mergeCells(salesRowIndex, baseCol, salesRowIndex, baseCol + 3);
        Object.assign(salesCell, { style: cellStyle });
        daySalesCells.push(salesCell.address);

        // 인건비율 = 인건비 / 매출
        const ratioCell = ratioRow.getCell(baseCol);
        ratioCell.value = {
          formula: `IF(${salesCell.address}=0,0,${laborCell.address}/${salesCell.address})`,
        };
        sheet.mergeCells(ratioRowIndex, baseCol, ratioRowIndex, baseCol + 3);
        Object.assign(ratioCell, { style: { ...cellStyle, numFmt: "0.00%" } });
      }

      // ---------------------------
      // 주간 합계 (총 매출 / 인건비 / 인건비율)
      // ---------------------------
      currentRow += 2; // 한 줄 띄우고

      const weeklySalesRowIndex = currentRow++;
      const weeklyLaborRowIndex = currentRow++;
      const weeklyRatioRowIndex = currentRow++;

      const weeklySalesRow = sheet.getRow(weeklySalesRowIndex);
      const weeklyLaborRow = sheet.getRow(weeklyLaborRowIndex);
      const weeklyRatioRow = sheet.getRow(weeklyRatioRowIndex);

      // 주 총 매출
      weeklySalesRow.getCell(1).value = "주 총 매출";
      const weeklySalesCell = weeklySalesRow.getCell(2);
      weeklySalesCell.value = {
        formula: `SUM(${daySalesCells.join(",")})`,
      };
      sheet.mergeCells(weeklySalesRowIndex, 2, weeklySalesRowIndex, lastCol);
      Object.assign(weeklySalesRow.getCell(1), {
        style: { ...cellStyle, alignment: { horizontal: "left" }, font: { bold: true } },
      });
      Object.assign(weeklySalesCell, { style: cellStyle });

      // 주 총 인건비
      weeklyLaborRow.getCell(1).value = "주 총 인건비";
      const weeklyLaborCell = weeklyLaborRow.getCell(2);
      weeklyLaborCell.value = {
        formula: `SUM(${dayLaborCells.join(",")})`,
      };
      sheet.mergeCells(weeklyLaborRowIndex, 2, weeklyLaborRowIndex, lastCol);
      Object.assign(weeklyLaborRow.getCell(1), {
        style: { ...cellStyle, alignment: { horizontal: "left" }, font: { bold: true } },
      });
      Object.assign(weeklyLaborCell, { style: cellStyle });

      // 주 인건비율
      weeklyRatioRow.getCell(1).value = "주 인건비율(%)";
      const weeklyRatioCell = weeklyRatioRow.getCell(2);
      weeklyRatioCell.value = {
        formula: `IF(${weeklySalesCell.address}=0,0,${weeklyLaborCell.address}/${weeklySalesCell.address})`,
      };
      sheet.mergeCells(weeklyRatioRowIndex, 2, weeklyRatioRowIndex, lastCol);
      Object.assign(weeklyRatioRow.getCell(1), {
        style: { ...cellStyle, alignment: { horizontal: "left" }, font: { bold: true } },
      });
      Object.assign(weeklyRatioCell, {
        style: { ...cellStyle, numFmt: "0.00%" },
      });

      // ▽ 여기 아래에 "주방 인건비/인건비율, 홀 인건비/인건비율"을
      //   kitchenRange / hallRange 를 이용해서 SUMPRODUCT로 별도 요약행으로
      //   더 추가할 수 있음 (구조는 이미 주방/홀 따로 잡혀 있음)

      // ---------------------------
      // 파일 저장
      // ---------------------------
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/octet-stream" }),
        `${scheduleInfo.store_name}_${scheduleInfo.week_start}_근무표.xlsx`
      );
    } catch (err) {
      console.error("엑셀 생성 실패:", err);
      alert("엑셀 생성 중 오류가 발생했습니다.");
    }
  };

  // ---------------------------
  // 화면 출력
  // ---------------------------
  if (loading) return <div className="preview-loading">로딩 중...</div>;

  return (
    <div className="preview-container">
      <h2>{scheduleInfo.store_name}</h2>
      <p className="preview-period">
        {scheduleInfo.week_start} ~ {scheduleInfo.week_end}
      </p>

      {!isFinalized ? (
        <button className="excel-download-btn">
          직원 신청 스케줄 (확정 전)
        </button>
      ) : (
        <button onClick={exportFinalExcel} className="excel-download-btn">
          확정 스케줄 + 인건비 다운로드
        </button>
      )}

      <table className="applicants-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>월</th>
            <th>화</th>
            <th>수</th>
            <th>목</th>
            <th>금</th>
            <th>토</th>
            <th>일</th>
          </tr>
        </thead>
        <tbody>
          {!isFinalized
            ? applicants.map((a, i) => (
              <tr key={i}>
                <td>{a.name}</td>
                <td>{formatApplicantDay(a.mon_type, a.mon_start, a.mon_end)}</td>
                <td>{formatApplicantDay(a.tue_type, a.tue_start, a.tue_end)}</td>
                <td>{formatApplicantDay(a.wed_type, a.wed_start, a.wed_end)}</td>
                <td>{formatApplicantDay(a.thu_type, a.thu_start, a.thu_end)}</td>
                <td>{formatApplicantDay(a.fri_type, a.fri_start, a.fri_end)}</td>
                <td>{formatApplicantDay(a.sat_type, a.sat_start, a.sat_end)}</td>
                <td>{formatApplicantDay(a.sun_type, a.sun_start, a.sun_end)}</td>
              </tr>
            ))
            : assigned.map((a, i) => {
              const s = a.shifts;
              return (
                <tr key={i}>
                  <td>{a.user_name}</td>
                  <td>{formatAssignedDay(s.mon)}</td>
                  <td>{formatAssignedDay(s.tue)}</td>
                  <td>{formatAssignedDay(s.wed)}</td>
                  <td>{formatAssignedDay(s.thu)}</td>
                  <td>{formatAssignedDay(s.fri)}</td>
                  <td>{formatAssignedDay(s.sat)}</td>
                  <td>{formatAssignedDay(s.sun)}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export default SchedulePreview;
