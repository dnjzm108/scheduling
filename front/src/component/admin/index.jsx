// src/pages/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header'; // ← 경로 수정!
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';
import './index.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    axios.get(`${BASE_URL}/api/user`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      setUserName(res.data.name || '관리자');
    }).catch(() => {
      toast.error('정보 로드 실패');
    }).finally(() => {
      setLoading(false);
    });
  }, [navigate]);

  const menuItems = [
    { label: '스케줄 관리', path: '/ScheduleManagement' },
    { label: '직원 관리', path: '/EmployeeManagement' },
    { label: '공지사항 관리', path: '/notices' },
    { label: '매장 관리', path: '/StoreManagement' },
    { label: '건의사항 관리', path: '/RequestsList' },
  ];

  return (
    <div className="admin-container">
     <Header title="관리자 대시보드" showBack={false} />

      {/* 이 클래스가 핵심! */}
      <div className="admin-content page-with-header">
        <div className="admin-card">
          {loading ? (
            <div className="admin-loading">로딩 중...</div>
          ) : (
            <div className="admin-grid">
              {menuItems.map((item, i) => (
                <button
                  key={i}
                  className="admin-menu-btn"
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default AdminDashboard;