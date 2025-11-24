// src/component/EmployeeManagement/index.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function EmployeeManagement() {
  const navigate = useNavigate();
  const isProcessing = useRef(false);
  const hasLoaded = useRef(false);

  const [userInfo, setUserInfo] = useState({ level: 0, store_id: null });
  const [employees, setEmployees] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  const [activeTab, setActiveTab] = useState('employees');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const getLevelText = (level) => {
    const levels = ['미승인', '알바', '직원', '매장관리자', '총관리자'];
    return levels[level] || '알 수 없음';
  };

  const getWorkAreaText = (area) => {
    if (area === 'hall') return '홀';
    if (area === 'kitchen') return '주방';
    return '매장';
  };

  const formatPhone = (phone) => {
    if (!phone || phone.length !== 11) return '미등록';
    return `${phone.substring(0, 3)}-${phone.substring(3, 7)}-${phone.substring(7, 11)}`;
  };

  const formatHireDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return '미등록';
    const yy = dateStr.substring(0, 2);
    const mm = dateStr.substring(2, 4);
    const dd = dateStr.substring(4, 6);
    return `20${yy}-${mm}-${dd}`;
  };

  // 초기 로드
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [userRes, empRes, storeRes, pendingRes] = await Promise.all([
          api.get('/api/user'),
          api.get('/api/user/employees?store_id=all'),
          api.get('/api/stores'),
          api.get('/api/user/pending-users')
        ]);

        setUserInfo(userRes.data);
        setEmployees(empRes.data || []);
        setStores(storeRes.data || []);
        setPendingUsers(pendingRes.data || []);

        if (pendingRes.data?.length > 0) {
          setActiveTab('pending');
        }
      } catch (err) {
        if (!axios.isCancel(err)) {
          toast.error(err.response?.data?.message || '데이터 로드 실패');
          if (err.response?.status === 401 || err.response?.status === 403) {
            removeToken();
            navigate('/');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  const filteredPendingUsers = pendingUsers.filter(u => {
    if (selectedStore === 'all') return true;
    return u.store_id === parseInt(selectedStore);
  });

  const visibleEmployees = employees
    .filter(e => e.level >= 1)
    .filter(e => userInfo.level === 3 ? true : e.store_id === userInfo.store_id)
    .filter(e => selectedStore === 'all' ? true : e.store_id === parseInt(selectedStore));

  const handleApprove = async (id) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    try {
      await api.put(`/api/user/${id}/approve`);
      const user = pendingUsers.find(u => u.id === id);
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      setEmployees(prev => [...prev, { ...user, level: 1 }]);
      toast.success('승인 완료');
      if (filteredPendingUsers.length === 1) setActiveTab('employees');
    } catch (err) {
      toast.error(err.response?.data?.message || '승인 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const handleReject = async (id) => {
    if (isProcessing.current || !window.confirm('거부하시겠습니까?')) return;
    isProcessing.current = true;
    try {
      await api.put(`/api/user/${id}/reject`);
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      toast.success('거부 완료');
      if (filteredPendingUsers.length === 1) setActiveTab('employees');
    } catch (err) {
      toast.error(err.response?.data?.message || '거부 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  // 수정 시작
  const startEdit = (emp) => {
    const info = emp.salary_info || {};
    setEditing({
      type: 'info',
      data: {
        ...emp,
        phone: emp.phone || '',
        hire_date: emp.hire_date || '',
        level: emp.level,

        hourly_rate_under15: info.hourly_rate || '',
        hourly_rate_15plus: info.hourly_rate_with_holiday || '',
        monthly_base_salary: info.monthly_salary || '',

        bank_name: emp.bank_name || '',
        bank_account: emp.bank_account || '',
        account_holder: emp.account_holder || '',
        tax_type: emp.tax_type ?? 0,
        work_area: emp.work_area || 'both'
      }
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    const d = editing.data;

    if (!d.name || !d.userId || !d.phone) return toast.error('필수 항목 입력');

    const phoneDB = d.phone.replace(/-/g, '');
    if (phoneDB.length !== 11 || !/^\d{11}$/.test(phoneDB)) {
      return toast.error('전화번호는 11자리 숫자여야 합니다.');
    }

    const hireDateDB = d.hire_date?.replace(/-/g, '') || null;
    if (hireDateDB && (hireDateDB.length !== 6 || !/^\d{6}$/.test(hireDateDB))) {
      return toast.error('입사일은 YYMMDD 형식 (예: 251116) 이어야 합니다.');
    }

    const payload = {
      name: d.name,
      userId: d.userId,
      phone: phoneDB,
      store_id: d.store_id || null,
      hire_date: hireDateDB,
      level: parseInt(d.level),

      bank_name: d.bank_name || null,
      bank_account: d.bank_account || null,
      account_holder: d.account_holder || null,
      tax_type: d.tax_type ?? 0,
      work_area: d.work_area || 'both',
    };

    if (d.level === 1) {
      if (!d.hourly_rate_under15 || !d.hourly_rate_15plus) {
        return toast.error('알바는 기본 시급과 주휴수당 포함 시급을 모두 입력해야 합니다.');
      }
      payload.hourly_rate = parseInt(d.hourly_rate_under15);
      payload.hourly_rate_with_holiday = parseInt(d.hourly_rate_15plus);
    }

    if (d.level === 2 || d.level === 3) {
      if (!d.monthly_base_salary) {
        return toast.error('직원/매장관리자는 월급을 입력해야 합니다.');
      }
      payload.monthly_salary = parseInt(d.monthly_base_salary);
    }

    try {
      const res = await api.put(`/api/user/${d.id}`, payload);

      setEmployees(prev => prev.map(e => e.id === d.id ? {
        ...e,
        ...payload,
        salary_info: res.data.user.salary_info
      } : e));

      setEditing(null);
      toast.success('수정 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '수정 실패');
    }
  };

  const startPasswordEdit = (emp) => setEditing({ type: 'password', data: { id: emp.id, newPassword: '' } });

  const savePassword = async (e) => {
    e.preventDefault();
    if (!editing.data.newPassword) return toast.error('비밀번호 입력');
    try {
      await api.put(`/api/user/${editing.data.id}/password`, { password: editing.data.newPassword });
      setEditing(null);
      toast.success('비밀번호 변경 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '변경 실패');
    }
  };

  const handleDelete = async (id) => {
    if (isProcessing.current || !window.confirm('삭제하시겠습니까?')) return;
    isProcessing.current = true;
    try {
      await api.delete(`/api/user/${id}`);
      setEmployees(prev => prev.filter(e => e.id !== id));
      toast.success('삭제 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '삭제 실패');
    } finally {
      isProcessing.current = false;
    }
  };



  return (
    <div className="emp-page">
      <Header title="직원 관리" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="emp-container">

          {userInfo.level >= 3 && (
            <div className="emp-filter">
              <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
                <option value="all">모든 매장</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="emp-tabs">
            <button
              className={`emp-tab ${activeTab === 'employees' ? 'emp-tab-active' : ''}`}
              onClick={() => setActiveTab('employees')}
            >
              직원 목록 ({visibleEmployees.length})
            </button>
            <button
              className={`emp-tab ${activeTab === 'pending' ? 'emp-tab-active' : ''}`}
              onClick={() => setActiveTab('pending')}
              disabled={filteredPendingUsers.length === 0}
            >
              승인 대기 ({filteredPendingUsers.length})
            </button>
          </div>

          {loading ? (
            <div className="emp-loading">로딩 중...</div>
          ) : editing?.type ? (
            editing.type === 'info' ? (
              <form onSubmit={saveEdit} className="emp-edit-form">

                <div className="form-group">
                  <label>이름</label>
                  <input
                    value={editing.data.name}
                    onChange={e => setEditing(p => ({ ...p, data: { ...p.data, name: e.target.value } }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>아이디</label>
                  <input
                    value={editing.data.userId}
                    onChange={e => setEditing(p => ({ ...p, data: { ...p.data, userId: e.target.value } }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>전화번호</label>
                  <input
                    value={editing.data.phone}
                    onChange={e => {
                      let val = e.target.value.replace(/[^0-9]/g, '').slice(0, 11);
                      if (val.length >= 8) val = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7);
                      else if (val.length >= 4) val = val.slice(0, 3) + '-' + val.slice(3);
                      setEditing(p => ({ ...p, data: { ...p.data, phone: val } }));
                    }}
                    placeholder="010-1234-5678"
                    maxLength={13}
                  />
                </div>

                <div className="form-group">
                  <label>입사일</label>
                  <input
                    value={editing.data.hire_date}
                    onChange={e => {
                      let val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      if (val.length >= 5) val = val.slice(0, 2) + '-' + val.slice(2, 4) + '-' + val.slice(4);
                      else if (val.length >= 3) val = val.slice(0, 2) + '-' + val.slice(2);
                      setEditing(p => ({ ...p, data: { ...p.data, hire_date: val } }));
                    }}
                    placeholder="25-11-16"
                    maxLength={8}
                  />
                </div>

                <div className="form-group">
                  <label>매장</label>
                  <select
                    value={editing.data.store_id || ''}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, store_id: parseInt(e.target.value) || null } }))
                    }
                  >
                    <option value="">매장 미배정</option>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>직책</label>
                  <select
                    value={editing.data.level}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, level: parseInt(e.target.value) } }))
                    }
                  >
                    <option value="1">알바</option>
                    <option value="2">직원</option>
                    <option value="3">매장관리자</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>기본 근무 파트</label>
                  <select
                    value={editing.data.work_area}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, work_area: e.target.value } }))
                    }
                  >
                    <option value="hall">홀</option>
                    <option value="kitchen">주방</option>
                    <option value="both">매장</option>
                  </select>
                </div>

                {editing.data.level === 1 && (
                  <>
                    <div className="form-group">
                      <label>기본 시급</label>
                      <input
                        type="number"
                        value={editing.data.hourly_rate_under15}
                        onChange={e =>
                          setEditing(p => ({ ...p, data: { ...p.data, hourly_rate_under15: e.target.value } }))
                        }
                        placeholder="예: 9860"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>주휴수당 포함 시급</label>
                      <input
                        type="number"
                        value={editing.data.hourly_rate_15plus}
                        onChange={e =>
                          setEditing(p => ({ ...p, data: { ...p.data, hourly_rate_15plus: e.target.value } }))
                        }
                        placeholder="예: 11339"
                        required
                      />
                    </div>
                  </>
                )}

                {(editing.data.level === 2 || editing.data.level === 3) && (
                  <div className="form-group">
                    <label>기본 월급</label>
                    <input
                      type="number"
                      value={editing.data.monthly_base_salary}
                      onChange={e =>
                        setEditing(p => ({ ...p, data: { ...p.data, monthly_base_salary: e.target.value } }))
                      }
                      placeholder="예: 2800000"
                      required
                    />
                  </div>
                )}

                {/* 은행 / 계좌 / 예금주 / 세금 */}
                <div className="form-group">
                  <label>은행명</label>
                  <input
                    value={editing.data.bank_name}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, bank_name: e.target.value } }))
                    }
                    placeholder="예: 신한은행"
                  />
                </div>

                <div className="form-group">
                  <label>계좌번호</label>
                  <input
                    value={editing.data.bank_account}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, bank_account: e.target.value } }))
                    }
                    placeholder="숫자만 입력"
                  />
                </div>

                <div className="form-group">
                  <label>통장 명의자</label>
                  <input
                    value={editing.data.account_holder}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, account_holder: e.target.value } }))
                    }
                    placeholder="예: 홍길동"
                  />
                </div>

                <div className="form-group">
                  <label>세금 방식</label>
                  <select
                    value={editing.data.tax_type}
                    onChange={e =>
                      setEditing(p => ({ ...p, data: { ...p.data, tax_type: parseInt(e.target.value) } }))
                    }
                  >
                    <option value={0}>3.3% 공제</option>
                    <option value={1}>4대보험 적용</option>
                  </select>
                </div>

                <div className="emp-form-actions">
                  <button type="submit">저장</button>
                  <button type="button" onClick={() => setEditing(null)}>취소</button>
                </div>
              </form>
            ) : (
              <form onSubmit={savePassword} className="emp-pw-form">
                <input
                  type="password"
                  onChange={e =>
                    setEditing(p => ({ ...p, data: { ...p.data, newPassword: e.target.value } }))
                  }
                  placeholder="새 비밀번호"
                  required
                />
                <div className="emp-form-actions">
                  <button type="submit">변경</button>
                  <button type="button" onClick={() => setEditing(null)}>취소</button>
                </div>
              </form>
            )
          ) : activeTab === 'pending' ? (
            filteredPendingUsers.length > 0 ? (
              <div className="emp-list">
                {filteredPendingUsers.map(u => (
                  <div key={u.id} className="emp-item pending">
                    <div className="emp-info">
                      <div><strong>{u.name}</strong> ({u.userId})</div>
                      <div>전화: {formatPhone(u.phone)}</div>
                      <div>매장: {stores.find(s => s.id === u.store_id)?.name || '없음'}</div>
                      <div>가입일: {new Date(u.signup_date).toLocaleDateString()}</div>
                    </div>
                    <div className="emp-actions">
                      <button onClick={() => handleApprove(u.id)}>승인</button>
                      <button onClick={() => handleReject(u.id)} className="delete">거부</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="emp-no-data">승인 대기 인원이 없습니다.</p>
            )
          ) : visibleEmployees.length === 0 ? (
            <p className="emp-no-data">직원이 없습니다.</p>
          ) : (
            <div className="emp-list">
              {visibleEmployees.map(emp => {
                const info = emp.salary_info || {};
                return (
                  <div key={emp.id} className="emp-item">
                    <div className="emp-info">
                      <div><strong>{emp.name}</strong> ({emp.userId})</div>
                      <div>전화: {formatPhone(emp.phone)}</div>
                      <div>매장: {stores.find(s => s.id === emp.store_id)?.name || '없음'}</div>
                      <div>직책: <strong>{getLevelText(emp.level)}</strong></div>
                      <div>입사일: {formatHireDate(emp.hire_date)}</div>
                      <div>근무 파트: <strong>{getWorkAreaText(emp.work_area)}</strong></div>

                      {emp.level === 1 && (
                        <div>
                          기본 시급: <strong>{(info.hourly_rate || 0).toLocaleString()}원</strong><br />
                          주휴수당 포함 시급: <strong>{(info.hourly_rate_with_holiday || 0).toLocaleString()}원</strong>
                        </div>
                      )}
                      {(emp.level === 2 || emp.level === 3) && (
                        <div>
                          월급: <strong>{(info.monthly_salary || 0).toLocaleString()}원</strong>
                        </div>
                      )}

                      <div>
                        은행: {emp.bank_name || '미등록'} / 계좌: {emp.bank_account || '미등록'} / 예금주: {emp.account_holder || '미등록'}
                      </div>
                      <div>
                        세금 방식: {emp.tax_type === 1 ? '4대보험' : '3.3% 공제'}
                      </div>
                    </div>
                    <div className="emp-actions">

                      {emp.level < userInfo.level && (
                        <>
                          <button onClick={() => startEdit(emp)}>수정</button>
                          <button onClick={() => startPasswordEdit(emp)}>비밀번호</button>
                          <button onClick={() => handleDelete(emp.id)} className="delete">
                            퇴사처리
                          </button>
                        </>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default EmployeeManagement;
