// src/pages/MySchedules/index.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import Header from '../Header';
import './index.css';

function getTypeText(type) {
  if (!type || type === 'off') return '휴무';
  if (type === 'full') return '풀타임';
  if (type === 'part') return '파트타임';
  return '휴무';
}

function MySchedules() {
  const navigate = useNavigate();

  const [userName, setUserName] = useState('');
  const [viewMode, setViewMode] = useState('requested'); // 'requested' | 'final'
  const [requestedWeeks, setRequestedWeeks] = useState([]);
  const [finalWeeks, setFinalWeeks] = useState([]);
  const [openSchedules, setOpenSchedules] = useState([]);
  const [selectedOpenSchedule, setSelectedOpenSchedule] = useState('');
  const [loading, setLoading] = useState(true);

  // 토큰 / 사용자 이름 / 데이터 로드
  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 1500);
      return;
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자');
    } catch (err) {
      console.error('JWT decode error:', err);
      toast.error('세션 오류가 발생했습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 1500);
      return;
    }

    const fetchAll = async () => {
      try {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };

        const [openRes, requestedRes, finalRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/schedules/open`, { headers }),
          axios.get(`${BASE_URL}/api/schedules/my-schedules`, { headers }),
          axios.get(`${BASE_URL}/api/schedules/my-final-schedule`, { headers }),
        ]);

        setOpenSchedules(openRes.data || []);
        setRequestedWeeks(requestedRes.data || []);
        setFinalWeeks(finalRes.data || []);
      } catch (err) {
        console.error('데이터 로드 실패:', err);
        toast.error('데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [navigate]);

  // 스케줄 신청
  const handleApply = () => {
    if (!selectedOpenSchedule) {
      toast.warn('신청할 스케줄을 선택해주세요.');
      return;
    }
    const schedule = openSchedules.find(
      (s) => s.id === Number(selectedOpenSchedule)
    );
    if (!schedule) {
      toast.error('스케줄을 찾을 수 없습니다.');
      return;
    }
    if (schedule.has_applied) {
      toast.info('이미 신청한 스케줄입니다.');
      return;
    }

    navigate('/apply', {
      state: {
        schedule_id: schedule.id,
        store_name: schedule.store_name,
        work_area: schedule.work_area || 'both',
      },
    });
  };

  const currentWeeks = viewMode === 'requested' ? requestedWeeks : finalWeeks;

  if (loading) {
    return (
      <>
        <Header title="MY PAGE" showBack={false} />
        <div className="myschedules-container">
          <p className="myschedules-loading">로딩 중...</p>
          <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="MY PAGE" showBack={false} />

      <div className="myschedules-container">

        {/* 상단 인사 + 탭 */}
        <div className="myschedules-top">
          <div className="myschedules-greeting">
            <span className="hello">안녕하세요,</span>
            <span className="name">{userName}님</span>
          </div>

          <div className="myschedules-button-group">
            <button
              className="myschedules-button myschedules-notice-button"
              onClick={() => navigate('/notices')}
            >
              공지사항
            </button>
            <button
              className="myschedules-button myschedules-suggestion-button"
              onClick={() => navigate('/requests')}
            >
              건의사항
            </button>
            <button
              className="myschedules-button myschedules-notice-button"
              onClick={() => navigate('/Mypayroll')}
            >
              나의 월급
            </button>
          </div>

          <div className="myschedules-tab-row">
            <button
              className={`myschedules-tab ${viewMode === 'requested' ? 'active' : ''}`}
              onClick={() => setViewMode('requested')}
            >
              신청한 스케줄
            </button>
            <button
              className={`myschedules-tab ${viewMode === 'final' ? 'active' : ''}`}
              onClick={() => setViewMode('final')}
            >
              확정된 스케줄
            </button>
          </div>


        </div>

        {/* 스케줄 신청 박스 (openSchedules 있을 때만 표시) */}
        {viewMode === 'requested' && openSchedules.length > 0 && (
          <div className="myschedules-schedule-apply">
            <select
              className="myschedules-select"
              value={selectedOpenSchedule}
              onChange={(e) => setSelectedOpenSchedule(e.target.value)}
            >
              <option value="">-- 신청할 스케줄 선택 --</option>
              {openSchedules.map((sch) => {
                const areaLabel =
                  sch.work_area === 'hall'
                    ? '[홀]'
                    : sch.work_area === 'kitchen'
                      ? '[주방]'
                      : '[공통]';
                return (
                  <option
                    key={sch.id}
                    value={sch.id}
                    disabled={sch.has_applied}
                  >
                    {areaLabel} {sch.store_name} - {sch.period.label}{' '}
                    {sch.has_applied ? '(신청됨)' : ''}
                  </option>
                );
              })}
            </select>

            {/* 선택된 항목이 있을 때만 버튼 표시 */}
            {selectedOpenSchedule && (
              <button
                onClick={handleApply}
                className="myschedules-button myschedules-apply-button"
              >
                스케줄 신청하기
              </button>
            )}
          </div>
        )}

        {viewMode === 'requested' && openSchedules.length === 0 && (
          <p className="myschedules-no-open">
            현재 신청 가능한 스케줄이 없습니다.
          </p>
        )}

        {/* 스케줄 카드 목록 (신청 or 확정) */}
        {currentWeeks.length === 0 ? (
          <p className="myschedules-no-schedules">
            {viewMode === 'requested'
              ? '신청한 스케줄이 없습니다.'
              : '확정된 스케줄이 없습니다.'}
          </p>
        ) : (
          <div className="weekly-schedule-container">
            {currentWeeks.map((week, idx) => (
              <div key={week.id || idx} className="weekly-schedule-card">
                <div className="weekly-header">
                  <strong>{week.store_name}</strong>
                  <span className="week-range">{week.label}</span>
                  {viewMode == 'requested' ? 
                  <span className="status-badge">
                    {week.status?.text || (viewMode === 'final' ? '확정됨' : '신청됨')}
                  </span>
                      :'' }
                </div>

                <div className="weekly-days">
                  {['월', '화', '수', '목', '금', '토', '일'].map((day) => {
                    const data = week.daily?.[day] || {
                      type: 'off',
                      time: '휴무',
                    };
                    return (
                      <div
                        key={day}
                        className={`day-item ${data.type || 'off'}`}
                      >
                        <div className="day-label">{day}</div>
                        <div className="day-content">
                          <span className="type">{getTypeText(data.type)}</span>
                          {data.type !== 'off' && data.time && data.time !== '휴무' && (
                            <span className="time">{data.time}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 토스트 */}
        <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
      </div>
    </>
  );
}

export default MySchedules;
