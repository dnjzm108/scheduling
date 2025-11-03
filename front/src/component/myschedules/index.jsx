// src/pages/MySchedules/index.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function MySchedules() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [openSchedules, setOpenSchedules] = useState([]);
  const [details, setDetails] = useState({});
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [loadingDetails, setLoadingDetails] = useState(new Set());
  const [selectedOpenSchedule, setSelectedOpenSchedule] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
    } catch (err) {
      console.error('Token decode error:', err);
      toast.error('세션 오류가 발생했습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchOpenSchedules = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/schedules/open`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setOpenSchedules(response.data || []);
      } catch (err) {
        console.error('오픈 스케줄 조회 실패');
      }
    };

    const fetchMySchedules = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/schedules/my-schedules`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSchedules(response.data || []);
      } catch (err) {
        toast.error('내 스케줄 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };

    fetchOpenSchedules();
    fetchMySchedules();
  }, [navigate]);

  const handleDetailClick = async (schedule) => {
    const key = schedule.id;

    if (expandedItems.has(key)) {
      setExpandedItems(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }

    if (details[key]) {
      setExpandedItems(prev => new Set(prev).add(key));
      return;
    }

    setLoadingDetails(prev => new Set(prev).add(key));

    const token = getToken();
    try {
      const response = await axios.get(
        `${BASE_URL}/api/schedules/my-schedule-details?schedule_id=${schedule.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDetails(prev => ({ ...prev, [key]: response.data }));
      setExpandedItems(prev => new Set(prev).add(key));
    } catch (err) {
      toast.error(err.response?.data?.message || '상세 스케줄 불러오기 실패');
    } finally {
      setLoadingDetails(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleApply = () => {
    if (!selectedOpenSchedule) {
      toast.warn('신청할 스케줄을 선택해주세요.');
      return;
    }

    const schedule = openSchedules.find(s => s.id === parseInt(selectedOpenSchedule));
    if (!schedule) {
      toast.error('선택한 스케줄을 찾을 수 없습니다.');
      return;
    }

    if (schedule.has_applied) {
      toast.info('이미 신청한 스케줄입니다.');
      return;
    }

    navigate('/apply', {
      state: {
        week_start: schedule.period.week_start,
        store_name: schedule.store_name
      }
    });
  };

  const handleNoticesClick = () => navigate('/notices');
  const handleSuggestionsClick = () => navigate('/requests');
  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="myschedules-container">
      <div className="myschedules-header">
        <h1 className="myschedules-title">신청 내역 확인</h1>
        <div className="myschedules-user-info">
          <span className="myschedules-user-name">{userName}님</span>
          <button className="myschedules-button myschedules-logout-button" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>

      {/* 신청 가능한 스케줄 선택 */}
      {openSchedules.length > 0 ? (
        <div className="myschedules-schedule-apply">
          <select
            value={selectedOpenSchedule}
            onChange={(e) => setSelectedOpenSchedule(e.target.value)}
            className="myschedules-select"
          >
            <option value="">-- 신청할 스케줄 선택 --</option>
            {openSchedules.map(sch => (
              <option key={sch.id} value={sch.id} disabled={sch.has_applied}>
                {sch.store_name} - {sch.period.label} {sch.has_applied ? '(신청됨)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleApply}
            disabled={!selectedOpenSchedule}
            className="myschedules-button myschedules-apply-button"
          >
            스케줄 신청하기
          </button>
        </div>
      ) : (
        <p className="myschedules-no-open">신청 가능한 스케줄이 없습니다.</p>
      )}

      <div className="myschedules-button-group">
        <button className="myschedules-button myschedules-notice-button" onClick={handleNoticesClick}>
          공지사항
        </button>
        <button className="myschedules-button myschedules-suggestion-button" onClick={handleSuggestionsClick}>
          건의사항
        </button>
      </div>

      {loading ? (
        <p className="myschedules-loading">로딩 중...</p>
      ) : schedules.length === 0 ? (
        <p className="myschedules-no-schedules">신청한 스케줄이 없습니다.</p>
      ) : (
        <ul className="myschedules-schedule-list">
          {schedules.map((schedule) => (
            <li key={schedule.id} className="myschedules-schedule-item">
              <div className="schedule-header">
                <strong>{schedule.store_name}</strong> - {schedule.period.label}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDetailClick(schedule);
                  }}
                  className="myschedules-button myschedules-detail-button"
                  disabled={loadingDetails.has(schedule.id)}
                >
                  {loadingDetails.has(schedule.id) ? '로딩 중...' :
                    expandedItems.has(schedule.id) ? '접기' : '상세 더 보기'}
                </button>
              </div>

              {expandedItems.has(schedule.id) && (
                <div className="myschedules-details">
                  {loadingDetails.has(schedule.id) ? (
                    <p>불러오는 중...</p>
                  ) : details[schedule.id] ? (
                    <>
                      <p><strong>상태:</strong> {details[schedule.id].status.text}</p>
                      <div className="assignment-summary">
                        {details[schedule.id].assignments.length > 0 ? (
                          details[schedule.id].assignments
                            .sort((a, b) => new Date(a.date) - new Date(b.date))
                            .map((ass, idx) => {
                              const timeText = ass.status.text === '배정됨'
                                ? ass.time.label
                                : ass.status.text;
                              return (
                                <span key={idx}>
                                  <strong>{ass.day}</strong> {timeText}
                                  {idx < details[schedule.id].assignments.length - 1 && ' | '}
                                </span>
                              );
                            })
                        ) : (
                          <span>신청 내역 없음</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p>데이터 없음</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default MySchedules;