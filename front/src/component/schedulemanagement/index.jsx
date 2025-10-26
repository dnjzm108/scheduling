import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function ScheduleManagement() {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [weekStart, setWeekStart] = useState('');
  const [weekEnd, setWeekEnd] = useState('');
  const [schedulePeriods, setSchedulePeriods] = useState([]);
  const [error, setError] = useState('');

  // 매장 목록 및 스케줄 기간 가져오기
  useEffect(() => {
    const fetchStoresAndPeriods = async () => {
      try {
        const token = localStorage.getItem('token');
        const [storesResponse, periodsResponse] = await Promise.all([
          axios.get(`${BASE_URL}/stores`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${BASE_URL}/admin/schedule-periods`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        setStores(storesResponse.data);
        setSchedulePeriods(periodsResponse.data);
      } catch (err) {
        console.error('Error fetching stores or periods:', err);
        setError('데이터를 불러올 수 없습니다.');
        toast.error('데이터를 불러올 수 없습니다.');
      }
    };
    fetchStoresAndPeriods();
  }, []);

  const handleOpenSchedule = async () => {
    if (!selectedStore || !weekStart || !weekEnd) {
      setError('매장, 시작일, 종료일을 모두 입력하세요.');
      toast.error('매장, 시작일, 종료일을 모두 입력하세요.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${BASE_URL}/admin/open-schedule`,
        { store_id: parseInt(selectedStore), week_start: weekStart, week_end: weekEnd },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
      toast.success('스케줄 신청 기간이 열렸습니다.');
      const periodsResponse = await axios.get(`${BASE_URL}/admin/schedule-periods`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedulePeriods(periodsResponse.data);
    } catch (err) {
      const errorMessage = err.response?.data?.message || '스케줄 열기 실패';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleCloseSchedule = async (periodId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/admin/close-schedule/${periodId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setError('');
      toast.success('스케줄 신청 기간이 닫혔습니다.');
      const periodsResponse = await axios.get(`${BASE_URL}/admin/schedule-periods`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSchedulePeriods(periodsResponse.data);
    } catch (err) {
      const errorMessage = err.response?.data?.message || '스케줄 닫기 실패';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  return (
    <div className="schedule-management-container">
      <h1 className="title">스케줄 관리</h1>
      {error && <p className="error-message">{error}</p>}
      <div className="form-group">
        <label htmlFor="storeId">매장 선택</label>
        <select
          id="storeId"
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value)}
        >
          <option value="">매장을 선택하세요</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="weekStart">시작일</label>
        <input
          type="date"
          id="weekStart"
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="weekEnd">종료일</label>
        <input
          type="date"
          id="weekEnd"
          value={weekEnd}
          onChange={(e) => setWeekEnd(e.target.value)}
        />
      </div>
      <button className="submit-button" onClick={handleOpenSchedule}>
        스케줄 신청 열기
      </button>
      <h2 className="subtitle">현재 스케줄 신청 기간</h2>
      <div className="periods-list">
        {schedulePeriods.map((period) => (
          <div key={period.id} className="period-item">
            <span>
              {period.store_name}: {period.week_start} ~ {period.week_end} ({period.is_open ? '열림' : '닫힘'})
            </span>
            {period.is_open && (
              <button
                className="close-button"
                onClick={() => handleCloseSchedule(period.id)}
              >
                닫기
              </button>
            )}
          </div>
        ))}
      </div>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default ScheduleManagement;