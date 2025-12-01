// src/pages/PayrollCheck/index.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import { jwtDecode } from 'jwt-decode';
import './index.css';

function formatMoney(won) {
  return (won || 0).toLocaleString() + '원';
}

function PayrollCheck() {
  const navigate = useNavigate();

  const [userLevel, setUserLevel] = useState(0);
  const [userStore, setUserStore] = useState(null);
  const [allowedStores, setAllowedStores] = useState([]);

  const [payrolls, setPayrolls] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [workArea, setWorkArea] = useState('all');
  const [stores, setStores] = useState([]);

  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  const [searchName, setSearchName] = useState('');


  // ------------------------------------------------------------------
  // 초기 로드 → 권한 확인 + 이번 달 기본 로드
  // ------------------------------------------------------------------
  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error("로그인이 필요합니다.");
      return navigate('/');
    }

    let dec;
    try {
      dec = jwtDecode(token);
      setUserLevel(dec.level);
      setUserStore(dec.store_id);
    } catch {
      toast.error("세션 오류. 다시 로그인해주세요.");
      return navigate('/');
    }

    const now = new Date();
    const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(month);

    // 로딩 시작
    const loadData = async () => {
      try {
        setLoading(true);

        // 레벨 3 이상만 매장 목록 필요
        const storeReq = dec.level >= 3 ? api.get('/api/stores') : null;
        const allowedReq = dec.level >= 3 ? api.get('/api/user/allowed-stores') : null;

        // 레벨 1~2 → 본인 한 명만
        const payrollReq =
          dec.level <= 2
            ? api.get(`/api/payroll/${month}/single`)
            : api.get(`/api/payroll/${month}`);

        const [storeRes, allowedRes, payrollRes] = await Promise.all([
          storeReq,
          allowedReq,
          payrollReq
        ]);

        // 매장 목록 저장 (3,4레벨만)
        if (storeRes) {
          setStores(storeRes.data || []);
        }

        if (allowedRes?.data) {
          setAllowedStores(allowedRes.data.allowedStores || []);
        }

        if (dec.level <= 2) {
          // 본인 급여 1개만
          setPayrolls(payrollRes.data?.payroll ? [payrollRes.data.payroll] : []);
          setSelectedStore(dec.store_id); // 고정
        } else {
          // 전체 직원 급여 리스트
          setPayrolls(payrollRes.data?.payrolls || []);
        }

      } catch (err) {
        console.error(err);
        toast.error("로드 실패");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  useEffect(() => {
  if (!selectedMonth) return;
  loadPayroll(selectedMonth);
}, [selectedStore, selectedType, workArea]);

  // ------------------------------------------------------------------
  // 급여 로드 (필터 변경)
  // ------------------------------------------------------------------
  const loadPayroll = async (month) => {
    try {
      setLoading(true);

      // 레벨 1~2 → 자기것만
      if (userLevel <= 2) {
        const { data } = await api.get(`/api/payroll/${month}/single`);
        setPayrolls(data?.payroll ? [data.payroll] : []);
        return;
      }

      // 레벨 3~4 (관리자 이상)
      const params = new URLSearchParams();
      if (selectedStore !== 'all') params.append('store_id', selectedStore);
      if (selectedType !== 'all') params.append('employee_type', selectedType);
      if (workArea !== 'all') params.append('work_area', workArea);

      const { data } = await api.get(`/api/payroll/${month}?${params.toString()}`);
      setPayrolls(data?.payrolls || []);
    } catch (err) {
      toast.error("급여 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (e) => {
    const v = e.target.value;
    const month = v ? v.replace('-', '') : '';
    setSelectedMonth(month);
    if (month) loadPayroll(month);
  };

  const toggleWeek = (userId, weekIdx) => {
    setExpanded((prev) => {
      const cur = new Set(prev[userId] || []);
      if (cur.has(weekIdx)) cur.delete(weekIdx);
      else cur.add(weekIdx);
      return { ...prev, [userId]: cur };
    });
  };

  if (loading) return <div className="loading">로딩 중...</div>;

  const isUser = userLevel <= 2;
  const isManager = userLevel === 3;
  const isSuper = userLevel === 4;

  // 필터링 (관리자 이상만 적용됨)
 const filtered = (isUser ? payrolls : payrolls
  .filter((p) => selectedStore === 'all' || String(p.store_id) === String(selectedStore))
  .filter((p) => selectedType === 'all' || p.employee_type === selectedType)
)
.filter((p) => 
  searchName.trim() === '' ||
  p.user_name.toLowerCase().includes(searchName.toLowerCase()) ||
  p.user_name.includes(searchName)
);

  const totalPayroll = filtered.reduce((sum, p) => sum + (p.net_pay || 0), 0);

  return (
    <div className="payroll-page">
      <Header title="급여 내역 확인" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="payroll-container">
          <div className="payroll-header">
            <h1>{isUser ? "내 월급" : "월급 내역 및 인건비"}</h1>

            {/* ----------------- 날짜 선택 (모든 레벨 공통) ----------------- */}
            <div className="filters">
              <span>월 :</span>
              <input
                type="month"
                value={
                  selectedMonth
                    ? `${selectedMonth.slice(0, 4)}-${selectedMonth.slice(4)}`
                    : ''
                }
                onChange={handleMonthChange}
              />

              {/* ----------------- 레벨 1~2는 여기서 종료 ----------------- */}
              {isUser ? null : (
                <>
                  {/* 매장 선택 */}
                  <span> 매장 :</span>
                  <select
                    value={selectedStore}
                    onChange={(e) => {
                    const v = e.target.value;
setSelectedStore(v);
loadPayroll(selectedMonth, { store: v });

                    }}
                  >
                    {isSuper && (
                      <option value="all">전체 매장</option>
                    )}

                    {isManager &&
                      stores
                        .filter((s) => allowedStores.includes(s.id) || s.id === userStore)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}

                    {isSuper &&
                      stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>

                  {/* 직책 */}
                  <span> 직책 :</span>
                  <select
                    value={selectedType}
                    onChange={(e) => {
                      setSelectedType(e.target.value);
                      loadPayroll(selectedMonth);
                    }}
                  >
                    <option value="all">전체 직원</option>
                    <option value="part_time">알바</option>
                    <option value="full_time">정직원</option>
                  </select>

                  {/* 섹션 */}
                  <span> 섹션 :</span>
                  <select
                    value={workArea}
                    onChange={(e) => {
                      setWorkArea(e.target.value);
                      loadPayroll(selectedMonth);
                    }}
                    className="pay-filter-select"
                  >
                    <option value="all">전체</option>
                    <option value="hall">홀</option>
                    <option value="kitchen">주방</option>
                  </select>

                  {/* 엑셀 다운로드 */}
                  <button className="excel-btn" onClick={async () => {
                    try {
                      const params = new URLSearchParams();
                      params.append("store_id", selectedStore);
                      params.append("employee_type", selectedType);
                      params.append("work_area", workArea);

                      const res = await api.get(
                        `/api/payroll/${selectedMonth}/export?${params.toString()}`,
                        { responseType: "blob" }
                      );

                      const blob = new Blob([res.data], {
                        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      });

                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `payroll_${selectedMonth}.xlsx`;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      window.URL.revokeObjectURL(url);
                    } catch (err) {
                      toast.error("엑셀 다운로드 실패");
                    }
                  }}>
                    엑셀 다운로드
                  </button>
                </>
              )}

              <input
  type="text"
  placeholder="직원 이름 검색"
  value={searchName}
  onChange={(e) => setSearchName(e.target.value)}
  className="search-input"
/>

            </div>

            {/* 총 인건비 (관리자만 노출) */}
            {!isUser && (
              <div className="total-payroll">
                <strong>
                  {selectedMonth &&
                    `${selectedMonth.slice(0, 4)}년 ${parseInt(
                      selectedMonth.slice(4),
                      10
                    )}월`}
                  &nbsp;총 인건비:
                  <span style={{ color: "#d32f2f", fontSize: "1.3em" }}>
                    {" "}
                    {formatMoney(totalPayroll)}
                  </span>
                </strong>
              </div>
            )}
          </div>

          {/* ----------------- 출력 영역 ----------------- */}
          {filtered.length === 0 ? (
            <p className="no-data">해당 조건의 급여 내역이 없습니다.</p>
          ) : (
            <div className="payroll-list">
              {filtered.map((p) => (
                <div key={p.user_id} className="employee-card">
                  <div className="employee-header">
                    <div className="emp-left">
                      <h2>
                        {p.user_name} ({p.employee_type === "part_time" ? "알바" : "정직원"})
                      </h2>
                      <div className="emp-sub">
                        총 근무 {p.total_work_time_str} / 실수령{" "}
                        <strong>{formatMoney(p.net_pay)}</strong>
                      </div>
                    </div>

                    <div className="emp-right">
                      <div>기본급: {formatMoney(p.base_pay)}</div>
                      <div>초과: {formatMoney(p.overtime_pay)}</div>
                    </div>
                  </div>

                  <div className="weeks">
                    {p.weeks.map((w, wi) => {
                      const open = expanded[p.user_id]?.has(wi);

                      return (
                        <div key={w.week_label} className="week-block">
                          <button
                            className="week-summary"
                            onClick={() => toggleWeek(p.user_id, wi)}
                          >
                            <div className="week-left">
                              <strong>{w.week_label}</strong>
                              <div>{w.week_time_str}</div>
                            </div>

                            <div className="week-right">
                              {formatMoney(w.week_total_pay)}
                              <span style={{ marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
                            </div>
                          </button>

                          {open && (
                            <div className="week-details">
                              <table className="daily-table">
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
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" />
    </div>
  );
}

export default PayrollCheck;
