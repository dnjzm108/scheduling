// src/pages/StoreSales/index.jsx
import React, { useEffect, useState, useRef } from "react";
import api from "../../utils/api";
import "./index.css";
import Header from "../Header";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";

import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

// 날짜 포맷 YY-MM-DD (테이블 표시용)
const formatDateShort = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

// 오늘 날짜
const getToday = () => new Date().toISOString().slice(0, 10);

const StoreSales = () => {
  const [user, setUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState(""); // 🔧 빈 문자열로 초기화 (null 금지)

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear();

  const [month, setMonth] = useState(currentMonth);
  const [sales, setSales] = useState([]);

  const [mode, setMode] = useState("search"); // search | register

  const [salesDate, setSalesDate] = useState(getToday());
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [isEdit, setIsEdit] = useState(false);

  const fetchLock = useRef(false);
  const [chartView, setChartView] = useState("day");

  // ===================================================================
  // 초기 데이터 로드
  // ===================================================================
  useEffect(() => {
    const loadData = async () => {
      try {
        const [userRes, storeRes] = await Promise.all([
          api.get("/api/user"),
          api.get("/api/stores")
        ]);

        const userData = userRes.data;
        setUser(userData);
        setStores(storeRes.data);

        // 기본 매장: 자기 매장 (문자열로 저장)
        setStoreId(userData.store_id ? String(userData.store_id) : "");
      } catch (err) {
        alert("초기 정보를 불러오지 못했습니다.");
      }
    };

    loadData();
  }, []);

  // ===================================================================
  // 월별 매출 조회
  // ===================================================================
  const fetchMonthlySales = async () => {
    if (!storeId || !month) return;
    if (fetchLock.current) return;

    fetchLock.current = true;

    try {
      const res = await api.get(`/api/store-sales/${storeId}`, {
        params: { type: "month", date: `${month}-01` }
      });

      // 테이블용: 최신 날짜가 위로 오게 내림차순 정렬
      const sorted = (res.data || []).sort(
        (a, b) => new Date(b.sales_date) - new Date(a.sales_date)
      );

      setSales(sorted);
    } catch (err) {
      setSales([]);
    } finally {
      fetchLock.current = false;
    }
  };

  useEffect(() => {
    if (mode === "search") fetchMonthlySales();
  }, [storeId, month, mode]);

  // ===================================================================
  // 저장 / 수정
  // ===================================================================
  const saveSales = async () => {
    if (!salesDate || !amount) {
      alert("날짜와 금액은 필수입니다.");
      return;
    }

    try {
      await api.post("/api/store-sales", {
        store_id: storeId, // 문자열 그대로 전달 (백엔드에서 Number 처리)
        sales_date: salesDate,
        sales_amount: Number(amount),
        memo
      });

      alert(isEdit ? "수정 완료!" : "저장 완료!");
      setIsEdit(false);

      setSalesDate(getToday());
      setAmount("");
      setMemo("");

      setMode("search");
      fetchMonthlySales();
    } catch {
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  // ===================================================================
  // 삭제
  // ===================================================================
  const deleteSales = async (sales_date) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    try {
      await api.delete("/api/store-sales", {
        data: { store_id: storeId, sales_date }
      });

      alert("삭제 완료!");
      fetchMonthlySales();
    } catch {
      alert("삭제 중 오류 발생");
    }
  };

  // ===================================================================
  // 수정 시작
  // ===================================================================
  const editSales = (entry) => {
    setMode("register");
    setIsEdit(true);

    // 백엔드에서 YYYY-MM-DD 로 내려오므로 그대로 사용
    setSalesDate(entry.sales_date);
    setAmount(entry.sales_amount);
    setMemo(entry.memo || "");
  };

  // ===================================================================
  // 그래프 데이터 생성 (최신 날짜가 오른쪽에 오도록 오름차순 정렬 사용)
  // ===================================================================
  const createChartData = () => {
    if (sales.length === 0) return null;

    // 그래프용: 오래된 날짜 → 최신 날짜 (오름차순)
    const sortedForChart = [...sales].sort(
      (a, b) => new Date(a.sales_date) - new Date(b.sales_date)
    );

    let labels = [];
    let values = [];

    if (chartView === "day" || chartView === "week") {
      labels = sortedForChart.map((s) => formatDateShort(s.sales_date));
      values = sortedForChart.map((s) => s.sales_amount);
    } else if (chartView === "month") {
      // 올해 데이터 월별 합산 (1~12월 순서대로)
      const yearData = {};
      sortedForChart.forEach((s) => {
        const y = Number(s.sales_date.slice(0, 4));
        const m = Number(s.sales_date.slice(5, 7));
        if (y === currentYear) {
          if (!yearData[m]) yearData[m] = 0;
          yearData[m] += s.sales_amount;
        }
      });

      const monthLabels = [];
      const monthValues = [];
      for (let m = 1; m <= 12; m++) {
        if (yearData[m]) {
          monthLabels.push(`${m}월`);
          monthValues.push(yearData[m]);
        }
      }

      labels = monthLabels;
      values = monthValues;
    }

    return {
      labels,
      datasets: [
        {
          label: "매출액",
          data: values,
          backgroundColor: "rgba(75,192,192,0.6)",
          borderColor: "rgba(75,192,192,1)"
        }
      ]
    };
  };

  const chartData = createChartData();

  // ===================================================================
  // 렌더링
  // ===================================================================
  return (
    <div className="sales-page">
      <Header title="📊 매장 매출 관리" />

      {/* 모드 선택 */}
      <div className="mode-tabs">
        <button
          className={mode === "search" ? "tab active" : "tab"}
          onClick={() => setMode("search")}
        >
          조회 모드
        </button>

        <button
          className={mode === "register" ? "tab active" : "tab"}
          onClick={() => {
            setMode("register");
            setIsEdit(false);
            setSalesDate(getToday());
            setAmount("");
            setMemo("");
          }}
        >
          등록 모드
        </button>
      </div>

      {/* 매장 선택 — 총관리자만 변경 가능, 그 외는 본인 매장 고정 */}
      <div className="form-row">
        <label>매장</label>
        <select
          value={storeId || ""} // 🔧 null 대신 항상 문자열
          onChange={(e) => setStoreId(e.target.value)}
          disabled={user ? user.level !== 4 : true} // user 로드 전까지는 비활성화
        >
          {/* user가 매장 관리자인 경우에도, 본인 매장만 하나 나오게 설정돼 있다고 가정 */}
          {stores.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* =========================
          조회 모드
      ========================== */}
      {mode === "search" && (
        <>
          <div className="form-row">
            <label>조회 월</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>그래프 단위</label>
            <select
              value={chartView}
              onChange={(e) => setChartView(e.target.value)}
            >
              <option value="day">일 단위</option>
              <option value="week">주 단위</option>
              <option value="month">월 단위</option>
            </select>
          </div>

          <h2>📈 매출 그래프</h2>
          {chartData ? <Line data={chartData} /> : <p>그래프 데이터 없음</p>}

          <h2>📅 조회 결과</h2>
          <table className="sales-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>매출액</th>
                <th>메모</th>
                <th>옵션</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s, idx) => (
                <tr key={idx}>
                  <td>{formatDateShort(s.sales_date)}</td>
                  <td>{s.sales_amount.toLocaleString()}</td>
                  <td>{s.memo}</td>
                  <td>
                    <button className="btn-edit" onClick={() => editSales(s)}>
                      수정
                    </button>
                    <button
                      className="btn-delete"
                      onClick={() => deleteSales(s.sales_date)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* =========================
          등록 / 수정 모드
      ========================== */}
      {mode === "register" && (
        <>
          <h2>{isEdit ? "매출 수정" : "매출 등록"}</h2>

          <div className="form-row">
            <label>날짜</label>
            <input
              type="date"
              value={salesDate}
              onChange={(e) => setSalesDate(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>매출액</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            ></textarea>
          </div>

          <div className="button-row">
            <button className="btn-save" onClick={saveSales}>
              {isEdit ? "수정하기" : "저장하기"}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default StoreSales;
