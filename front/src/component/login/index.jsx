import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    userId: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError('');

  if (!formData.userId || !formData.password) {
    setError('아이디와 비밀번호를 입력해주세요.');
    toast.error('아이디와 비밀번호를 입력해주세요.');
    return;
  }

  try {
    const response = await axios.post(`${BASE_URL}/login`, {
      userId: formData.userId,
      password: formData.password
    });
    console.log('Login response:', response.data);
    const { token, isAdmin } = response.data;
    
    // 토큰 저장
    localStorage.setItem('token', token);
    console.log('Token saved:', localStorage.getItem('token'));

    toast.success('로그인 성공!');
    setTimeout(() => {
      // 관리자는 /AdminDashboard, 일반 사용자는 /myschedules로 리다이렉트
      navigate(isAdmin ? '/AdminDashboard' : '/myschedules');
    }, 1000);
  } catch (err) {
    console.error('Login error:', err);
    const errorMessage = err.response?.data?.message || '로그인에 실패했습니다.';
    setError(errorMessage);
    toast.error(errorMessage);
  }
};

  const handleSignUp = () => {
    navigate('/signup');
  };

  return (
    <div className="login-container">
      <h1 className="title">로그인</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="userId">아이디</label>
          <input
            type="text"
            id="userId"
            name="userId"
            value={formData.userId}
            onChange={handleChange}
            placeholder="아이디를 입력하세요"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="비밀번호를 입력하세요"
          />
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="login-button">로그인</button>
        <button type="button" className="signup-button" onClick={handleSignUp}>
          회원가입
        </button>
      </form>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default Login;