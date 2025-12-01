import React, { useState, useEffect } from "react";
import Header from "../Header";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import api from "../../utils/api";
import "./index.css";

function formatMoney(num) {
  return (num || 0).toLocaleString() + "원";
}

const MyPayroll = () => {
  const [month, setMonth] = useState("");   // YYYYMM
  const [inputMonth, setInputMonth] = useState(""); // YYYY-MM
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false); // 🔥 중복 요청 방지

  // =====================================================================
  // 🔥 첫 로드시 이번달 자동 설정 & 단 한 번만 API 요청
  // =====================================================================
  useEffect(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");

    const ymStr = `${y}${m}`;
    const ymInput = `${y}-${m}`;

    setMonth(ymStr);
    setInputMonth(ymInput);

    // 첫 로드시 단 한 번만 로드
    loadPayroll(ymStr);

    setInitialized(true);
  }, []);

  const loadPayroll = async (m) => {
    try {
      setLoading(true);

      const { data } = await api.get(`/api/payroll/${m}?mode=single`);
      setData(data);

    } catch (err) {
        if(err.message !== '중복 요청 취소'){
            toast.error(err.response?.data?.message || "조회 실패");
            setData(null);
        }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMonth = (e) => {
    const v = e.target.value; // YYYY-MM
    setInputMonth(v);

    if (!initialized) return; // 🔥 초기 셋팅 이벤트는 무시

    if (!v) return;
    const monthStr = v.replace("-", ""); // YYYYMM
    setMonth(monthStr);
    loadPayroll(monthStr);
  };

  return (
    <div className="mypayroll-page">
      <Header title="내 급여 확인" backTo="/MySchedules" />

      <div className="page-with-header">
        <div className="mypayroll-container">
          <h1>개인 월급 정산</h1>

          <div className="mypayroll-controls">
            <span>월 선택:</span>
            <input
              type="month"
              value={inputMonth}
              onChange={handleSelectMonth}
            />

            {loading && <div className="loading">로딩 중...</div>}
          </div>

          {!loading && data && (
            <>
              <h2>
                {data.user_name} — 총 급여{" "}
                <span style={{ color: "#e53935" }}>{formatMoney(data.net_pay)}</span>
              </h2>

              <p>
                총 근무시간: {data.total_work_time_str} / 타입:{" "}
                {data.employee_type === "part_time" ? "알바" : "정직원"}
              </p>

              <div className="weeks-list">
                {data.weeks.map((w, wi) => (
                  <div key={wi} className="my-week-block">
                    <div className="week-header">
                      <strong>{w.week_label}</strong>
                      <span>
                        {w.week_time_str} / {formatMoney(w.week_total_pay)}
                      </span>
                    </div>

                    <table className="mypayroll-daily-table">
                      <thead>
                        <tr>
                          <th>날짜</th>
                          <th>출근</th>
                          <th>퇴근</th>
                          <th>쉬는시간</th>
                          <th>근무시간</th>
                          <th>시급</th>
                          <th>일급</th>
                        </tr>
                      </thead>

                      <tbody>
                        {w.days.map((d, di) => (
                          <tr key={di}>
                            <td>{d.day_label}</td>
                            <td>{d.start}</td>
                            <td>{d.end}</td>
                            <td>{d.break}분</td>
                            <td>{d.time_str}</td>
                            <td>{formatMoney(d.hourly_rate_used)}</td>
                            <td>{formatMoney(d.pay)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loading && !data && (
            <div className="no-data">월급 데이터가 없습니다.</div>
          )}
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" />
    </div>
  );
};

export default MyPayroll;
