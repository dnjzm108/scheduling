import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function MySchedules() {
  const navigate = useNavigate();
  const location = useLocation();
  const [userName, setUserName] = useState(location.state?.name || '');
  const [schedules, setSchedules] = useState([]);
  const [details, setDetails] = useState({});
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    // 이름 복구
    if (!userName) {
      try {
        const decoded = jwtDecode(token);
        setUserName(decoded.name || '사용자님');
        console.log('Decoded name from token:', decoded.name); // 디버깅 로그
      } catch (err) {
        console.error('Token decode error:', err);
        toast.error('세션 오류가 발생했습니다.');
        localStorage.removeItem('token');
        navigate('/');
        return;
      }
    }

    const fetchScheduleOpen = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/check-schedule-open`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsScheduleOpen(response.data.is_open || false);
        console.log('Schedule open status:', response.data.is_open); // 디버깅 로그
      } catch (err) {
        console.error('Schedule open check error:', err);
        setIsScheduleOpen(false);
        toast.error('신청 기간 확인 실패');
      }
    };

    const fetchSchedules = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/my-schedules`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSchedules(response.data || []);
        console.log('Fetched schedules:', response.data); // 디버깅 로그
      } catch (err) {
        console.error('Schedules fetch error:', err);
        toast.error('스케줄 불러오기 실패');
        setSchedules([]);
      }
    };

    fetchScheduleOpen();
    fetchSchedules();
  }, [navigate, userName]);

  const handlePeriodClick = async (period) => {
    if (selectedPeriod === period.week_start) {
      setSelectedPeriod(null);
      return;
    }
    if (details[period.week_start]) {
      setSelectedPeriod(period.week_start);
      return;
    }
    const token = localStorage.getItem('token');
    console.log('Period click token:', token); // 디버깅 로그
    if (!token) {
      toast.error('로그인이 필요합니다.');
      navigate('/');
      return;
    }
    try {
      const response = await axios.get(`${BASE_URL}/my-schedule-details?week_start=${period.week_start}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetails(prev => ({ ...prev, [period.week_start]: response.data }));
      setSelectedPeriod(period.week_start);
      console.log('Fetched details:', response.data); // 디버깅 로그
    } catch (err) {
      console.error('Schedule details error:', err);
      toast.error('상세 스케줄 불러오기 실패');
    }
  };

  const handleScheduleClick = () => {
    navigate('/apply');
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); // 'authToken' → 'token' 통일
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="myschedules-container">
      <div className="header">
        <h1 className="title">신청 내역 확인</h1>
        <div className="user-info">
          <span className="user-name">{userName}님</span>
          <button className="logout-button" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>
      {isScheduleOpen && (
        <button className="schedule-button" onClick={handleScheduleClick}>스케줄 신청하기</button>
      )}
      {schedules.length === 0 ? (
        <p className="no-schedules">신청한 스케줄이 없습니다.</p>
      ) : (
        <ul className="schedule-list">
          {schedules.map((schedule, index) => (
            <li key={index} onClick={() => handlePeriodClick(schedule)} className="schedule-item">
              {schedule.week_start} ({schedule.store_name})
              {selectedPeriod === schedule.week_start && details[schedule.week_start] && (
                <div className="details">
                  <p>매장: {details[schedule.week_start].store_name || 'Unknown Store'}</p>
                  <p>월요일: {details[schedule.week_start].monday_type === 'part' ? `${details[schedule.week_start].monday_start}-${details[schedule.week_start].monday_end}` : details[schedule.week_start].monday_type || '휴무'}</p>
                  <p>화요일: {details[schedule.week_start].tuesday_type === 'part' ? `${details[schedule.week_start].tuesday_start}-${details[schedule.week_start].tuesday_end}` : details[schedule.week_start].tuesday_type || '휴무'}</p>
                  <p>수요일: {details[schedule.week_start].wednesday_type === 'part' ? `${details[schedule.week_start].wednesday_start}-${details[schedule.week_start].wednesday_end}` : details[schedule.week_start].wednesday_type || '휴무'}</p>
                  <p>목요일: {details[schedule.week_start].thursday_type === 'part' ? `${details[schedule.week_start].thursday_start}-${details[schedule.week_start].thursday_end}` : details[schedule.week_start].thursday_type || '휴무'}</p>
                  <p>금요일: {details[schedule.week_start].friday_type === 'part' ? `${details[schedule.week_start].friday_start}-${details[schedule.week_start].friday_end}` : details[schedule.week_start].friday_type || '휴무'}</p>
                  <p>토요일: {details[schedule.week_start].saturday_type === 'part' ? `${details[schedule.week_start].saturday_start}-${details[schedule.week_start].saturday_end}` : details[schedule.week_start].saturday_type || '휴무'}</p>
                  <p>일요일: {details[schedule.week_start].sunday_type === 'part' ? `${details[schedule.week_start].sunday_start}-${details[schedule.week_start].sunday_end}` : details[schedule.week_start].sunday_type || '휴무'}</p>
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