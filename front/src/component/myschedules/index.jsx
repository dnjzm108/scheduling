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

function MySchedules() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [weeklyData, setWeeklyData] = useState([]);
  const [openSchedules, setOpenSchedules] = useState([]);
  const [selectedOpenSchedule, setSelectedOpenSchedule] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      return setTimeout(() => navigate('/'), 2000);
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
    } catch (err) {
      toast.error('세션 오류');
      removeToken();
      return setTimeout(() => navigate('/'), 2000);
    }

    const fetchData = async () => {
      try {
        const [openRes, myRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/schedules/open`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/schedules/my-schedules`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setOpenSchedules(openRes.data || []);
        setWeeklyData(myRes.data || []);
      } catch (err) {
        toast.error('데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleApply = () => {
    if (!selectedOpenSchedule) return toast.warn('신청할 스케줄을 선택해주세요.');

    const schedule = openSchedules.find(s => s.id === parseInt(selectedOpenSchedule));
    if (!schedule) return toast.error('스케줄을 찾을 수 없습니다.');
    if (schedule.has_applied) return toast.info('이미 신청한 스케줄입니다.');

    navigate('/apply', {
      state: { schedule_id: schedule.id, store_name: schedule.store_name }
    });
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  const getTypeText = (type) => {
    if (!type || type === 'off') return '휴무';
    if (type === 'full') return '풀타임';
    if (type === 'part') return '파트타임';
    return '휴무';
  };

  return (
    <>
    <Header title="MY PAGE" showBack={false}/>
    <div className="myschedules-container">
      {openSchedules.length > 0 ? (
        <div className="myschedules-schedule-apply">
          <select
            value={selectedOpenSchedule}
            onChange={e => setSelectedOpenSchedule(e.target.value)}
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
        <button className="myschedules-button myschedules-notice-button" onClick={() => navigate('/notices')}>
          공지사항
        </button>
        <button className="myschedules-button myschedules-suggestion-button" onClick={() => navigate('/requests')}>
          건의사항
        </button>
      </div>

      {loading ? (
        <p className="myschedules-loading">로딩 중...</p>
      ) : weeklyData.length === 0 ? (
        <p className="myschedules-no-schedules">신청한 스케줄이 없습니다.</p>
      ) : (
        <div className="weekly-schedule-container">
          {weeklyData.map((week, idx) => (
            <div key={week.id || idx} className="weekly-schedule-card">
              <div className="weekly-header">
                <strong>{week.store_name}</strong>
                <span className="week-range">{week.label}</span>
                <span className="status-badge">{week.status?.text || '신청됨'}</span>
              </div>
              <div className="weekly-days">
                {['월', '화', '수', '목', '금', '토', '일'].map(day => {
                  const data = week.daily?.[day] || { type: 'off', time: '휴무' };
                  
                  return (
                    <div key={day} className={`day-item ${data.type || 'off'}`}>
                      <div className="day-label">{day}</div>
                      <div className="day-content">
                        <span className="type">{getTypeText(data.type)}</span>
                        {data.type === 'part' && data.time && data.time !== '휴무' && (
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

      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
    </>
  );
}

export default MySchedules;