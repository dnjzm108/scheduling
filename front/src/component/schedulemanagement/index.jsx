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
  const [stores, setStores] = useState([]);             // 화면에서 선택 가능한 매장 목록
  const [user, setUser] = useState(null);               // 로그인한 사용자 전체 정보
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [formData, setFormData] = useState({
    store_id: '',
    week_start: '',
    work_area: 'both'
  });
  const [previewId, setPreviewId] = useState(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);   // 총관리자 여부
  const [allowedStoreIds, setAllowedStoreIds] = useState([]); // 권한 있는 매장 id 목록

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
        const [userRes, storesRes] = await Promise.all([
          api.get('/api/user'),
          api.get('/api/stores')
        ]);

        const userData = userRes.data;
        setUser(userData);

        // allowed-stores API 호출 (총관리자/매장관리자 권한 정보)
        let allowedInfo = null;
        try {
          const allowedRes = await api.get('/api/user/allowed-stores');
          allowedInfo = allowedRes.data;
        } catch (e) {
          // 백엔드 라우트가 없거나 실패할 경우 fallback (자기 매장만)
          allowedInfo = {
    isSuperAdmin: userData.level === 4,
    allowedStores: userData.level === 4 ? "ALL" : [userData.store_id]
  };
        }

        const allStores = storesRes.data || [];
        let finalStores = [];

        if (allowedInfo.isSuperAdmin) {
          // 총관리자는 모든 매장 선택 가능
          setIsSuperAdmin(true);
          finalStores = allStores;
          setAllowedStoreIds(allStores.map(s => s.id));
        } else {
          // 매장관리자: 자기 매장 + 총관리자가 부여한 매장만
          setIsSuperAdmin(false);
          const ids = allowedInfo.allowedStores && allowedInfo.allowedStores.length
            ? allowedInfo.allowedStores
            : [userData.store_id];
          setAllowedStoreIds(ids);
          finalStores = allStores.filter(s => ids.includes(s.id));
        }

        setStores(finalStores);

        // 기본 선택 매장
        const defaultStoreId =
          finalStores.length > 0 ? finalStores[0].id : userData.store_id;

        setSelectedStoreId(defaultStoreId);

        // work_area 기본값
        let defaultArea = 'both';
        if (userData.level === 4) {
          // 총관리자는 기본값 both, 선택 가능
          defaultArea = 'both';
        } else if (userData.level === 3) {
          // 매장관리자는 admin_role에 따라 고정
          defaultArea = userData.admin_role || 'both';
        }

        console.log("USER DATA:", userData);
console.log("allowedInfo:", allowedInfo);

        setFormData(prev => ({
          ...prev,
          store_id: defaultStoreId,
          work_area: defaultArea
        }));

        // 스케줄 목록 로드
        fetchSchedules(defaultStoreId);
      } catch (err) {
        handleApiError(err, '데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [navigate, fetchSchedules]);

  const handleStoreFilterChange = (e) => {
    const storeId = Number(e.target.value);
    setSelectedStoreId(storeId);
    setFormData(prev => ({ ...prev, store_id: storeId }));
    fetchSchedules(storeId);
  };

  const handleOpenSchedule = async (e) => {
    e.preventDefault();
    if (isProcessing.current) return;
    isProcessing.current = true;

    const { store_id, week_start, work_area } = formData;

    if (!store_id || !week_start) {
      toast.warn('매장과 시작 날짜를 선택해주세요.');
      isProcessing.current = false;
      return;
    }

    // 프론트에서도 권한 체크 (백엔드에서 다시 한 번 체크함)
    if (!isSuperAdmin && !allowedStoreIds.includes(Number(store_id))) {
      toast.error('해당 매장에 대한 권한이 없습니다.');
      isProcessing.current = false;
      return;
    }

    const localDate = new Date(week_start);
    const utcDateStr = new Date(Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate()
    )).toISOString().split('T')[0];

    try {
      const { data } = await api.post('/api/schedules', {
        week_start: utcDateStr,
        store_id,
        work_area
      });

      toast.success(
        <div style={{ lineHeight: '1.5', textAlign: 'center' }}>
          <strong>{data.period.label}</strong><br />
          <small>스케줄이 오픈되었습니다.</small>
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

  if (loading || !user) return <div className="loading-message">데이터 로드 중...</div>;

  const renderWorkAreaLabel = (value) => {
    if (value === 'hall') return '홀';
    if (value === 'kitchen') return '주방';
    return '전체';
  };

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
              {/* 매장 선택: 총관리자 + 권한이 여러 매장일 때만 select 노출 */}
              <div className="form-group">
                <label>매장 선택</label>
                {stores.length > 1 || isSuperAdmin ? (
                  <select
                    name="store_id"
                    value={formData.store_id}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        store_id: Number(e.target.value)
                      }))
                    }
                    required
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={stores[0]?.name || '매장 없음'}
                    disabled
                  />
                )}
              </div>

              {/* 근무 구역: 총관리자는 선택 가능, 매장관리자는 admin_role 고정 */}
              <div className="form-group">
                <label>근무 구역</label>
                {isSuperAdmin ? (
                  <select
                    name="work_area"
                    value={formData.work_area}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, work_area: e.target.value }))
                    }
                  >
                    <option value="hall">홀</option>
                    <option value="kitchen">주방</option>
                    <option value="both">전체</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={renderWorkAreaLabel(formData.work_area)}
                    disabled
                  />
                )}
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
                {/* 목록 필터용 매장 select: 여러 매장 관리 시에만 표시 */}
                {stores.length > 1 || isSuperAdmin ? (
                  <select value={selectedStoreId} onChange={handleStoreFilterChange}>
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={stores[0]?.name || '매장 없음'}
                    disabled
                  />
                )}
              </div>
            </div>

            <div className="table-container">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th><FaStore /> 매장명</th>
                    <th><FaCalendarAlt /> 기간</th>
                    <th>근무 구역</th>
                    <th>상태</th>
                    <th>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.length === 0 ? (
                    <tr><td colSpan={5} className="no-schedules">오픈된 스케줄이 없습니다.</td></tr>
                  ) : (
                    schedules.map(s => (
                      <tr key={s.id}>
                        <td>{s.store_name}</td>
                        <td>{s.period?.label || s.date}</td>
                        <td>{renderWorkAreaLabel(s.work_area)}</td>
                        <td>
                          <span className={`status-badge status-${s.status.value}`}>
                            {s.status.text}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <button
                            onClick={() => handleViewDetails(s.id)}
                            className="button-action button-preview"
                          >
                            미리보기
                          </button>
                          <button
                            onClick={() => handleAutoSchedule(s.id)}
                            disabled={s.status.value !== 'open' || isProcessing.current}
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
                          <button
                            onClick={() => navigate(`/schedule-finalize/${s.id}`)}
                          >
                            확정하기
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
