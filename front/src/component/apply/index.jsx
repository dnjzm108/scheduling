// src/component/apply/index.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';
import './index.css';
import Header from '../Header'

function Apply() {
  const navigate = useNavigate();
  const location = useLocation();

  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);

  const days = [
    { key: 'mon', label: '월요일' },
    { key: 'tue', label: '화요일' },
    { key: 'wed', label: '수요일' },
    { key: 'thu', label: '목요일' },
    { key: 'fri', label: '금요일' },
    { key: 'sat', label: '토요일' },
    { key: 'sun', label: '일요일' }
  ];

// src/component/apply/index.jsx
useEffect(() => {
  const token = getToken();
  if (!token) {
    toast.error('로그인이 필요합니다.');
    return setTimeout(() => navigate('/'), 2000);
  }

  const state = location.state;
  if (!state || !state.schedule_id) {
    toast.error('잘못된 접근입니다.');
    return navigate('/myschedules');
  }

  const { schedule_id, store_name } = state;

  setSchedules(Object.fromEntries(days.map(d => [d.key, { type: 'off', start: '', end: '' }])));

  const fetchSchedule = async () => {
    try {
      const response = await axios.get(
        `${BASE_URL}/api/schedules/${schedule_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = response.data;
      console.log("==============",data);
      
      setStoreId(data.store_id);
      setStoreName(store_name || data.store_name);
      setWeekStart(data.week_start); // 이제 정확한 2025-11-17
      setWeekEnd(data.week_end);     // 정확한 2025-11-23

    } catch (err) {
      toast.error('스케줄 정보를 불러올 수 없습니다.');
      navigate('/myschedules');
    } finally {
      setLoading(false);
    }
  };

  fetchSchedule();
}, [navigate, location.state]);


  const handleTypeChange = (day, value) => {
    setSchedules(prev => ({
      ...prev,
      [day]: { 
        ...prev[day], 
        type: value, 
        start: value === 'part' ? prev[day].start : '', 
        end: value === 'part' ? prev[day].end : '' 
      }
    }));
  };

  const handleTimeChange = (day, field, value) => {
    setSchedules(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();
    if (!token) return navigate('/');

    // 유효성 검사
    for (const day of Object.keys(schedules)) {
      if (schedules[day].type === 'part' && (!schedules[day].start || !schedules[day].end)) {
        toast.error(`${day}의 출근/퇴근 시간을 입력하세요.`);
        return;
      }
    }

    try {
      await axios.post(
        `${BASE_URL}/api/schedules/schedule`,
        { 
          week_start: weekStart,
          store_id: storeId,
          schedules 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('스케줄 신청 완료!');
      setTimeout(() => navigate('/myschedules'), 2000);
    } catch (err) {
      toast.error(err.response?.data?.message || '신청 실패');
    }
  };

  return (
    <div className="apply-container ">
      <Header />
      <div className="apply-container "/>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
      <h1 className="apply-title">출근 스케줄 신청 ({weekStart} ~ {weekEnd})</h1>
      <div className="apply-store-info">매장: {storeName || '로딩 중...'}</div>
      
      {loading ? (
        <p className="apply-loading">로딩 중...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {days.map(day => (
            <div key={day.key} className="apply-day-group">
              <h3>{day.label}</h3>
              <div className="apply-form-row">
                <div className="apply-form-group apply-type-group">
                  <label>근무 유형</label>
                  <select
                    value={schedules[day.key]?.type || 'off'}
                    onChange={(e) => handleTypeChange(day.key, e.target.value)}
                  >
                    <option value="full">풀타임</option>
                    <option value="part">파트타임</option>
                    <option value="off">휴무</option>
                  </select>
                </div>
                <div className="apply-form-group apply-time-group">
                  <label>출근 시간</label>
                  <input
                    type="time"
                    value={schedules[day.key]?.start || ''}
                    onChange={(e) => handleTimeChange(day.key, 'start', e.target.value)}
                    disabled={schedules[day.key]?.type !== 'part'}
                    required={schedules[day.key]?.type === 'part'}
                  />
                </div>
                <div className="apply-form-group apply-time-group">
                  <label>퇴근 시간</label>
                  <input
                    type="time"
                    value={schedules[day.key]?.end || ''}
                    onChange={(e) => handleTimeChange(day.key, 'end', e.target.value)}
                    disabled={schedules[day.key]?.type !== 'part'}
                    required={schedules[day.key]?.type === 'part'}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="apply-button-group">
            <button type="button" className="apply-button apply-back-button" onClick={() => navigate('/myschedules')}>
              이전 페이지
            </button>
            <button type="submit" className="apply-button apply-submit-button">신청하기</button>
          </div>
        </form>
      )}
    </div>
  );
}

export default Apply;