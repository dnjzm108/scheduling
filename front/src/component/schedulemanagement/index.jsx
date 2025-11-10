// src/component/schedulemanagement/index.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  FaPlus,
  FaTrash,
  FaSyncAlt,
  FaCalendarAlt,
  FaStore,
  FaFilter
} from 'react-icons/fa';

import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import { BASE_URL } from '../../config';
import SchedulePreview from '../SchedulePreview';
import './index.css';

function ScheduleManagement() {
  const navigate = useNavigate();
  const isProcessing = useRef(false);

  const [schedules, setSchedules] = useState([]);
  const [stores, setStores] = useState([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [formData, setFormData] = useState({ store_id: '', week_start: '' });
  const [previewId, setPreviewId] = useState(null);

  const handleRateLimit = () => {
    toast.warn(
      <div style={{ textAlign: 'center', lineHeight: '1.6' }}>
        <strong>접속량이 많습니다</strong><br />
        <small>잠시 후 다시 시도해 주세요</small>
      </div>,
      { autoClose: 5000, position: 'top-center', style: { background: '#fff3cd', color: '#856404' } }
    );
  };

  const handleApiError = (err, msg = '요청 실패') => {
    if (err.response?.status === 429) handleRateLimit();
    else toast.error(err.response?.data?.message || msg);
  };

  const fetchSchedules = useCallback(async (storeId = '') => {
    try {
      const url = `${BASE_URL}/api/schedules${storeId ? `?store_id=${storeId}` : ''}`;
      const { data } = await api.get(url);
      setSchedules(data || []);
    } catch (err) {
      handleApiError(err, '스케줄 목록 불러오기 실패');
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      return setTimeout(() => navigate('/'), 2000);
    }

    const loadAll = async () => {
      setLoading(true);
      try {
        const [userRes, storesRes, schedulesRes] = await Promise.all([
          api.get('/api/user'),
          api.get('/api/stores'),
          api.get('/api/schedules')
        ]);

        setUserName(userRes.data.name || '관리자');
        const loadedStores = storesRes.data || [];
        setStores(loadedStores);

        if (loadedStores.length > 0) {
          const firstId = loadedStores[0].id;
          setFormData(prev => ({ ...prev, store_id: firstId }));
          setSelectedStoreId(firstId);
        }

        setSchedules(schedulesRes.data || []);
      } catch (err) {
        handleApiError(err, '데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [navigate, fetchSchedules]);

  const handleStoreFilterChange = (e) => {
    const storeId = e.target.value;
    setSelectedStoreId(storeId);
    fetchSchedules(storeId);
  };

  const handleOpenSchedule = async (e) => {
    e.preventDefault();
    if (isProcessing.current) return;
    isProcessing.current = true;

    if (!formData.store_id || !formData.week_start) {
      toast.warn('매장과 시작 날짜를 선택해주세요.');
      isProcessing.current = false;
      return;
    }

    const localDate = new Date(formData.week_start);
    const utcDateStr = new Date(Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate()
    )).toISOString().split('T')[0];

    try {
      const { data } = await api.post('/api/schedules', {
        week_start: utcDateStr,
        store_id: formData.store_id
      });

      toast.success(
        <div style={{ lineHeight: '1.5', textAlign: 'center' }}>
          <strong>{data.store_name}</strong><br />
          {data.period.label}<br />
          <small>{data.message}</small>
        </div>,
        { autoClose: 4000, position: 'top-center' }
      );

      setFormData(prev => ({ ...prev, week_start: '' }));
      fetchSchedules(selectedStoreId);
    } catch (err) {
      handleApiError(err, '스케줄 생성 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const handleAutoSchedule = async (scheduleId) => {
    if (isProcessing.current || !window.confirm('자동 배치를 실행하시겠습니까?')) return;
    isProcessing.current = true;

    try {
      await api.post(`/api/schedules/${scheduleId}/auto-assign`);
      toast.success('자동 배치가 완료되었습니다.');
      fetchSchedules(selectedStoreId);
    } catch (err) {
      handleApiError(err, '자동 배치 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (isProcessing.current || !window.confirm('스케줄을 영구 삭제하시겠습니까?')) return;
    isProcessing.current = true;

    try {
      await api.delete(`/api/schedules/${scheduleId}`);
      toast.success('스케줄이 삭제되었습니다.');
      fetchSchedules(selectedStoreId);
    } catch (err) {
      handleApiError(err, '스케줄 삭제 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const handleViewDetails = (id) => setPreviewId(id);

  if (loading) return <div className="loading-message">데이터 로드 중...</div>;

  return (
    <>
      <Header
        title={
          <>
            <FaCalendarAlt className="icon-calendar" />
            스케줄 관리
          </>
        }
        backTo="/AdminDashboard"
      />

      <div className="page-with-header">
        <div className="schedule-management">
          <ToastContainer position="top-center" theme="colored" autoClose={4000} />

          {/* 신규 스케줄 오픈 */}
          <section className="form-section">
            <h2 className="section-title">
              <FaPlus className="icon-plus" /> 신규 스케줄 기간 오픈
            </h2>
            <form onSubmit={handleOpenSchedule} className="schedule-form">
              <div className="form-group">
                <label>매장 선택</label>
                <select
                  name="store_id"
                  value={formData.store_id}
                  onChange={e => setFormData(prev => ({ ...prev, store_id: e.target.value }))}
                  required
                >
                  <option value="" disabled>-- 매장 선택 --</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>시작 날짜 (월요일)</label>
                <input
                  type="date"
                  name="week_start"
                  value={formData.week_start}
                  onChange={e => setFormData(prev => ({ ...prev, week_start: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="button-submit" disabled={isProcessing.current}>
                스케줄 오픈
              </button>
            </form>
          </section>

          {/* 스케줄 목록 */}
          <section className="list-section">
            <div className="list-header">
              <h2 className="list-title">오픈된 스케줄 목록 ({schedules.length}개)</h2>
              <div className="filter-group">
                <FaFilter className="icon-filter" />
                <select value={selectedStoreId} onChange={handleStoreFilterChange}>
                  <option value="">전체 매장</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-container">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th><FaStore /> 매장명</th>
                    <th><FaCalendarAlt /> 기간</th>
                    <th>상태</th>
                    <th>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.length === 0 ? (
                    <tr><td colSpan={4} className="no-schedules">오픈된 스케줄이 없습니다.</td></tr>
                  ) : (
                    schedules.map(s => (
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
                          <button onClick={() => handleViewDetails(s.id)} className="button-action button-preview">
                            미리보기
                          </button>
                          <button
                            onClick={() => handleAutoSchedule(s.id)}
                            disabled={s.status !== 'open' || isProcessing.current}
                            className="button-action button-auto-assign"
                          >
                            <FaSyncAlt /> 자동 배치
                          </button>
                          <button
                            onClick={() => handleDeleteSchedule(s.id)}
                            disabled={isProcessing.current}
                            className="button-action button-delete"
                          >
                            <FaTrash /> 삭제
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 미리보기 모달 */}
          {previewId && (
            <div className="modal-overlay" onClick={() => setPreviewId(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={() => setPreviewId(null)}>×</button>
                <SchedulePreview scheduleId={previewId} onClose={() => setPreviewId(null)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ScheduleManagement;