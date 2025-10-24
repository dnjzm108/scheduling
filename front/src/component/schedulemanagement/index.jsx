import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import './index.css';

function ScheduleManagement() {
  const navigate = useNavigate();
  const [selectedWeek, setSelectedWeek] = useState('10/20~10/26'); // 기본 선택 주

  // 주 단위 옵션 (하드코딩, 실제 DB에서 불러올 수 있음)
  const weeks = [
    '10/13~10/19',
    '10/20~10/26',
    '10/27~11/02',
  ];

  // 신청 데이터 (하드코딩 예시, 실제 DB에서 불러오기)
  const scheduleData = {
    '10/13~10/19': [
      { name: '홍길동', monday: '09:00-18:00', tuesday: '휴무', wednesday: '09:00-18:00', thursday: '09:00-18:00', friday: '09:00-18:00', saturday: '10:00-15:00', sunday: '휴무' },
      { name: '김철수', monday: '휴무', tuesday: '09:00-18:00', wednesday: '09:00-18:00', thursday: '휴무', friday: '09:00-18:00', saturday: '09:00-18:00', sunday: '10:00-15:00' },
    ],
    '10/20~10/26': [
      { name: '홍길동', monday: '10:00-19:00', tuesday: '09:00-18:00', wednesday: '휴무', thursday: '09:00-18:00', friday: '09:00-18:00', saturday: '휴무', sunday: '09:00-18:00' },
      { name: '김철수', monday: '09:00-18:00', tuesday: '휴무', wednesday: '09:00-18:00', thursday: '09:00-18:00', friday: '휴무', saturday: '09:00-18:00', sunday: '09:00-18:00' },
    ],
    '10/27~11/02': [
      { name: '홍길동', monday: '09:00-18:00', tuesday: '09:00-18:00', wednesday: '09:00-18:00', thursday: '휴무', friday: '09:00-18:00', saturday: '10:00-15:00', sunday: '휴무' },
      { name: '김철수', monday: '휴무', tuesday: '09:00-18:00', wednesday: '휴무', thursday: '09:00-18:00', friday: '09:00-18:00', saturday: '09:00-18:00', sunday: '10:00-15:00' },
    ],
  };

  const handleLogout = () => {
    navigate('/');
  };

  const handleBack = () => {
    navigate('/admin');
  };

  const handleDownload = () => {
    const data = scheduleData[selectedWeek] || [];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedWeek);
    XLSX.writeFile(wb, `${selectedWeek}_schedules.xlsx`);
  };

  const currentSchedules = scheduleData[selectedWeek] || [];

  return (
    <div className="schedule-management-container">
      <div className="header">
        <h1 className="title">직원 스케줄 관리</h1>
        <div className="admin-info">
          <span className="admin-name">관리자님</span>
          <button className="logout-button" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>
      <button className="back-button" onClick={handleBack}>이전 페이지로 돌아가기</button>
      <div className="week-selector">
        <label>날짜 선택:</label>
        <select value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
          {weeks.map(week => <option key={week} value={week}>{week}</option>)}
        </select>
      </div>
      <button className="download-button" onClick={handleDownload}>엑셀로 다운로드</button>
      <table className="schedule-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>월요일</th>
            <th>화요일</th>
            <th>수요일</th>
            <th>목요일</th>
            <th>금요일</th>
            <th>토요일</th>
            <th>일요일</th>
          </tr>
        </thead>
        <tbody>
          {currentSchedules.map((emp, index) => (
            <tr key={index}>
              <td>{emp.name}</td>
              <td>{emp.monday}</td>
              <td>{emp.tuesday}</td>
              <td>{emp.wednesday}</td>
              <td>{emp.thursday}</td>
              <td>{emp.friday}</td>
              <td>{emp.saturday}</td>
              <td>{emp.sunday}</td>
            </tr>
          ))}
          {currentSchedules.length === 0 && (
            <tr>
              <td colSpan="8" style={{ textAlign: 'center' }}>신청한 스케줄이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default ScheduleManagement;