// src/component/schedulemanagement/index.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaPlus, FaTrash, FaSyncAlt, FaCalendarAlt, FaStore, FaFilter } from 'react-icons/fa';

import Header from '../Header';
import api from '../../utils/api';
import { getToken } from '../../utils/auth';
import { BASE_URL } from '../../config';
import SchedulePreview from '../SchedulePreview';
import './index.css';

function ScheduleManagement() {
  const navigate = useNavigate();
  const isProcessing = useRef(false);

  const [schedules, setSchedules] = useState([]);
  const [stores, setStores] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const [formData, setFormData] = useState({
    store_id: '',
    week_start: '',
    work_area: 'both'
  });

  const [previewId, setPreviewId] = useState(null);

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allowedStoreIds, setAllowedStoreIds] = useState([]);

  // 🔹 페이지네이션 / 정렬 상태
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortOrder, setSortOrder] = useState('desc'); // desc = 최신순
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const handleRateLimit = () => {
    toast.warn(
      <div style={{ textAlign: "center" }}>
        접속량이 많습니다. 잠시 후 다시 시도해 주세요.
      </div>,
      { autoClose: 4500, position: "top-center" }
    );
  };

  const handleApiError = (err, msg = "요청 실패") => {
    if (err.response?.status === 429) handleRateLimit();
    else toast.error(err.response?.data?.message || msg);
  };

  // 🔹 스케줄 목록 조회 (페이지네이션 + 정렬 반영)
  const fetchSchedules = useCallback(
    async (storeId = '', pageParam = 1, pageSizeParam = 10, sortParam = 'desc') => {
      try {
        const params = new URLSearchParams();
        if (storeId) params.append('store_id', storeId);
        params.append('page', pageParam);
        params.append('pageSize', pageSizeParam);
        params.append('sort', sortParam);

        const url = `${BASE_URL}/api/schedules?${params.toString()}`;
        const { data } = await api.get(url);

        setSchedules(data.items || []);
        setTotalCount(data.total || 0);
        setTotalPages(data.pages || 1);
        setPage(data.page || 1);
      } catch (err) {
        handleApiError(err, "스케줄 목록 불러오기 실패");
      }
    },
    []
  );

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error("로그인이 필요합니다.");
      return setTimeout(() => navigate("/"), 2000);
    }

    const loadInit = async () => {
      setLoading(true);
      try {
        const [userRes, storesRes] = await Promise.all([
          api.get('/api/user'),
          api.get('/api/stores')
        ]);

        const userData = userRes.data;
        setUser(userData);

        // allowed-stores
        let allowedInfo = null;
        try {
          const allowedRes = await api.get('/api/user/allowed-stores');
          allowedInfo = allowedRes.data;
        } catch {
          allowedInfo = {
            isSuperAdmin: userData.level === 4,
            allowedStores: userData.level === 4 ? "ALL" : [userData.store_id]
          };
        }

        const allStores = storesRes.data || [];
        let finalStores = [];

        if (allowedInfo.isSuperAdmin) {
          setIsSuperAdmin(true);
          finalStores = allStores;
          setAllowedStoreIds(allStores.map(s => s.id));
        } else {
          setIsSuperAdmin(false);
          const ids = allowedInfo.allowedStores?.length
            ? allowedInfo.allowedStores
            : [userData.store_id];
          setAllowedStoreIds(ids);
          finalStores = allStores.filter(s => ids.includes(s.id));
        }

        setStores(finalStores);

        const defaultStoreId =
          finalStores.length > 0 ? finalStores[0].id : userData.store_id;
        setSelectedStoreId(defaultStoreId);

        let defaultArea = 'both';

        // 관리자 권한별 work_area 고정 처리
        if (userData.level === 4) {
          defaultArea = 'both'; // 총관리자 → 선택 가능
        } else if (userData.level === 3) {
          if (userData.work_area === 'hall') defaultArea = 'hall';
          else if (userData.work_area === 'kitchen') defaultArea = 'kitchen';
          else defaultArea = 'both';
        }

        setFormData(prev => ({
          ...prev,
          store_id: defaultStoreId,
          work_area: defaultArea
        }));

        // 초기 스케줄 목록
        fetchSchedules(defaultStoreId, 1, pageSize, sortOrder);
      } catch (err) {
        handleApiError(err, "데이터 로드 실패");
      } finally {
        setLoading(false);
      }
    };

    loadInit();
  }, [navigate, fetchSchedules, pageSize, sortOrder]);

  const handleStoreFilterChange = (e) => {
    const storeId = Number(e.target.value);
    setSelectedStoreId(storeId);
    setFormData(prev => ({ ...prev, store_id: storeId }));

    // 매장 바뀌면 페이지 1로 리셋
    setPage(1);
    fetchSchedules(storeId, 1, pageSize, sortOrder);
  };

  // 정렬 변경 (최신순 / 오래된순)
  const handleSortChange = (e) => {
    const value = e.target.value; // 'desc' or 'asc'
    setSortOrder(value);
    setPage(1);
    fetchSchedules(selectedStoreId, 1, pageSize, value);
  };

  // 페이지당 개수 변경
  const handlePageSizeChange = (e) => {
    const newSize = Number(e.target.value);
    setPageSize(newSize);
    setPage(1);
    fetchSchedules(selectedStoreId, 1, newSize, sortOrder);
  };

  // 페이지 이동
  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    fetchSchedules(selectedStoreId, newPage, pageSize, sortOrder);
  };

  // 스케줄 생성
  const handleOpenSchedule = async (e) => {
    e.preventDefault();
    if (isProcessing.current) return;
    isProcessing.current = true;

    const { store_id, week_start, work_area } = formData;

    if (!store_id || !week_start) {
      toast.warn("매장과 시작 날짜를 선택해주세요.");
      isProcessing.current = false;
      return;
    }

    if (!isSuperAdmin && !allowedStoreIds.includes(Number(store_id))) {
      toast.error("해당 매장에 대한 권한이 없습니다.");
      isProcessing.current = false;
      return;
    }

    const localDate = new Date(week_start);
    const utcDateStr = new Date(Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate()
    )).toISOString().split("T")[0];

    try {
      const { data } = await api.post("/api/schedules", {
        week_start: utcDateStr,
        store_id,
        work_area
      });

      toast.success(`${data.period.label} 스케줄 오픈 완료`);
      setFormData(prev => ({ ...prev, week_start: "" }));
      // 현재 필터/정렬 그대로 다시 조회
      fetchSchedules(selectedStoreId, page, pageSize, sortOrder);
    } catch (err) {
      handleApiError(err, "스케줄 생성 실패");
    } finally {
      isProcessing.current = false;
    }
  };

  const handleAutoSchedule = async (scheduleId) => {
    if (isProcessing.current || !window.confirm("자동 배치 실행할까요?")) return;
    isProcessing.current = true;

    try {
      await api.post(`/api/schedules/${scheduleId}/auto-assign`);
      toast.success("자동 배치 완료");
      fetchSchedules(selectedStoreId, page, pageSize, sortOrder);
    } catch (err) {
      handleApiError(err, "자동 배치 실패");
    } finally {
      isProcessing.current = false;
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (isProcessing.current || !window.confirm("삭제할까요?")) return;
    isProcessing.current = true;
    try {
      await api.delete(`/api/schedules/${scheduleId}`);
      toast.success("스케줄 삭제 완료");
      // 삭제 후 현재 페이지 재조회
      fetchSchedules(selectedStoreId, page, pageSize, sortOrder);
    } catch (err) {
      handleApiError(err, "스케줄 삭제 실패");
    } finally {
      isProcessing.current = false;
    }
  };

  const renderWorkAreaLabel = (value) =>
    value === "hall" ? "홀" :
    value === "kitchen" ? "주방" : "전체";

  if (loading || !user) return <div className="loading-message">데이터 로드 중...</div>;

  return (
    <>
      <Header
        title={<><FaCalendarAlt /> 스케줄 관리</>}
        backTo="/AdminDashboard"
      />

      <div className="page-with-header">
        <div className="schedule-management">
          <ToastContainer position="top-center" theme="colored" autoClose={3500} />

          {/* 스케줄 오픈 영역 */}
          <section className="form-section">
            <h2 className="section-title"><FaPlus /> 신규 스케줄 오픈</h2>
            <form onSubmit={handleOpenSchedule} className="schedule-form">

              {/* 매장 선택 */}
              <div className="form-group">
                <label>매장 선택</label>
                {stores.length > 1 || isSuperAdmin ? (
                  <select
                    name="store_id"
                    value={formData.store_id}
                    onChange={(e) =>
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
                  <input type="text" value={stores[0]?.name || "매장 없음"} disabled />
                )}
              </div>

              {/* 근무 구역 */}
              <div className="form-group">
                <label>근무 구역</label>
                {(isSuperAdmin || user.work_area === "both") ? (
                  <select
                    name="work_area"
                    value={formData.work_area}
                    onChange={(e) =>
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
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    week_start: e.target.value
                  }))}
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
              <h2 className="list-title">
                오픈된 스케줄 목록 ({totalCount}개)
              </h2>

              <div className="filter-group">
                <FaFilter className="icon-filter" />

                {/* 정렬 선택 */}
                <select value={sortOrder} onChange={handleSortChange}>
                  <option value="desc">최신순</option>
                  <option value="asc">오래된순</option>
                </select>

                {/* 페이지당 개수 */}
                <select value={pageSize} onChange={handlePageSizeChange} style={{ marginLeft: 8 }}>
                  <option value={5}>5개씩</option>
                  <option value={10}>10개씩</option>
                  <option value={20}>20개씩</option>
                  <option value={50}>50개씩</option>
                </select>

                {/* 매장 필터 */}
                {(stores.length > 1 || isSuperAdmin) ? (
                  <select
                    value={selectedStoreId}
                    onChange={handleStoreFilterChange}
                    style={{ marginLeft: 8 }}
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={stores[0]?.name || "매장 없음"}
                    disabled
                    style={{ marginLeft: 8 }}
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
                    <tr>
                      <td colSpan={5} className="no-schedules">오픈된 스케줄이 없습니다.</td>
                    </tr>
                  ) : (
                    schedules.map(s => (
                      <tr key={s.id}>
                        <td>{s.store_name}</td>
                        <td>{s.period?.label}</td>
                        <td>{renderWorkAreaLabel(s.work_area)}</td>
                        <td>
                          {/* 상태별 색상은 CSS에서 .status-open / .status-assigned 다르게 지정 */}
                          <span className={`status-badge status-${s.status.value}`}>
                            {s.status.text}
                          </span>
                        </td>
                        <td className="actions-cell">
                          <button
                            onClick={() => setPreviewId(s.id)}
                            className="button-action button-preview"
                          >
                            미리보기
                          </button>

                          <button
                            disabled={s.status.value !== "open" || isProcessing.current}
                            className="button-action button-auto-assign"
                            onClick={() => handleAutoSchedule(s.id)}
                          >
                            <FaSyncAlt /> 자동 배치
                          </button>

                          <button
                            disabled={isProcessing.current}
                            className="button-action button-delete"
                            onClick={() => handleDeleteSchedule(s.id)}
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

            {/* 페이지네이션 영역 */}
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                >
                  이전
                </button>
                <span className="page-info">
                  {page} / {totalPages} 페이지
                </span>
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                >
                  다음
                </button>
              </div>
            )}
          </section>

          {/* 미리보기 모달 */}
          {previewId && (
            <div className="modal-overlay" onClick={() => setPreviewId(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button
                  className="modal-close"
                  onClick={() => setPreviewId(null)}
                >
                  ×
                </button>

                <SchedulePreview
                  scheduleId={previewId}
                  onClose={() => setPreviewId(null)}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

export default ScheduleManagement;
