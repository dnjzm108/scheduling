// src/component/employeemanagement/index.jsx
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
  const hasLoaded = useRef(false); // 중복 로드 방지

  const [userInfo, setUserInfo] = useState({ level: 0, store_id: null });
  const [employees, setEmployees] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  const [activeTab, setActiveTab] = useState('employees');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const getLevelText = (level) => ['승인대기', '직원', '매장관리자', '총관리자'][level] || '알 수 없음';

  // 딱 한 번만 로드
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    const fetchAll = async () => {
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

        // 승인대기 0명이면 자동으로 직원 탭
        if (pendingRes.data?.length === 0) {
          setActiveTab('employees');
        }
      } catch (err) {
        if (!axios.isCancel(err)) {
          toast.error('데이터 로드 실패');
          if (err.response?.status === 401) {
            removeToken();
            navigate('/');
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [navigate]);

  // 필터링된 직원
  const visibleEmployees = employees
    .filter(e => e.level >= 1)
    .filter(e => userInfo.level === 2 ? e.store_id === userInfo.store_id : true)
    .filter(e => selectedStore === 'all' ? true : e.store_id === parseInt(selectedStore));

  // 승인
  const handleApprove = async (id) => {
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      await api.put(`/api/user/${id}/approve`);
      const user = pendingUsers.find(u => u.id === id);
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      setEmployees(prev => [...prev, { ...user, level: 1 }]);
      toast.success('승인 완료');
      if (pendingUsers.length === 1) setActiveTab('employees');
    } catch (err) {
      if (!axios.isCancel(err)) toast.error(err.response?.data?.message || '승인 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  // 거부
  const handleReject = async (id) => {
    if (!window.confirm('거부하시겠습니까?')) return;
    if (isProcessing.current) return;
    isProcessing.current = true;

    try {
      await api.put(`/api/user/${id}/reject`);
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      toast.success('거부 완료');
      if (pendingUsers.length === 1) setActiveTab('employees');
    } catch (err) {
      if (!axios.isCancel(err)) toast.error(err.response?.data?.message || '거부 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  // 정보 수정
  const startEdit = (emp) => setEditing({ type: 'info', data: { ...emp } });
  const saveEdit = async (e) => {
    e.preventDefault();
    const d = editing.data;
    if (!d.name || !d.userId || !d.phone) return toast.error('필수 항목 입력');

    try {
      await api.put(`/api/user/${d.id}`, d);
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
    if (!editing.data.newPassword) return toast.error('비밀번호 입력');

    try {
      await api.put(`/api/user/${editing.data.id}/password`, { password: editing.data.newPassword });
      setEditing(null);
      toast.success('비밀번호 변경 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '변경 실패');
    }
  };

  // 권한 토글
  const toggleLevel = async (id, level) => {
    const newLevel = level === 1 ? 2 : 1;
    try {
      await api.put(`/api/user/${id}/level`, { level: newLevel });
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, level: newLevel } : e));
      toast.success(newLevel === 2 ? '관리자 권한 부여' : '직원 권한으로 변경');
    } catch (err) {
      toast.error(err.response?.data?.message || '권한 변경 실패');
    }
  };

  // 삭제
  const handleDelete = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      await api.delete(`/api/user/${id}`);
      setEmployees(prev => prev.filter(e => e.id !== id));
      toast.success('삭제 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '삭제 실패');
    }
  };

  return (
    <div className="emp-page">
      <Header title="직원 관리" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="emp-container">

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
              className={`emp-tab ${activeTab === 'employees' ? 'active' : ''}`}
              onClick={() => setActiveTab('employees')}
            >
              직원 목록 ({visibleEmployees.length})
            </button>
            <button
              className={`emp-tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
              disabled={pendingUsers.length === 0}
            >
              승인 대기 ({pendingUsers.length})
            </button>
          </div>

          {loading ? (
            <div className="emp-loading">로딩 중...</div>
          ) : editing?.type ? (
            editing.type === 'info' ? (
              <form onSubmit={saveEdit} className="emp-edit-form">
                <input value={editing.data.name} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, name: e.target.value } }))} placeholder="이름" required />
                <input value={editing.data.userId} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, userId: e.target.value } }))} placeholder="아이디" required />
                <input value={editing.data.phone} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, phone: e.target.value } }))} placeholder="전화번호" required />
                <select value={editing.data.store_id || ''} onChange={e => setEditing(p => ({ ...p, data: { ...p.data, store_id: parseInt(e.target.value) || null } }))}>
                  <option value="">매장 선택</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="emp-form-actions">
                  <button type="submit">저장</button>
                  <button type="button" onClick={() => setEditing(null)}>취소</button>
                </div>
              </form>
            ) : (
              <form onSubmit={savePassword} className="emp-pw-form">
                <input type="password" onChange={e => setEditing(p => ({ ...p, data: { ...p.data, newPassword: e.target.value } }))} placeholder="새 비밀번호" required />
                <div className="emp-form-actions">
                  <button type="submit">변경</button>
                  <button type="button" onClick={() => setEditing(null)}>취소</button>
                </div>
              </form>
            )
          ) : activeTab === 'pending' && pendingUsers.length > 0 ? (
            <div className="emp-list">
              {pendingUsers.map(u => (
                <div key={u.id} className="emp-item pending">
                  <div className="emp-info">
                    <div>{u.name} ({u.userId})</div>
                    <div>전화: {u.phone}</div>
                    <div>가입: {new Date(u.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="emp-actions">
                    <button onClick={() => handleApprove(u.id)}>승인</button>
                    <button onClick={() => handleReject(u.id)} className="delete">거부</button>
                  </div>
                </div>
              ))}
            </div>
          ) : visibleEmployees.length === 0 ? (
            <p className="emp-no-data">
              {activeTab === 'pending' ? '승인 대기 인원이 없습니다.' : '표시할 직원이 없습니다.'}
            </p>
          ) : (
            <div className="emp-list">
              {visibleEmployees.map(emp => (
                <div key={emp.id} className="emp-item">
                  <div className="emp-info">
                    <div>{emp.name} ({emp.userId})</div>
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
                      <button onClick={() => handleDelete(emp.id)} className="delete">삭제</button>
                    )}
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

export default EmployeeManagement;