// src/components/Header/index.jsx
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getToken, removeToken } from '../../utils/auth';
import { jwtDecode } from 'jwt-decode';
import './index.css';

function Header({ title, backTo, showBack = true }) {
  const navigate = useNavigate();
  const isNavigating = useRef(false);
  const isLoggingOut = useRef(false);

const AUTO_LOGIN_KEY = 'auto_login';

  const token = getToken();
  let userName = '사용자님';
  let userLevel = 0;

  if (token) {
    try {
      const decoded = jwtDecode(token);
      userName = decoded.name || '사용자님';
      userLevel = decoded.level || 0;
    } catch (err) { }
  }

  const handleLogout = () => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    localStorage.removeItem(AUTO_LOGIN_KEY);
    
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

    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <header className="global-header">
      <div className="header-left">
        {showBack && (
          <button 
            className="header-back-btn" 
            onClick={handleBack}
            disabled={isNavigating.current}
          >
            ← {backTo ? '홈' : '이전'}
          </button>
        )}
      </div>

      <div className="header-center">
        <h1 className="header-title">{title || ''}</h1>
      </div>

      <div className="header-right">
        <span className="header-user">
          {userName}님 
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