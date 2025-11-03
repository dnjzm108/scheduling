// src/pages/Apply/index.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';
import './index.css';

function Apply() {
  const navigate = useNavigate();
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

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    // schedules 초기화
    setSchedules(Object.fromEntries(days.map(d => [d.key, { type: 'off', start: '', end: '' }])));

    const fetchUserStore = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/auth/user-store`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStoreId(response.data.store_id);
        setStoreName(response.data.store_name);
      } catch (err) {
        toast.error('매장 정보 불러오기 실패');
      }
    };

    const fetchOpenPeriod = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/schedules/check-schedule-open`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.data.is_open) {
          toast.error('신청 기간이 아닙니다.');
          setTimeout(() => navigate('/myschedules'), 2000);
          return;
        }

        const { start, end } = response.data.period;

        // 백엔드 기준: 월요일 ~ 일요일
        const startDate = new Date(start);
        const correctedStart = new Date(startDate);
        correctedStart.setDate(startDate.getDate() - startDate.getDay() + 1); // 월요일 보정
        const correctedEnd = new Date(correctedStart);
        correctedEnd.setDate(correctedStart.getDate() + 6);

        setWeekStart(correctedStart.toISOString().split('T')[0]);
        setWeekEnd(correctedEnd.toISOString().split('T')[0]);

      } catch (err) {
        toast.error('신청 기간 확인 실패');
        setTimeout(() => navigate('/myschedules'), 2000);
      } finally {
        setLoading(false);
      }
    };

    fetchUserStore();
    fetchOpenPeriod();
  }, [navigate]);

  const handleTypeChange = (day, value) => {
    setSchedules(prev => ({
      ...prev,
      [day]: { ...prev[day], type: value, start: value === 'part' ? prev[day].start : '', end: value === 'part' ? prev[day].end : '' }
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
    if (!token) {
      toast.error('로그인이 필요합니다.');
      navigate('/');
      return;
    }

    // 필수값 검증
    if (!weekStart || !storeId || !schedules || Object.keys(schedules).length === 0) {
      toast.error('필수 정보를 모두 입력해주세요.');
      return;
    }

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
          store_id: storeId, // 정확히 전달
          schedules 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('스케줄 신청 완료!');
      setTimeout(() => navigate('/myschedules'), 2000);
    } catch (err) {
      toast.error(err.response?.data?.message || '스케줄 신청 실패');
    }
  };

  return (
    <div className="apply-container">
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