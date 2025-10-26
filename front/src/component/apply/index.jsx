import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function Apply() {
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [schedules, setSchedules] = useState({
    monday: { type: 'off', start: '', end: '' },
    tuesday: { type: 'off', start: '', end: '' },
    wednesday: { type: 'off', start: '', end: '' },
    thursday: { type: 'off', start: '', end: '' },
    friday: { type: 'off', start: '', end: '' },
    saturday: { type: 'off', start: '', end: '' },
    sunday: { type: 'off', start: '', end: '' },
  });

  const days = [
    { key: 'monday', label: '월요일' },
    { key: 'tuesday', label: '화요일' },
    { key: 'wednesday', label: '수요일' },
    { key: 'thursday', label: '목요일' },
    { key: 'friday', label: '금요일' },
    { key: 'saturday', label: '토요일' },
    { key: 'sunday', label: '일요일' },
  ];

  useEffect(() => {
    console.log('Apply - Entering useEffect');
    const token = localStorage.getItem('token');
    console.log('Apply - Token:', token); // 디버깅 로그
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchUserStore = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/user-store`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Apply - User store response:', response.data); // 디버깅 로그
        setStoreId(response.data.store_id);
        setStoreName(response.data.store_name);
      } catch (err) {
        console.error('Apply - Fetch user store error:', err);
        toast.error('매장 정보 불러오기 실패: ' + (err.response?.data?.message || '서버 오류'));
      }
    };

    const fetchOpenPeriod = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/check-schedule-open`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Apply - Schedule open response:', response.data); // 디버깅 로그
        if (!response.data.is_open) {
          toast.error('신청 기간이 아닙니다.');
          setTimeout(() => navigate('/myschedules'), 2000);
          return;
        }
        setWeekStart(response.data.week_start);
        setWeekEnd(response.data.week_end);
      } catch (err) {
        console.error('Apply - Fetch open period error:', err);
        toast.error('신청 기간 확인 실패: ' + (err.response?.data?.message || '서버 오류'));
        setTimeout(() => navigate('/myschedules'), 2000);
      }
    };

    fetchUserStore();
    fetchOpenPeriod();
  }, [navigate]);

  const handleTypeChange = (day, value) => {
    setSchedules(prev => ({
      ...prev,
      [day]: { ...prev[day], type: value, start: value === 'part' ? prev[day].start : '', end: value === 'part' ? prev[day].end : '' },
    }));
  };

  const handleTimeChange = (day, field, value) => {
    setSchedules(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    console.log('Apply - Submit token:', token); // 디버깅 로그
    if (!token) {
      toast.error('로그인이 필요합니다.');
      navigate('/');
      return;
    }
    if (!storeId) {
      toast.error('매장 정보가 없습니다.');
      return;
    }
    if (!weekStart) {
      toast.error('신청 기간이 설정되지 않았습니다.');
      return;
    }
    try {
      const response = await axios.post(
        `${BASE_URL}/schedule`,
        { week_start: weekStart, store_id: storeId, schedules },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Apply - Schedule submission response:', response.data); // 디버깅 로그
      toast.success('스케줄 신청 완료!');
      setTimeout(() => navigate('/myschedules'), 2000);
    } catch (err) {
      console.error('Apply - Schedule submission error:', err);
      toast.error('스케줄 신청 실패: ' + (err.response?.data?.message || '서버 오류'));
    }
  };

  const handleBack = () => {
    navigate('/myschedules');
  };

  return (
    <div className="apply-container">
      <h1 className="title">출근 스케줄 신청 ({weekStart} ~ {weekEnd})</h1>
      <div className="store-info">매장: {storeName || '로딩 중...'}</div>
      <form onSubmit={handleSubmit}>
        {days.map(day => (
          <div key={day.key} className="day-group">
            <h3>{day.label}</h3>
            <div className="form-row">
              <div className="form-group type-group">
                <label>근무 유형</label>
                <select
                  value={schedules[day.key].type}
                  onChange={(e) => handleTypeChange(day.key, e.target.value)}
                >
                  <option value="full">풀타임</option>
                  <option value="part">파트타임</option>
                  <option value="off">휴무</option>
                </select>
              </div>
              <div className="form-group time-group">
                <label>출근 시간</label>
                <input
                  type="time"
                  value={schedules[day.key].start}
                  onChange={(e) => handleTimeChange(day.key, 'start', e.target.value)}
                  disabled={schedules[day.key].type !== 'part'}
                  required={schedules[day.key].type === 'part'}
                />
              </div>
              <div className="form-group time-group">
                <label>퇴근 시간</label>
                <input
                  type="time"
                  value={schedules[day.key].end}
                  onChange={(e) => handleTimeChange(day.key, 'end', e.target.value)}
                  disabled={schedules[day.key].type !== 'part'}
                  required={schedules[day.key].type === 'part'}
                />
              </div>
            </div>
          </div>
        ))}
        <div className="button-group">
          <button type="button" className="back-button" onClick={handleBack}>이전 페이지</button>
          <button type="submit" className="submit-button">신청하기</button>
        </div>
      </form>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default Apply;