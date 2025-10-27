import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function ScheduleManagement() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [stores, setStores] = useState([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    store_id: '',
    week_start: ''
  });

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/user`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUserName(response.data.name || '관리자');
      } catch (err) {
        toast.error('사용자 정보 불러오기 실패');
      }
    };

    const fetchData = async () => {
      try {
        const [storesRes, schedulesRes] = await Promise.all([
          axios.get(`${BASE_URL}/stores`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/schedules`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setStores(storesRes.data);
        setSchedules(schedulesRes.data);
      } catch (err) {
        toast.error('데이터 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
    fetchData();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleOpenSchedule = async (e) => {
    e.preventDefault();
    const token = getToken();
    try {
      await axios.post(`${BASE_URL}/schedule`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('스케줄 오픈 성공!');
      setSchedules([...schedules, { ...formData }]);
    } catch (err) {
      toast.error('스케줄 오픈 실패');
    }
  };

  const handleAutoSchedule = async (scheduleId) => {
    const token = getToken();
    try {
      await axios.post(`${BASE_URL}/auto-schedule`, { schedule_id: scheduleId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('자동 스케줄링 완료!');
    } catch (err) {
      toast.error('자동 스케줄링 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="schedule-management-container">
      <header className="header">
        <button className="back-button" onClick={() => navigate('/AdminDashboard')}>
          이전 페이지
        </button>
        <div className="user-info">
          <span>{userName}님</span>
          <button className="logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="main-content">
        <h1 className="title">스케줄 관리</h1>
        {loading ? (
          <p className="loading">로딩 중...</p>
        ) : (
          <div>
            <h2 className="subtitle">신규 스케줄 오픈</h2>
            <form onSubmit={handleOpenSchedule} className="open-form">
              <div className="form-group">
                <label>매장</label>
                <select name="store_id" value={formData.store_id} onChange={handleChange}>
                  <option value="">매장 선택</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>시작 날짜</label>
                <input type="date" name="week_start" value={formData.week_start} onChange={handleChange} />
              </div>
              <button type="submit" className="submit-button">스케줄 오픈</button>
            </form>
            <h2 className="subtitle">스케줄 목록</h2>
            <ul className="periods-list">
              {schedules.map(schedule => (
                <li key={schedule.id} className="period-item">
                  {schedule.date} ({schedule.store_name}) - {schedule.status}
                  <button className="close-button" onClick={() => handleAutoSchedule(schedule.id)}>
                    자동 배치
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default ScheduleManagement;