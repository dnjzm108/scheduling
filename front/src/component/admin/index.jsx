import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState('관리자님');
  const [error, setError] = useState('');

  // Check authentication and fetch admin name
  useEffect(() => {
    const fetchAdminName = async () => {
      const token = localStorage.getItem('token');
      console.log('Token from localStorage:', token); // 디버깅 로그
      if (!token) {
        setError('로그인이 필요합니다.');
        toast.error('로그인이 필요합니다.');
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      try {
        const response = await axios.get(`${BASE_URL}/user-profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('User profile response:', response.data); // 디버깅 로그
        setAdminName(`${response.data.name}님`);

        // 추가: 관리자 권한 확인
        const isAdminResponse = await axios.get(`${BASE_URL}/user-profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!isAdminResponse.data.isAdmin) {
          setError('관리자 권한이 필요합니다.');
          toast.error('관리자 권한이 필요합니다.');
          localStorage.removeItem('token');
          setTimeout(() => navigate('/'), 2000);
          return;
        }
      } catch (err) {
        console.error('Failed to fetch admin name:', err);
        const errorMessage = err.response?.data?.message || '관리자 정보를 불러올 수 없습니다.';
        console.log('Error details:', err.response?.status, err.response?.data); // 디버깅 로그
        setError(errorMessage);
        toast.error(errorMessage);
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          setTimeout(() => navigate('/'), 2000);
        }
      }
    };
    fetchAdminName();
  }, [navigate]);

  const handleSchedulesClick = () => {
    navigate('/ScheduleManagement');
  };

  const handleEmployeesClick = () => {
    navigate('/EmployeeManagement');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    toast.success('로그아웃 되었습니다.');
    setTimeout(() => navigate('/'), 1000);
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
      {error && <p className="error-message">{error}</p>}
      <div className="menu">
        <button className="menu-button" onClick={handleSchedulesClick}>
          스케줄 관리
        </button>
        <button className="menu-button" onClick={handleEmployeesClick}>
          직원 관리
        </button>
      </div>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default AdminDashboard;