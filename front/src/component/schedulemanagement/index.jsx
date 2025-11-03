// src/component/schedulemanagement/index.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
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

import './index.css';
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';

// SchedulePreview 컴포넌트 임포트
import SchedulePreview from '../SchedulePreview';

function ScheduleManagement() {
    const navigate = useNavigate();
    const [schedules, setSchedules] = useState([]);
    const [stores, setStores] = useState([]);
    const [userName, setUserName] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedStoreId, setSelectedStoreId] = useState('');
    const [formData, setFormData] = useState({
        store_id: '',
        week_start: ''
    });
    // previewId 상태 추가
    const [previewId, setPreviewId] = useState(null);

    // 429 Rate Limit 전용 알림
    const handleRateLimit = () => {
        toast.warn(
            <div style={{ textAlign: 'center', lineHeight: '1.6' }}>
                <strong>접속량이 많습니다</strong><br />
                <small>잠시 후 다시 시도해 주세요</small>
            </div>,
            {
                autoClose: 5000,
                position: 'top-center',
                icon: 'Warning',
                style: { background: '#fff3cd', color: '#856404', border: '1px solid #ffeaa7' }
            }
        );
    };

    // 공통 에러 처리
    const handleApiError = (err, defaultMsg = '요청 실패') => {
        if (err.response?.status === 429) {
            handleRateLimit();
        } else {
            console.error('API Error:', err.response?.data || err.message);
            toast.error(err.response?.data?.message || defaultMsg);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const fetchSchedules = useCallback(async (token, storeId = '') => {
        try {
            const url = `${BASE_URL}/api/schedules${storeId ? `?store_id=${storeId}` : ''}`;
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSchedules(response.data || []);
        } catch (err) {
            handleApiError(err, '스케줄 목록 불러오기 실패');
        }
    }, []);

    useEffect(() => {
        const token = getToken();
        if (!token) {
            toast.error('로그인이 필요합니다.');
            setTimeout(() => navigate('/'), 2000);
            return;
        }

        const fetchUserInfo = async () => {
            try {
                const response = await axios.get(`${BASE_URL}/api/user`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setUserName(response.data.name || '관리자');
            } catch (err) {
                handleApiError(err, '사용자 정보 불러오기 실패');
            }
        };

        const fetchAllData = async () => {
            setLoading(true);
            try {
                const [storesRes, schedulesRes] = await Promise.all([
                    axios.get(`${BASE_URL}/api/stores`, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(`${BASE_URL}/api/schedules`, { headers: { Authorization: `Bearer ${token}` } })
                ]);
                const loadedStores = storesRes.data || [];
                setStores(loadedStores);

                let initialStoreId = '';
                if (loadedStores.length > 0) {
                    initialStoreId = loadedStores[0].id;
                    setFormData(prev => ({ ...prev, store_id: initialStoreId }));
                    setSelectedStoreId(initialStoreId);
                }

                setSchedules(schedulesRes.data || []);
            } catch (err) {
                handleApiError(err, '데이터 불러오기 실패');
            } finally {
                setLoading(false);
            }
        };

        fetchUserInfo();
        fetchAllData();
    }, [navigate, fetchSchedules]);

    const handleStoreFilterChange = async (e) => {
        const storeId = e.target.value;
        setSelectedStoreId(storeId);
        const token = getToken();
        await fetchSchedules(token, storeId);
    };

    const handleOpenSchedule = async (e) => {
        e.preventDefault();
        const token = getToken();
        if (!token) return;

        if (!formData.store_id || !formData.week_start) {
            toast.warn('매장과 시작 날짜를 선택해주세요.');
            return;
        }

        try {
            const response = await axios.post(
                `${BASE_URL}/api/schedules`,
                {
                    week_start: formData.week_start,
                    store_id: selectedStoreId
                },
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            const { message, store_name, period } = response.data;

            toast.success(
                <div style={{ lineHeight: '1.5', textAlign: 'center' }}>
                    <strong>{store_name}</strong><br />
                    {period.label}<br />
                    <small>{message}</small>
                </div>,
                { autoClose: 4000, position: 'top-center' }
            );

            setFormData(prev => ({ ...prev, week_start: '' }));
            await fetchSchedules(token, selectedStoreId);

        } catch (err) {
            handleApiError(err, '스케줄 생성 실패');
        }
    };

    const handleAutoSchedule = async (scheduleId) => {
        const token = getToken();
        if (!window.confirm('선택된 스케줄에 대해 자동 배치를 실행하시겠습니까?')) return;

        try {
            await axios.post(`${BASE_URL}/api/schedules/${scheduleId}/auto-assign`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('자동 배치가 완료되었습니다.');
            await fetchSchedules(token, selectedStoreId);
        } catch (error) {
            handleApiError(error, '자동 배치에 실패했습니다.');
        }
    };

    const handleDeleteSchedule = async (scheduleId) => {
        const token = getToken();
        if (!window.confirm('이 스케줄을 영구히 삭제하시겠습니까? 관련 신청 내역도 삭제됩니다.')) return;

        try {
            await axios.delete(`${BASE_URL}/api/schedules/${scheduleId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('스케줄이 성공적으로 삭제되었습니다.');
            await fetchSchedules(token, selectedStoreId);
        } catch (error) {
            handleApiError(error, '스케줄 삭제에 실패했습니다.');
        }
    };

    const handleViewDetails = (scheduleId) => {
        setPreviewId(scheduleId); // 미리보기 모달 열기
    };

    if (loading) {
        return <div className="loading-message">데이터를 로드하는 중입니다...</div>;
    }

    return (
        <div className="schedule-management">
            <ToastContainer
                position="top-center"
                autoClose={4000}
                hideProgressBar={false}
                newestOnTop
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="colored"
            />

            <header className="header">
                <h1 className="title">
                    <FaCalendarAlt className="icon-calendar" /> 스케줄 관리
                </h1>
                <div className="user-info">
                    <span className="username">{userName} 님</span>
                    <button
                        onClick={() => navigate('/AdminDashboard')}
                        className="button-dashboard"
                    >
                        이전페이지
                    </button>
                </div>
            </header>

            <section className="form-section">
                <h2 className="section-title">
                    <FaPlus className="icon-plus" /> 신규 스케줄 기간 오픈
                </h2>
                <form onSubmit={handleOpenSchedule} className="schedule-form">
                    <div className="form-group">
                        <label htmlFor="store_id_form" className="form-label">매장 선택</label>
                        <select
                            id="store_id_form"
                            name="store_id"
                            required
                            value={formData.store_id}
                            onChange={handleChange}
                            className="form-select"
                        >
                            <option value="" disabled>-- 매장 선택 --</option>
                            {stores.map(store => (
                                <option key={store.id} value={store.id}>{store.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label htmlFor="week_start" className="form-label">시작 날짜 (해당 주 월요일)</label>
                        <input
                            type="date"
                            id="week_start"
                            name="week_start"
                            required
                            value={formData.week_start}
                            onChange={handleChange}
                            className="form-input"
                        />
                    </div>
                    <button
                        type="submit"
                        className="button-submit"
                        disabled={stores.length === 0 || !formData.store_id}
                    >
                        스케줄 오픈
                    </button>
                </form>
            </section>

            <section className="list-section">
                <div className="list-header">
                    <h2 className="list-title">오픈된 스케줄 목록 ({schedules.length}개)</h2>
                    <div className="filter-group">
                        <FaFilter className="icon-filter" />
                        <select
                            value={selectedStoreId}
                            onChange={handleStoreFilterChange}
                            className="form-select filter-select"
                        >
                            <option value="">전체 매장</option>
                            {stores.map(store => (
                                <option key={store.id} value={store.id}>{store.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="table-container">
                    <table className="schedule-table">
                        <thead>
                            <tr>
                                <th><FaStore className="inline-icon" /> 매장명</th>
                                <th><FaCalendarAlt className="inline-icon" /> 기간 (시작 ~ 종료)</th>
                                <th>상태</th>
                                <th className="actions-header">액션</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.length > 0 ? (
                                schedules.map((schedule) => (
                                    <tr key={schedule.id}>
                                        <td data-label="매장명">{schedule.store_name}</td>
                                        <td data-label="기간">{schedule.period?.label || schedule.date}</td>
                                        <td data-label="상태">
                                            <span className={`status-badge status-${schedule.status}`}>
                                                {schedule.status === 'assigned' ? '배치 완료' :
                                                 schedule.status === 'open' ? '신청 대기 중' :
                                                 '마감'}
                                            </span>
                                        </td>
                                        <td data-label="액션" className="actions-cell">
                                            <button
                                                onClick={() => handleViewDetails(schedule.id)}
                                                className="button-action button-preview"
                                            >
                                                미리보기
                                            </button>
                                            <button
                                                onClick={() => handleAutoSchedule(schedule.id)}
                                                disabled={schedule.status !== 'open'}
                                                className={`button-action button-auto-assign ${schedule.status !== 'open' ? 'disabled' : ''}`}
                                            >
                                                <FaSyncAlt className="inline-icon" /> 자동 배치
                                            </button>
                                            <button
                                                onClick={() => handleDeleteSchedule(schedule.id)}
                                                className="button-action button-delete"
                                            >
                                                <FaTrash className="inline-icon" /> 삭제
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="no-schedules">
                                        오픈된 스케줄이 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 미리보기 모달 (tbody 밖으로 이동) */}
            {previewId && (
                <div className="modal-overlay" onClick={() => setPreviewId(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setPreviewId(null)}>×</button>
                        <SchedulePreview 
                            scheduleId={previewId} 
                            onClose={() => setPreviewId(null)} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default ScheduleManagement;