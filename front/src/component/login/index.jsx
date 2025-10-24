import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

function Login() {
      const navigate = useNavigate();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log({ id, password });
    alert('로그인 시도! (콘솔 확인)');
     navigate('/myschedules');
  };

   const handleScheduleClick = () => {
    navigate('/join'); // 스케줄 신청 페이지로 이동
  };

  return (
    <div className="login-container">
      <h1 className="title">로그인</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="id">아이디</label>
          <input
            type="id"
            id="id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            placeholder="아이디을 입력하세요"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="비밀번호를 입력하세요"
          />
        </div>
        <button type="submit" className="submit-button">로그인</button>
        <p>

        </p>
        <button className="submit-button" onClick={handleScheduleClick}>회원가입</button>

      </form>
    </div>
  );
}

export default Login;