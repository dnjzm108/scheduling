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

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (!formData.userId || !formData.password) {
      setError('아이디와 비밀번호를 입력하세요.');
      toast.error('아이디와 비밀번호를 입력하세요.');
      setLoading(false);
      return;
    }
    try {
      const response = await axios.post(`${BASE_URL}/login`, formData);
      setToken(response.data.token);
      toast.success('로그인 성공!');
      console.log(response.data);
      
      setTimeout(() => navigate(response.data.isAdmin ? '/AdminDashboard' : '/myschedules'), 1000);
    } catch (err) {
      const message = err.response?.data?.message || '로그인 실패';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
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
            placeholder="아이디 입력"
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
            placeholder="비밀번호 입력"
          />
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="button button-primary" disabled={loading}>
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>
      <p className="signup-link">
        계정이 없으신가요? <a href="/signup">회원가입</a>
      </p>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default Login;