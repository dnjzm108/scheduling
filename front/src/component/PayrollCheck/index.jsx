// src/pages/PayrollCheck/index.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import './index.css';

function formatMoney(won) {
  return (won || 0).toLocaleString() + '원';
}

function PayrollCheck() {
  const navigate = useNavigate();

  const [payrolls, setPayrolls] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedType, setSelectedType] = useState('all'); // all, part_time, full_time
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [workArea, setWorkArea] = useState("all");


  useEffect(() => {
    const token = getToken();
    if (!token || token.trim() === '') {
      toast.error('로그인 필요');
      navigate('/');
      return;
    }

    const now = new Date();
    const defaultMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(defaultMonth);

    const loadData = async () => {
      try {
        setLoading(true);
        const [storesRes, payrollRes] = await Promise.all([
          api.get('/api/stores'),
          api.get(`/api/payroll/${defaultMonth}`)
        ]);
        setStores([{ id: 'all', name: '전체 매장' }, ...(storesRes.data || [])]);
        setPayrolls((payrollRes.data && payrollRes.data.payrolls) || []);
      } catch (err) {
        if (!axios.isCancel(err)) {
          toast.error('데이터 로드 실패');
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  const loadPayroll = async (month) => {
    try {
      setLoading(true);

      const params = new URLSearchParams();

      // 월
      params.append("month", month);

      // 매장
      if (selectedStore !== "all") params.append("store_id", selectedStore);

      // 직책
      if (selectedType !== "all") params.append("employee_type", selectedType);

      // 홀/주방
      if (workArea !== "all") params.append("work_area", workArea);

      const { data } = await api.get(`/api/payroll/${month}?${params.toString()}`);
      setPayrolls(data?.payrolls || []);
    } catch (err) {
      toast.error("급여 로드 실패");
    } finally {
      setLoading(false);
    }
  };



  const handleMonthChange = async (e) => {
    const v = e.target.value; // YYYY-MM
    const month = v ? v.replace('-', '') : '';
    setSelectedMonth(month);
    if (month) await loadPayroll(month);
  };

  const handleFilterChange = async () => {
    if (selectedMonth) await loadPayroll(selectedMonth);
  };

  // 엑셀 다운로드
  const handleDownloadExcel = async () => {
    if (!selectedMonth) {
      toast.warn('먼저 월을 선택해주세요.');
      return;
    }
    try {
      const params = new URLSearchParams();

      params.append("store_id", selectedStore);
      params.append("employee_type", selectedType);
      params.append("work_area", workArea);

      const res = await api.get(`/api/payroll/${selectedMonth}/export?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payroll_${selectedMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('엑셀 다운로드 실패');
    }
  };

  const filtered = payrolls
    .filter(p => selectedStore === 'all' || String(p.store_id) === String(selectedStore))
    .filter(p => selectedType === 'all' || p.employee_type === selectedType);

  const totalPayroll = filtered.reduce((s, p) => s + (p.net_pay || 0), 0);

  const toggleWeek = (userId, weekIdx) => {
    setExpanded(prev => {
      const cur = new Set(prev[userId] || []);
      if (cur.has(weekIdx)) cur.delete(weekIdx);
      else cur.add(weekIdx);
      return { ...prev, [userId]: cur };
    });
  };

  if (loading) return <div className="loading">로딩 중...</div>;

  return (
    <div className="payroll-page">
      <Header title="급여 내역 확인" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="payroll-container">
          <div className="payroll-header">
            <h1>월급 내역 및 인건비</h1>

            <div className="filters">
              <span> 월 :</span>
              <input
                type="month"
                value={
                  selectedMonth
                    ? `${selectedMonth.slice(0, 4)}-${selectedMonth.slice(4)}`
                    : ''
                }
                onChange={handleMonthChange}
              />

              <span> 매장 :</span>
              <select
                value={selectedStore}
                onChange={(e) => {
                  setSelectedStore(e.target.value);
                  if (selectedMonth) loadPayroll(selectedMonth);
                }}
              >
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>


              <span> 직책 :</span>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  handleFilterChange();
                }}
              >
                <option value="all">전체 직원</option>
                <option value="part_time">알바</option>
                <option value="full_time">정직원</option>
              </select>

              <span> 섹션 :</span>
              <select
                value={workArea}
                onChange={(e) => {
                  setWorkArea(e.target.value);
                  handleFilterChange();   // 🔥 변경 시 즉시 재로드
                }}
                className="pay-filter-select"
              >
                <option value="all">전체</option>
                <option value="hall">홀</option>
                <option value="kitchen">주방</option>
              </select>

              {/* 엑셀 다운로드 버튼 */}
              <button className="excel-btn" onClick={handleDownloadExcel}>
                엑셀 다운로드
              </button>
            </div>


            <div className="total-payroll">
              <strong>
                {selectedMonth ? `${selectedMonth.slice(0, 4)}년 ${parseInt(selectedMonth.slice(4))}월` : ''} 인건비 총액:
                <span style={{ color: '#d32f2f', fontSize: '1.4em' }}> {formatMoney(totalPayroll)}</span>
              </strong>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="no-data">해당 조건의 급여 내역이 없습니다.</p>
          ) : (
            <div className="payroll-list">
              {filtered.map(p => (
                <div key={`${p.user_id}-${p.store_id}`} className="employee-card">
                  <div className="employee-header">
                    <div className="emp-left">
                      <h2>{p.user_name} <span className="emp-type">({p.employee_type === 'part_time' ? '알바' : '정직원'})</span></h2>
                      <div className="emp-sub">총 근무: {p.total_work_time_str} / 실수령: <strong>{formatMoney(p.net_pay)}</strong></div>
                    </div>
                    <div className="emp-right">
                      <div>기본급: {formatMoney(p.base_pay)}</div>
                      <div>초과: {formatMoney(p.overtime_pay)}</div>
                    </div>
                  </div>

                  <div className="weeks">
                    {p.weeks.map((w, wi) => {
                      const isOpen = (expanded[p.user_id] && expanded[p.user_id].has(wi));
                      return (
                        <div key={w.week_start_iso} className="week-block">
                          <button className="week-summary" onClick={() => toggleWeek(p.user_id, wi)}>
                            <div className="week-left">
                              <strong>{w.week_label}</strong>
                              <div className="week-sub">{w.week_time_str} / 시급: {formatMoney(w.rate_for_week)}</div>
                            </div>
                            <div className="week-right">
                              <div>{formatMoney(w.week_total_pay || w.week_base_pay)}</div>
                              <div className="chev">{isOpen ? '▲' : '▼'}</div>
                            </div>
                          </button>

                          {isOpen && (
                            <div className="week-details">
                              <table className="daily-table">
                                <thead>
                                  <tr>
                                    <th>날짜 (요일)</th>
                                    <th>출근시간</th>
                                    <th>퇴근시간</th>
                                    <th>근무시간</th>
                                    <th>적용시급</th>
                                    <th>일급</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {w.days.map((d, di) => (
                                    <tr key={d.date_iso + '-' + di}>
                                      <td>{d.day_label}</td>
                                      <td>{d.start}</td>
                                      <td>{d.end}</td>
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

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default PayrollCheck;
