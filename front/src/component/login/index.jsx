// src/pages/Login.jsx
import React, { useState, useRef } from 'react';
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
  
  // 중복 제출 방지
  const isSubmitting = useRef(false);

  const errorMap = {
    '존재하지 않는 아이디입니다.': '존재하지 않는 아이디입니다.',
    '비밀번호가 틀립니다.': '비밀번호를 확인해주세요.',
    '관리자 승인 대기 중입니다.': '관리자 승인 후 로그인 가능합니다.',
    '관리자에게 승인을 요청하세요.': '관리자 승인 대기 중입니다.'
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 연타 방지
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setError('');

    const { userId, password } = formData;
    if (!userId.trim() || !password.trim()) {
      toast.error('아이디와 비밀번호를 입력해주세요.');
      isSubmitting.current = false;
      return;
    }

    try {
      const { data } = await axios.post(`${BASE_URL}/api/auth/login`, 
        { userId, password },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const { token, user } = data;
      setToken(token);
      toast.success('로그인 성공!');

      // 1.5초 후 이동
      setTimeout(() => {
        const path = user.level >= 3 ? '/AdminDashboard'
                   : user.level === 2 || 1 ? '/myschedules'
                   : '/myschedules';
        navigate(path, { replace: true });
      }, 1500);

    } catch (err) {
      const msg = err.response?.data?.message || '로그인 실패';
      const userMsg = errorMap[msg] || msg;
      setError(userMsg);
      toast.error(userMsg);
    } finally {
      isSubmitting.current = false;
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
              disabled={isSubmitting.current}
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
              disabled={isSubmitting.current}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting.current}
            className={`login-button ${isSubmitting.current ? 'login-loading' : ''}`}
          >
            {isSubmitting.current ? (
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

      <ToastContainer theme="colored" position="top-center" autoClose={3000} />
    </div>
  );
}

export default Login;