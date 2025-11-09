// src/component/employeemanagement/index.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function EmployeeManagement() {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState({ name: '', level: 0, store_id: null });
  const [employees, setEmployees] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { type: 'info' | 'password', data: {} }
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' | 'pending'
  const loaded = useRef(false);

  // level → 텍스트
  const getLevelText = (level) => {
    const levels = ['승인대기', '직원', '매장관리자', '총관리자'];
    return levels[level] || '알 수 없음';
  };

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const [userRes, empRes, storeRes, pendingRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/user`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/user/employees?store_id=all`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/stores`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/user/pending-users`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        const user = userRes.data;
        setUserInfo({ name: user.name, level: user.level, store_id: user.store_id });
        setStores(storeRes.data || []);
        setPendingUsers(pendingRes.data || []);
        setEmployees(empRes.data || []);
      } catch (err) {
        toast.error(err.response?.data?.message || '데이터 로드 실패');
        if (err.response?.status === 401 || err.response?.status === 403) {
          removeToken();
          setTimeout(() => navigate('/'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  // 권한에 따른 직원 필터링
  const getVisibleEmployees = () => {
    let filtered = employees.filter(e => e.level >= 1); // 승인된 직원만

    if (userInfo.level === 2) {
      filtered = filtered.filter(e => e.store_id === userInfo.store_id);
    }

    if (selectedStore !== 'all') {
      filtered = filtered.filter(e => e.store_id === parseInt(selectedStore));
    }

    return filtered;
  };

  const visibleEmployees = getVisibleEmployees();

  // 승인
  const handleApprove = async (id) => {
    try {
      await axios.put(`${BASE_URL}/api/user/${id}/approve`, {}, { headers: { Authorization: `Bearer ${getToken()}` } });
      const approvedUser = pendingUsers.find(u => u.id === id);
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      setEmployees(prev => [...prev, { ...approvedUser, level: 1 }]);
      toast.success('승인 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '승인 실패');
    }
  };

  // 거부
  const handleReject = async (id) => {
    if (!window.confirm('거부하시겠습니까?')) return;
    try {
      await axios.put(`${BASE_URL}/api/user/${id}/reject`, {}, { headers: { Authorization: `Bearer ${getToken()}` } });
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      toast.success('거부 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '거부 실패');
    }
  };

  // 정보 수정
  const startEdit = (emp) => setEditing({ type: 'info', data: { ...emp } });
  const saveEdit = async (e) => {
    e.preventDefault();
    const d = editing.data;
    if (!d.name || !d.userId || !d.phone) return toast.error('필수 항목 누락');

    try {
      await axios.put(`${BASE_URL}/api/user/${d.id}`, d, { headers: { Authorization: `Bearer ${getToken()}` } });
      setEmployees(prev => prev.map(e => e.id === d.id ? d : e));
      setEditing(null);
      toast.success('수정 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '수정 실패');
    }
  };

  // 비밀번호 변경
  const startPasswordEdit = (emp) => setEditing({ type: 'password', data: { id: emp.id, newPassword: '' } });
  const savePassword = async (e) => {
    e.preventDefault();
    if (!editing.data.newPassword) return toast.error('새 비밀번호 입력');

    try {
      await axios.put(`${BASE_URL}/api/user/${editing.data.id}/password`, {
        password: editing.data.newPassword
      }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setEditing(null);
      toast.success('비밀번호 변경 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '변경 실패');
    }
  };

  // 권한 변경
  const toggleLevel = async (id, currentLevel) => {
    const newLevel = currentLevel === 1 ? 2 : 1;
    try {
      await axios.put(`${BASE_URL}/api/user/${id}/level`, { level: newLevel }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, level: newLevel } : e));
      toast.success(newLevel === 2 ? '매장관리자 권한 부여' : '직원 권한으로 변경');
    } catch (err) {
      toast.error(err.response?.data?.message || '권한 변경 실패');
    }
  };

  // 삭제
  const handleDelete = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      await axios.delete(`${BASE_URL}/api/user/${id}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setEmployees(prev => prev.filter(e => e.id !== id));
      toast.success('삭제 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃');
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="emp-container">
      <div className="emp-bg-overlay" />
      <div className="emp-card">
        <div className="emp-header">
          <button className="emp-back-button" onClick={() => navigate('/AdminDashboard')}>
            이전
          </button>
          <h1 className="emp-title">직원 관리</h1>
          <div className="emp-user-info">
            <span>{userInfo.name} ({getLevelText(userInfo.level)})</span>
            <button className="emp-logout-button" onClick={handleLogout}>로그아웃</button>
          </div>
        </div>

        {/* 총관리자만 매장 필터 */}
        {userInfo.level === 3 && (
          <div className="emp-filter">
            <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}>
              <option value="all">모든 매장</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* 탭 */}
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
          >
            승인 대기 ({pendingUsers.length})
          </button>
        </div>

        {loading ? (
          <div className="emp-loading">로딩 중...</div>
        ) : editing?.type === 'info' ? (
          <form onSubmit={saveEdit} className="emp-edit-form">
            <input value={editing.data.name} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, name: e.target.value } }))} placeholder="이름" required />
            <input value={editing.data.userId} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, userId: e.target.value } }))} placeholder="아이디" required />
            <input value={editing.data.phone} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, phone: e.target.value } }))} placeholder="전화번호" required />
            <select value={editing.data.store_id || ''} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, store_id: parseInt(e.target.value) || null } }))}>
              <option value="">매장 선택</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="emp-form-actions">
              <button type>저장</button>
              <button type="button" onClick={() => setEditing(null)}>취소</button>
            </div>
          </form>
        ) : editing?.type === 'password' ? (
          <form onSubmit={savePassword} className="emp-pw-form">
            <input type="password" placeholder="새 비밀번호" onChange={e => setEditing(p => ({ ...p, data: { ...p.data, newPassword: e.target.value } }))} required />
            <div className="emp-form-actions">
              <button type="submit">변경</button>
              <button type="button" onClick={() => setEditing(null)}>취소</button>
            </div>
          </form>
        ) : activeTab === 'pending' && pendingUsers.length > 0 ? (
          <div className="emp-list">
            {pendingUsers.map(u => (
              <div key={u.id} className="emp-item emp-pending">
                <div className="emp-info">
                  <div className="emp-name">{u.name} ({u.userId})</div>
                  <div>전화: {u.phone}</div>
                  <div>가입: {new Date(u.created_at).toLocaleDateString()}</div>
                </div>
                <div className="emp-actions">
                  <button onClick={() => handleApprove(u.id)}>승인</button>
                  <button onClick={() => handleReject(u.id)} className="emp-delete">거부</button>
                </div>
              </div>
            ))}
          </div>
        ) : visibleEmployees.length === 0 ? (
          <p className="emp-no-data">표시할 직원이 없습니다.</p>
        ) : (
          <div className="emp-list">
            {visibleEmployees.map(emp => (
              <div key={emp.id} className="emp-item">
                <div className="emp-info">
                  <div className="emp-name">{emp.name} ({emp.userId})</div>
                  <div>전화: {emp.phone}</div>
                  <div>매장: {stores.find(s => s.id === emp.store_id)?.name || '없음'}</div>
                  <div>권한: {getLevelText(emp.level)}</div>
                  <div>가입: {new Date(emp.signup_date).toLocaleDateString()}</div>
                </div>
                <div className="emp-actions">
                  <button onClick={() => startEdit(emp)}>수정</button>
                  <button onClick={() => startPasswordEdit(emp)}>비밀번호</button>
                  {emp.level >= 1 && emp.level <= 2 && (
                    <button onClick={() => toggleLevel(emp.id, emp.level)}>
                      {emp.level === 2 ? '관리자 해제' : '관리자 부여'}
                    </button>
                  )}
                  {emp.level < 2 && (
                    <button onClick={() => handleDelete(emp.id)} className="emp-delete">삭제</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default EmployeeManagement;