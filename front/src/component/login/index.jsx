import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { setToken, getToken } from '../../utils/auth';
import './index.css';
import { jwtDecode } from 'jwt-decode';

const AUTO_LOGIN_KEY = 'auto_login';

function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ userId: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const isSubmitting = useRef(false);

  /** 🔹 자동로그인 체크 */
  useEffect(() => {
    const autoLogin = JSON.parse(localStorage.getItem(AUTO_LOGIN_KEY));
    if (!autoLogin) return;

    console.log(autoLogin);

    const token2 = getToken();

    let level = 0;
    if (typeof token2 == 'string') {
      level = jwtDecode(token2).level;
    }



    const { token, expireAt } = autoLogin;
    if (Date.now() < expireAt) {
      setToken(token);

      let path = level >= 3 ? '/AdminDashboard' : '/myschedules';
      navigate(path, { replace: true });
    } else {
      localStorage.removeItem(AUTO_LOGIN_KEY);
    }
  }, [navigate]);

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
      const { data } = await axios.post(
        `${BASE_URL}/api/auth/login`,
        { userId, password, rememberMe },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const { token, user } = data;
      setToken(token);

      /** 🔹 자동로그인 저장 */
      if (rememberMe) {
        localStorage.setItem(
          AUTO_LOGIN_KEY,
          JSON.stringify({
            token,
            expireAt: Date.now() + 1000 * 60 * 60 * 24 * 30 // 30일
          })
        );
      }

      toast.success('로그인 성공!');

      setTimeout(() => {
        const path =
          user.level >= 3 ? '/AdminDashboard' : '/myschedules';
        navigate(path, { replace: true });
      }, 1000);

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
            <label>아이디</label>
            <input
              name="userId"
              value={formData.userId}
              onChange={handleChange}
              disabled={isSubmitting.current}
              autoComplete="username"
            />
          </div>

          <div className="login-input-group">
            <label>비밀번호</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              disabled={isSubmitting.current}
              autoComplete="current-password"
            />
          </div>

          {/* 🔹 자동로그인 체크박스 */}
          <div className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>자동 로그인(30일)</span>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button disabled={isSubmitting.current}>
            로그인
          </button>
        </form>

        <p className="login-signup-link">
          계정이 없으신가요? <a href="/signup">회원가입</a>
        </p>
      </div>

      <ToastContainer theme="colored" position="top-center" />
    </div>
  );
}

export default Login;
