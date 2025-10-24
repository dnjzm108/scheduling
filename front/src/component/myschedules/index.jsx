import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // 라우팅을 위한 useNavigate
import './index.css';

function MySchedules() {
  const navigate = useNavigate();
  const userName = '홍길동님'; // 회원 이름 (로그인 데이터로 대체 가능)

  // 신청한 스케줄 리스트 (하드코딩, 실제 DB에서 불러오기)
  const schedules = [
    { period: '10/06~10/12 스케줄', details: { monday: '09:00-18:00', tuesday: '풀타임', /* ... */ sunday: '휴무' } },
    { period: '10/13~10/19 스케줄', details: { monday: '10:00-19:00', tuesday: '파트타임 14:00-18:00', /* ... */ sunday: '09:00-17:00' } },
    { period: '10/20~10/26 스케줄', details: { monday: '09:00-18:00', tuesday: '휴무', /* ... */ sunday: '풀타임' } },
  ];

  const [selectedPeriod, setSelectedPeriod] = useState(null); // 선택된 스케줄 기간

  const handlePeriodClick = (period) => {
    setSelectedPeriod(selectedPeriod === period ? null : period); // 토글
  };

  const handleScheduleClick = () => {
    navigate('/apply'); // 스케줄 신청 페이지로 이동
  };

  return (
    <div className="myschedules-container">
      <div className="header">
        <h1 className="title">신청 내역 확인</h1>
        <div className="user-name">{userName}</div>
      </div>
      <button className="schedule-button" onClick={handleScheduleClick}>스케줄 신청하기</button>
      <ul className="schedule-list">
        {schedules.map((schedule, index) => (
          <li key={index} onClick={() => handlePeriodClick(schedule.period)} className="schedule-item">
            {schedule.period}
            {selectedPeriod === schedule.period && (
              <div className="details">
                <p>월요일: {schedule.details.monday}</p>
                <p>화요일: {schedule.details.tuesday}</p>
                <p>수요일: {schedule.details.wednesday || '휴무'}</p>
                <p>목요일: {schedule.details.thursday || '휴무'}</p>
                <p>금요일: {schedule.details.friday || '휴무'}</p>
                <p>토요일: {schedule.details.saturday || '휴무'}</p>
                <p>일요일: {schedule.details.sunday}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MySchedules;