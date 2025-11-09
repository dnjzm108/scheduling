// src/components/Header/index.jsx
import React, { useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getToken, removeToken } from '../../utils/auth';
import { jwtDecode } from 'jwt-decode';
import api from '../../utils/api'; // 취소 가능한 axios
import './index.css'; 

function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isNavigating = useRef(false);
  const isLoggingOut = useRef(false);

  const token = getToken();
  let userName = '사용자님';
  let userLevel = 0;

  if (token) {
    try {
      const decoded = jwtDecode(token);
      userName = decoded.name || '사용자님';
      userLevel = decoded.level || 0;
    } catch (err) { /* 무시 */ }
  }

  const getLevelText = (level) => ['승인대기', '직원', '매장관리자', '총관리자'][level] || '알 수 없음';

  const handleLogout = () => {
    if (isLoggingOut.current) return; // 중복 방지
    isLoggingOut.current = true;

    removeToken();
    toast.success('로그아웃되었습니다.');

    setTimeout(() => {
      if (!isNavigating.current) {
        isNavigating.current = true;
        navigate('/', { replace: true });
      }
    }, 1500);
  };

  const handleBack = () => {
    if (isNavigating.current) return;
    isNavigating.current = true;

    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/myschedules');
    }
  };

  // 생명주기 정리
  React.useEffect(() => {
    return () => {
      isNavigating.current = false;
      isLoggingOut.current = false;
    };
  }, []);

  return (
    <header className="global-header">
      <div className="header-left">
        <button className="header-back-btn" onClick={handleBack} disabled={isNavigating.current}>
          ← 이전
        </button>
      </div>

      <div className="header-center">
        <h1 className="header-title">근무 스케줄 시스템</h1>
      </div>

      <div className="header-right">
        <span className="header-user">
          {userName} ({getLevelText(userLevel)})
        </span>
        <button 
          className="header-logout-btn" 
          onClick={handleLogout}
          disabled={isLoggingOut.current}
        >
          {isLoggingOut.current ? '처리중...' : '로그아웃'}
        </button>
      </div>
    </header>
  );
}

export default Header;