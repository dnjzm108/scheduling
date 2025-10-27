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
  const [details, setDetails] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
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

    const fetchScheduleOpen = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/check-schedule-open`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsScheduleOpen(response.data.is_open || false);
      } catch (err) {
        toast.error('신청 기간 확인 실패');
        setIsScheduleOpen(false);
      }
    };

    const fetchSchedules = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/my-schedules`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSchedules(response.data || []);
      } catch (err) {
        toast.error('스케줄 불러오기 실패');
        setSchedules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchScheduleOpen();
    fetchSchedules();
  }, [navigate]);

  const handlePeriodClick = async (period) => {
    if (selectedPeriod === period.week_start) {
      setSelectedPeriod(null);
      return;
    }
    if (details[period.week_start]) {
      setSelectedPeriod(period.week_start);
      return;
    }
    const token = getToken();
    try {
      const response = await axios.get(`${BASE_URL}/my-schedule-details?week_start=${period.week_start}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetails(prev => ({ ...prev, [period.week_start]: response.data }));
      setSelectedPeriod(period.week_start);
    } catch (err) {
      toast.error('상세 스케줄 불러오기 실패');
    }
  };

  const handleScheduleClick = () => navigate('/apply');
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
      <div className="myschedules-button-group">
        {isScheduleOpen && (
          <button className="myschedules-button myschedules-schedule-button" onClick={handleScheduleClick}>
            스케줄 신청하기
          </button>
        )}
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
          {schedules.map((schedule, index) => (
            <li
              key={index}
              onClick={() => handlePeriodClick(schedule)}
              className="myschedules-schedule-item"
            >
              {schedule.week_start} ({schedule.store_name})
              {selectedPeriod === schedule.week_start && details[schedule.week_start] && (
                <div className="myschedules-details">
                  <p>매장: {details[schedule.week_start].store_name || 'Unknown Store'}</p>
                  <p>상태: {details[schedule.week_start].status}</p>
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