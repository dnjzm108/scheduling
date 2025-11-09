// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { setToken } from '../../utils/auth';
import './index.css';

function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ userId: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 한국어 에러 매핑
  const getErrorMessage = (msg) => {
    const map = {
      '존재하지 않는 아이디입니다.': '존재하지 않는 아이디입니다.',
      '비밀번호가 틀립니다.': '비밀번호를 확인해주세요.',
      '관리자 승인 대기 중입니다.': '관리자 승인 후 로그인 가능합니다.',
      '관리자에게 승인을 요청하세요.': '관리자 승인 대기 중입니다.'
    };
    return map[msg] || msg;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!formData.userId.trim() || !formData.password.trim()) {
      toast.error('아이디와 비밀번호를 입력해주세요.');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post(`${BASE_URL}/api/auth/login`, formData, {
        headers: { 'Content-Type': 'application/json' }
      });

      const { token, user } = response.data;
      setToken(token);

      toast.success('로그인 성공!');

      // level 기반 페이지 이동
      setTimeout(() => {
        if (user.level >= 3) {
          navigate('/AdminDashboard');           // 총관리자
        } else if (user.level === 2) {
          navigate('/ScheduleManagement');       // 매장관리자
        } else if (user.level === 1) {
          navigate('/myschedules');              // 직원
        } else {
          navigate('/myschedules');              // level 0도 일단 직원 페이지
        }
      }, 1500);

    } catch (err) {
      const backendMsg = err.response?.data?.message || '로그인 실패';
      const userMsg = getErrorMessage(backendMsg);
      setError(userMsg);
      toast.error(userMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-bg-overlay" />
      
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">KM Company</h1>
          <p className="login-subtitle">로그인하여 시작하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-input-group">
            <label className="login-label">아이디</label>
            <input
              type="text"
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              className="login-input"
              placeholder="아이디를 입력하세요"
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="login-input-group">
            <label className="login-label">비밀번호</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="login-input"
              placeholder="비밀번호를 입력하세요"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`login-button ${loading ? 'login-loading' : ''}`}
          >
            {loading ? (
              <>
                <div className="login-spinner" />
                로그인 중...
              </>
            ) : (
              '로그인하기'
            )}
          </button>
        </form>

        <p className="login-signup-link">
          계정이 없으신가요? <a href="/signup">회원가입하기</a>
        </p>
      </div>

      <ToastContainer
        position="top-center"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  );
}

export default Login;