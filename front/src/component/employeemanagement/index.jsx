// src/component/employeemanagement/index.jsx - 완전 전체 코드 (ESLint 경고 해결 + 수정/삭제/권한 OK + UI 깔끔 + 매장명 제거)
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
  const [userInfo, setUserInfo] = useState({ name: '로딩...' });
  const [employees, setEmployees] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editingPassword, setEditingPassword] = useState(null);
  const [activeTab, setActiveTab] = useState('employees');
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');

        const [userRes, employeesRes, storesRes, pendingRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/user`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/user/employees?store_id=${selectedStore}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/stores?t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/user/pending-users?t=${Date.now()}`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setUserInfo({ name: userRes.data.name || '관리자' });
        setEmployees(employeesRes.data || []);
        setStores(storesRes.data || []);
        setPendingUsers(pendingRes.data || []);
      } catch (err) {
        console.log(err);
        
        const msg = err.response?.data?.message || '데이터 로드 실패';
        setError(msg);
        toast.error(msg);
        if (err.response?.status === 401 || err.response?.status === 403) {
          removeToken();
          setTimeout(() => navigate('/'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]); // selectedStore 제거 → ESLint 경고 해결

  // 매장 변경 시 재로드
  useEffect(() => {
    if (loaded.current) {
      const token = getToken();
      axios.get(`${BASE_URL}/api/user/employees?store_id=${selectedStore}&t=${Date.now()}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => setEmployees(res.data)).catch(() => {});
    }
  }, [selectedStore]); // loading 제거 → ESLint 경고 해결

  const handleApprove = async (userId) => {
    try {
      await axios.put(`${BASE_URL}/api/user/${userId}/approve`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('승인 완료!');
    } catch (err) {
      toast.error(err.response?.data?.message || '승인 실패');
    }
  };

  const handleReject = async (userId) => {
    if (!window.confirm('거부하시겠습니까?')) return;
    try {
      await axios.put(`${BASE_URL}/api/user/${userId}/reject`, {}, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      toast.success('거부 완료!');
    } catch (err) {
      toast.error(err.response?.data?.message || '거부 실패');
    }
  };

  const handleEdit = (emp) => setEditingEmployee({ ...emp });
  const handleCancelEdit = () => setEditingEmployee(null);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingEmployee.name || !editingEmployee.phone || !editingEmployee.userId) {
      toast.error('이름, 아이디, 전화번호 필수!');
      return;
    }
    try {
      await axios.put(`${BASE_URL}/api/user/${editingEmployee.id}`, editingEmployee, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setEmployees(prev => prev.map(emp => emp.id === editingEmployee.id ? editingEmployee : emp));
      setEditingEmployee(null);
      toast.success('수정 완료!');
    } catch (err) {
      toast.error(err.response?.data?.message || '수정 실패');
    }
  };

  const handlePasswordEdit = (emp) => setEditingPassword({ ...emp, newPassword: '' });
  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!editingPassword.newPassword) {
      toast.error('새 비밀번호 입력!');
      return;
    }
    try {
      await axios.put(`${BASE_URL}/api/user/${editingPassword.id}/password`, {
        password: editingPassword.newPassword
      }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setEditingPassword(null);
      toast.success('비밀번호 변경 완료!');
    } catch (err) {
      toast.error(err.response?.data?.message || '변경 실패');
    }
  };

  const handleToggleAdmin = async (id, isAdmin) => {
    try {
      await axios.put(`${BASE_URL}/api/user/${id}/admin`, { isAdmin: !isAdmin }, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, isAdmin: !isAdmin } : emp));
      toast.success(isAdmin ? '관리자 해제' : '관리자 부여');
    } catch (err) {
      toast.error(err.response?.data?.message || '권한 변경 실패');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      await axios.delete(`${BASE_URL}/api/user/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      toast.success('삭제 완료!');
    } catch (err) {
      toast.error(err.response?.data?.message || '삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    setTimeout(() => navigate('/'), 2000);
  };

  const filteredEmployees = selectedStore === 'all' 
    ? employees 
    : employees.filter(emp => emp.store_id === parseInt(selectedStore));

  return (
    <div className="emp-container">
      <div className="emp-bg-overlay" />
      
      <div className="emp-card">
        <div className="emp-header">
          <button className="emp-back-button" onClick={() => navigate('/AdminDashboard')}>
            ← 이전
          </button>
          <h1 className="emp-title">직원 관리</h1>
          <div className="emp-user-info">
            <span className="emp-user-name">{userInfo.name}</span>
            <button className="emp-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <div className="emp-filter">
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)} className="emp-filter-select">
            <option value="all">모든 매장</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        <div className="emp-tabs">
          <button
            className={`emp-tab ${activeTab === 'employees' ? 'emp-tab-active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            직원 목록 ({filteredEmployees.length})
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
        ) : error ? (
          <div className="emp-error">{error}</div>
        ) : activeTab === 'employees' ? (
          filteredEmployees.length === 0 ? (
            <p className="emp-no-data">등록된 직원이 없습니다.</p>
          ) : (
            <div className="emp-list">
              {filteredEmployees.map(emp => (
                <div key={emp.id} className="emp-item">
                  {editingEmployee?.id === emp.id ? (
                    <form onSubmit={handleSaveEdit} className="emp-edit-form">
                      <input
                        value={editingEmployee.name}
                        onChange={e => setEditingEmployee(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="이름"
                        required
                      />
                      <input
                        value={editingEmployee.userId}
                        onChange={e => setEditingEmployee(prev => ({ ...prev, userId: e.target.value }))}
                        placeholder="아이디"
                        required
                      />
                      <input
                        value={editingEmployee.birthdate || ''}
                        onChange={e => setEditingEmployee(prev => ({ ...prev, birthdate: e.target.value }))}
                        placeholder="생년월일 (YYYYMMDD)"
                      />
                      <input
                        value={editingEmployee.phone}
                        onChange={e => setEditingEmployee(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="전화번호"
                        required
                      />
                      <select
                        value={editingEmployee.store_id || ''}
                        onChange={e => setEditingEmployee(prev => ({ ...prev, store_id: parseInt(e.target.value) }))}
                      >
                        <option value="">매장</option>
                        {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <div className="emp-form-actions">
                        <button type="submit" className="emp-save-btn">저장</button>
                        <button type="button" onClick={handleCancelEdit} className="emp-cancel-btn">취소</button>
                      </div>
                    </form>
                  ) : editingPassword?.id === emp.id ? (
                    <form onSubmit={handleSavePassword} className="emp-pw-form">
                      <input
                        type="password"
                        placeholder="새 비밀번호"
                        onChange={e => setEditingPassword(prev => ({ ...prev, newPassword: e.target.value }))}
                        required
                      />
                      <div className="emp-form-actions">
                        <button type="submit" className="emp-save-btn">변경</button>
                        <button type="button" onClick={() => setEditingPassword(null)} className="emp-cancel-btn">취소</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="emp-info">
                        <div className="emp-name">{emp.name} ({emp.userId})</div>
                        <div className="emp-detail">생년월일: {emp.birthdate || '없음'}</div>
                        <div className="emp-detail">전화: {emp.phone}</div>
                        <div className="emp-detail">매장: {stores.find(s => s.id === emp.store_id)?.name || '없음'}</div>
                        <div className="emp-detail">권한: {emp.isAdmin ? '관리자' : '직원'}</div>
                        <div className="emp-detail">가입: {new Date(emp.signup_date).toLocaleDateString()}</div>
                      </div>
                      <div className="emp-actions">
                        <button onClick={() => handleEdit(emp)} className="emp-action-btn">수정</button>
                        <button onClick={() => handlePasswordEdit(emp)} className="emp-action-btn">비밀번호</button>
                        <button onClick={() => handleToggleAdmin(emp.id, emp.isAdmin)} className="emp-action-btn">
                          {emp.isAdmin ? '관리자 해제' : '관리자 부여'}
                        </button>
                        <button onClick={() => handleDelete(emp.id)} className="emp-action-btn emp-delete">삭제</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          pendingUsers.length === 0 ? (
            <p className="emp-no-data">승인 대기 중인 사용자가 없습니다.</p>
          ) : (
            <div className="emp-list">
              {pendingUsers.map(user => (
                <div key={user.id} className="emp-item emp-pending">
                  <div className="emp-info">
                    <div className="emp-name">{user.name} ({user.userId})</div>
                    <div className="emp-detail">전화: {user.phone}</div>
                    <div className="emp-detail">가입: {new Date(user.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="emp-actions">
                    <button onClick={() => handleApprove(user.id)} className="emp-action-btn">승인</button>
                    <button onClick={() => handleReject(user.id)} className="emp-action-btn emp-delete">거부</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default EmployeeManagement;