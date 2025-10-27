import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function Requests() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ title: '', body: '' });
  const [files, setFiles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [userInfo, setUserInfo] = useState({ name: '', store_id: '', store_name: '로딩 중...' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    try {
      const decoded = jwtDecode(token);
      setUserInfo(prev => ({ ...prev, name: decoded.name || '사용자님' }));
    } catch (err) {
      console.error('Token decode error:', err);
      toast.error('세션 오류가 발생했습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchUserStore = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/user-store`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('User store response:', response.data); // 디버깅 로그
        setUserInfo(prev => ({
          ...prev,
          store_id: response.data.store_id,
          store_name: response.data.store_name || '매장 정보 없음'
        }));
      } catch (err) {
        console.error('User store fetch error:', err.response?.data || err.message);
        toast.error('매장 정보 불러오기 실패. 기본 매장으로 설정됩니다.');
        setUserInfo(prev => ({ ...prev, store_name: '기본 매장' }));
      }
    };

    const fetchData = async () => {
      try {
        const [requestsRes] = await Promise.all([
          axios.get(`${BASE_URL}/requests`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setRequests(requestsRes.data || []);
      } catch (err) {
        console.error('Requests fetch error:', err.response?.data || err.message);
        toast.error('데이터 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };

    fetchUserStore();
    fetchData();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFiles(e.target.files);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();
    const form = new FormData();
    form.append('title', formData.title);
    form.append('body', formData.body);
    form.append('store_id', userInfo.store_id);
    for (let file of files) {
      form.append('attachments', file);
    }
    try {
      await axios.post(`${BASE_URL}/requests`, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      toast.success('건의사항 제출 완료!');
      setFormData({ title: '', body: '' });
      setFiles([]);
      const response = await axios.get(`${BASE_URL}/requests`, { headers: { Authorization: `Bearer ${token}` } });
      setRequests(response.data || []);
    } catch (err) {
      console.error('Submit error:', err.response?.data || err.message);
      toast.error('건의사항 제출 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="request-container">
      <header className="request-header">
        <button className="request-back-button" onClick={() => navigate(-1)}>
          이전 페이지
        </button>
        <div className="request-user-info">
          <span className="request-user-name">{userInfo.name}님</span>
          <button className="request-logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="request-main-content">
        <h1 className="request-title">건의사항</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>제목</label>
            <input type="text" name="title" value={formData.title} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>내용</label>
            <textarea name="body" value={formData.body} onChange={handleChange} rows="5" />
          </div>
          <div className="form-group">
            <label>매장</label>
            <input type="text" value={userInfo.store_name} readOnly />
          </div>
          <div className="form-group">
            <label>첨부파일</label>
            <input type="file" multiple accept="image/*" onChange={handleFileChange} />
          </div>
          <button type="submit" className="button button-primary">제출</button>
        </form>
        {loading ? (
          <p className="loading">로딩 중...</p>
        ) : (
          <ul className="request-list">
            {requests.map(req => (
              <li key={req.id} className="request-item">
                <h3>{req.title}</h3>
                <p>{req.body}</p>
                {req.attachments && JSON.parse(req.attachments).map((url, idx) => (
                  <img key={idx} src={url} alt="Attachment" style={{ maxWidth: '100%' }} />
                ))}
                <p>상태: {req.status} | {new Date(req.created_at).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default Requests;