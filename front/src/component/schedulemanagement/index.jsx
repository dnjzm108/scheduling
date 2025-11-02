// src/component/schedulemanagement/index.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FaPlus, FaTrash, FaSyncAlt, FaCalendarAlt, FaStore, FaFilter
} from 'react-icons/fa';
import './index.css';
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';

function ScheduleManagement() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [stores, setStores] = useState([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [formData, setFormData] = useState({ store_id: '', week_start: '' });

  const token = getToken();
  const headers = { Authorization: `Bearer ${token}` };

  // 🔹 공통 axios 에러 핸들러
  const handleAxiosError = (err, fallback) => {
    console.error(err.response?.data || err.message);
    toast.error(err.response?.data?.message || fallback);
  };

  // 🔹 스케줄 목록 불러오기
  const fetchSchedules = useCallback(async (storeId = '') => {
    if (!token) return;
    try {
      const url = `${BASE_URL}/api/schedules${storeId ? `?store_id=${storeId}` : ''}`;
      const res = await axios.get(url, { headers });
      setSchedules(res.data || []);
    } catch (err) {
      handleAxiosError(err, '스케줄 목록 불러오기 실패');
    }
  }, [token]);

  // 🔹 최초 로드
  useEffect(() => {
    if (!token) {
      toast.error('로그인이 필요합니다.');
      navigate('/');
      return;
    }

    const loadData = async () => {
      try {
        const [userRes, storeRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/user`, { headers }),
          axios.get(`${BASE_URL}/api/stores`, { headers })
        ]);

        setUserName(userRes.data?.name || '관리자');
        const storeList = storeRes.data || [];
        setStores(storeList);

        if (storeList.length > 0) {
          const firstStore = storeList[0].id;
          setFormData((p) => ({ ...p, store_id: firstStore }));
          setSelectedStoreId(firstStore);
          await fetchSchedules(firstStore);
        }
      } catch (err) {
        handleAxiosError(err, '데이터 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate, fetchSchedules, token]);

  // 🔹 스케줄 개별 함수들
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleStoreFilterChange = async (e) => {
    const id = e.target.value;
    setSelectedStoreId(id);
    await fetchSchedules(id);
  };

  const handleOpenSchedule = async (e) => {
    e.preventDefault();
    if (!formData.store_id || !formData.week_start) {
      toast.warn('매장과 시작 날짜를 선택해주세요.');
      return;
    }
    try {
      const res = await axios.post(
        `${BASE_URL}/api/schedules`,
        { week_start: formData.week_start, store_id: formData.store_id },
        { headers }
      );

      const { message, store_name, period } = res.data;
      toast.success(
        <div style={{ lineHeight: '1.5', textAlign: 'center' }}>
          <strong>{store_name}</strong><br />
          {period.label}<br />
          <small>{message}</small>
        </div>,
        { autoClose: 4000, position: 'top-center' }
      );
      setFormData((p) => ({ ...p, week_start: '' }));
      await fetchSchedules(selectedStoreId);
    } catch (err) {
      handleAxiosError(err, '스케줄 생성 실패');
    }
  };

  const handleAutoSchedule = async (id) => {
    if (!window.confirm('선택된 스케줄에 대해 자동 배치를 실행하시겠습니까?')) return;
    try {
      const res = await axios.post(`${BASE_URL}/api/schedules/${id}/auto-assign`, {}, { headers });
      toast.success(res.data.message || '자동 배정 완료');
      await fetchSchedules(selectedStoreId);
    } catch (err) {
      handleAxiosError(err, '자동 배정 실패');
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('이 스케줄을 삭제하시겠습니까? 관련 신청 내역도 함께 삭제됩니다.')) return;
    try {
      await axios.delete(`${BASE_URL}/api/schedules/${id}`, { headers });
      toast.success('스케줄 삭제 완료');
      await fetchSchedules(selectedStoreId);
    } catch (err) {
      handleAxiosError(err, '스케줄 삭제 실패');
    }
  };

  const handleViewDetails = (id) => toast.info(`스케줄 ID ${id} 상세 페이지 (추후 구현 예정)`);

  // 🔹 로딩 상태 표시
  if (loading) return <div className="loading-message">데이터를 불러오는 중입니다...</div>;

  // 🔹 렌더링
  return (
    <div className="schedule-management">
      <ToastContainer position="top-center" autoClose={4000} theme="colored" />
      <header className="header">
        <h1 className="title">
          <FaCalendarAlt className="icon-calendar" /> 스케줄 관리
        </h1>
        <div className="user-info">
          <span className="username">{userName} 관리자님</span>
          <button onClick={() => navigate('/AdminDashboard')} className="button-dashboard">
            이전페이지
          </button>
        </div>
      </header>

      {/* 스케줄 생성 */}
      <section className="form-section">
        <h2 className="section-title"><FaPlus className="icon-plus" /> 신규 스케줄 기간 오픈</h2>
        <form onSubmit={handleOpenSchedule} className="schedule-form">
          <div className="form-group">
            <label htmlFor="store_id_form" className="form-label">매장 선택</label>
            <select id="store_id_form" name="store_id" required value={formData.store_id}
              onChange={handleChange} className="form-select">
              <option value="" disabled>-- 매장 선택 --</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="week_start" className="form-label">시작 날짜 (해당 주 월요일)</label>
            <input type="date" id="week_start" name="week_start" required
              value={formData.week_start} onChange={handleChange} className="form-input" />
          </div>
          <button type="submit" className="button-submit"
            disabled={!formData.store_id || stores.length === 0}>스케줄 오픈</button>
        </form>
      </section>

      {/* 스케줄 리스트 */}
      <section className="list-section">
        <div className="list-header">
          <h2 className="list-title">오픈된 스케줄 목록 ({schedules.length}개)</h2>
          <div className="filter-group">
            <FaFilter className="icon-filter" />
            <select value={selectedStoreId} onChange={handleStoreFilterChange} className="form-select filter-select">
              <option value="">전체 매장</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="schedule-table">
            <thead>
              <tr>
                <th><FaStore className="inline-icon" /> 매장명</th>
                <th><FaCalendarAlt className="inline-icon" /> 기간</th>
                <th>상태</th>
                <th className="actions-header">액션</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length > 0 ? (
                schedules.map((s) => (
                  <tr key={s.id}>
                    <td>{s.store_name}</td>
                    <td>{s.period?.label || s.date}</td>
                    <td>
                      <span className={`status-badge status-${s.status}`}>
                        {s.status === 'assigned' ? '배치 완료' :
                         s.status === 'open' ? '신청 대기 중' : '마감'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button onClick={() => handleViewDetails(s.id)} className="button-action button-detail">상세</button>
                      <button onClick={() => handleAutoSchedule(s.id)}
                        disabled={s.status !== 'open'}
                        className={`button-action button-auto-assign ${s.status !== 'open' ? 'disabled' : ''}`}>
                        <FaSyncAlt className="inline-icon" /> 자동 배치
                      </button>
                      <button onClick={() => handleDeleteSchedule(s.id)} className="button-action button-delete">
                        <FaTrash className="inline-icon" /> 삭제
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="4" className="no-schedules">오픈된 스케줄이 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default ScheduleManagement;
