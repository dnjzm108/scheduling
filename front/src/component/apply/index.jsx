import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

function App() {
    const navigate = useNavigate();
  const [store, setStore] = useState('');
  const [schedules, setSchedules] = useState({
    monday: { type: 'full', start: '', end: '' },
    tuesday: { type: 'full', start: '', end: '' },
    wednesday: { type: 'full', start: '', end: '' },
    thursday: { type: 'full', start: '', end: '' },
    friday: { type: 'full', start: '', end: '' },
    saturday: { type: 'full', start: '', end: '' },
    sunday: { type: 'full', start: '', end: '' },
  });

  const days = [
    { key: 'monday', label: '월요일 (10/20)' },
    { key: 'tuesday', label: '화요일 (10/21)' },
    { key: 'wednesday', label: '수요일 (10/22)' },
    { key: 'thursday', label: '목요일 (10/23)' },
    { key: 'friday', label: '금요일 (10/24)' },
    { key: 'saturday', label: '토요일 (10/25)' },
    { key: 'sunday', label: '일요일 (10/26)' },
  ];

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

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ store, schedules });
    alert('스케줄 신청 완료! (콘솔 확인)');
  };

  const handleBack = () => {
    navigate('/Myschedules');
  };

  return (
    <div className="app-container">

         <button className="back-button" onClick={handleBack}>이전 페이지로 돌아가기</button>

      <h1 className="title">출근 스케줄 신청 (10/20 ~ 10/26)</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>매장 선택:</label>
          <select value={store} onChange={(e) => setStore(e.target.value)} required>
            <option value="">선택하세요</option>
            <option value="A">샤브올데이 이천점</option>
            <option value="B">명륜진사갈비 역동점</option>
            <option value="C">명륜진사갈비 탄벌점</option>
          </select>
        </div>
        {days.map(day => (
          <div key={day.key} className="day-group">
            <h3>{day.label}</h3>
            <div className="form-group">
              <label>근무 유형:</label>
              <select
                value={schedules[day.key].type}
                onChange={(e) => handleTypeChange(day.key, e.target.value)}
              >
                <option value="full">풀타임</option>
                <option value="part">파트타임</option>
              </select>
            </div>
            {schedules[day.key].type === 'part' && (
              <div className="time-group">
                <div className="form-group">
                  <label>출근 시간:</label>
                  <input
                    type="time"
                    value={schedules[day.key].start}
                    onChange={(e) => handleTimeChange(day.key, 'start', e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>퇴근 시간:</label>
                  <input
                    type="time"
                    value={schedules[day.key].end}
                    onChange={(e) => handleTimeChange(day.key, 'end', e.target.value)}
                    required
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        <button type="submit" className="submit-button">신청하기</button>
      </form>
    </div>
  );
}

export default App;