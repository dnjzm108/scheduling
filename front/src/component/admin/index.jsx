import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

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

    // 사용자 정보 가져오기
    const fetchUserInfo = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/user`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('User info response:', response.data);
        setUserName(response.data.name);
      } catch (err) {
        console.error('User info error:', err.response?.data || err.message);
        toast.error('사용자 정보를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchUserInfo();
  }, [navigate]);

  // 로그아웃 함수
  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="adminContainer">
      <div className="adminUserInfo">
        <span className="adminUserName">{userName || '사용자'}님</span>
        <button className="adminLogoutButton" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
      <h1 className="adminTitle">관리자 대시보드</h1>
      {loading ? (
        <p className="adminLoading">로딩 중...</p>
      ) : (
        <div className="adminButtonGroup">
          <button
            className="adminButton adminButtonPrimary"
            onClick={() => navigate('/ScheduleManagement')}
          >
            스케줄 관리
          </button>
          <button
            className="adminButton adminButtonPrimary"
            onClick={() => navigate('/EmployeeManagement')}
          >
            직원 관리
          </button>
          <button
            className="adminButton adminButtonPrimary"
            onClick={() => navigate('/notices')}
          >
            공지사항 관리
          </button>
          <button
            className="adminButton adminButtonPrimary"
            onClick={() => navigate('/StoreManagement')}
          >
            매장 관리
          </button>
          <button
            className="adminButton adminButtonSuggestion"
            onClick={() => navigate('/RequestsList')}
          >
            건의사항 관리
          </button>
        </div>
      )}
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default AdminDashboard;