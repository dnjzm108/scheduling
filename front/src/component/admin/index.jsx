import React from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const adminName = '관리자님'; // 실제 로그인 데이터로 대체 가능

  const handleSchedulesClick = () => {
    navigate('/ScheduleManagement');
  };

  const handleEmployeesClick = () => {
    navigate('/EmployeeManagement');
  };

  const handleLogout = () => {
    // 로그아웃 로직 (예: 토큰 삭제, 상태 초기화)
    navigate('/');
  };

  return (
    <div className="admin-container">
      <div className="header">
        <h1 className="title">관리자 페이지</h1>
        <div className="admin-info">
          <span className="admin-name">{adminName}</span>
          <button className="logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </div>
      <div className="menu">
        <button className="menu-button" onClick={handleSchedulesClick}>
          스케줄 관리
        </button>
        <button className="menu-button" onClick={handleEmployeesClick}>
          직원 관리
        </button>
      </div>
    </div>
  );
}

export default AdminDashboard;