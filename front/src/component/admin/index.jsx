// src/pages/AdminDashboard.jsx (로그인 페이지와 100% 통일된 초록 테마!)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';  // 새 CSS!

function AdminDashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/user`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUserName(response.data.name);
      } catch (err) {
        console.error('User info error:', err);
        toast.error('사용자 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserInfo();
  }, [navigate]);

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="admin-container">
      <div className="admin-bg-overlay" />
      
      <div className="admin-card">
        <div className="admin-header">
          <h1 className="admin-title">관리자 대시보드</h1>
          <div className="admin-user-info">
            <span className="admin-user-name">{userName || '관리자'}님</span>
            <button className="admin-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-loading">로딩 중...</div>
        ) : (
          <div className="admin-button-group">
            <button
              className="admin-button"
              onClick={() => navigate('/ScheduleManagement')}
            >
              스케줄 관리
            </button>
            <button
              className="admin-button"
              onClick={() => navigate('/EmployeeManagement')}
            >
              직원 관리
            </button>
            <button
              className="admin-button"
              onClick={() => navigate('/notices')}
            >
              공지사항 관리
            </button>
            <button
              className="admin-button"
              onClick={() => navigate('/StoreManagement')}
            >
              매장 관리
            </button>
            <button
              className="admin-button admin-suggestion"
              onClick={() => navigate('/RequestsList')}
            >
              건의사항 관리
            </button>
          </div>
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default AdminDashboard;