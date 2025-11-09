// src/component/notices/NoticeCreate.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function NoticeCreate() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [userLevel, setUserLevel] = useState(0);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    store_id: '',
    visibility: 'all'
  });
  const [files, setFiles] = useState([]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자');
      setUserLevel(decoded.level || 0);

      // 매장관리자 이상이면 매장 목록 로드
      if (decoded.level >= 2) {
        axios.get(`${BASE_URL}/api/stores`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(res => setStores(res.data || []))
          .catch(() => toast.error('매장 로드 실패'));
      }
    } catch (err) {
      toast.error('세션 오류');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files);
    const valid = selected.filter(f => f.size <= 5 * 1024 * 1024);
    if (valid.length < selected.length) {
      toast.warn('5MB 초과 파일은 제외됨');
    }
    setFiles(valid);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title?.trim() || !formData.body?.trim()) {
      return toast.error('제목과 내용을 입력하세요');
    }

    setLoading(true);
    const token = getToken();
    const data = new FormData();
    data.append('title', formData.title);
    data.append('body', formData.body);
    data.append('store_id', formData.store_id || '');
    data.append('visibility', formData.visibility);
    files.forEach(file => data.append('attachments', file));

    try {
      await axios.post(`${BASE_URL}/api/notices`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('공지사항 작성 완료!');
      setTimeout(() => navigate('/notices'), 2000);
    } catch (err) {
      toast.error(err.response?.data?.message || '작성 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃');
    navigate('/');
  };

  return (
    <div className="notice-create-container">
      <div className="notice-create-bg-overlay" />
      
      <div className="notice-create-card">
        <div className="notice-create-header">
          <button className="notice-create-back-button" onClick={() => navigate('/notices')}>
            이전
          </button>
          <h1 className="notice-create-title">공지사항 작성</h1>
          <div className="notice-create-user-info">
            <span>{userName}님 ({userLevel >= 3 ? '총관리자' : userLevel === 2 ? '매장관리자' : '직원'})</span>
            <button className="notice-create-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="notice-create-form">
          <div className="notice-create-input-group">
            <label>제목</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="제목 입력"
              required
            />
          </div>

          <div className="notice-create-input-group">
            <label>내용</label>
            <textarea
              name="body"
              value={formData.body}
              onChange={handleChange}
              placeholder="내용 입력"
              required
              rows="10"
            />
          </div>

          {/* 매장관리자 이상만 매장 선택 가능 */}
          {userLevel >= 2 && (
            <div className="notice-create-input-group">
              <label>대상 매장</label>
              <select name="store_id" value={formData.store_id} onChange={handleChange}>
                <option value="">전체 매장</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="notice-create-input-group">
            <label>공개 범위</label>
            <div className="notice-create-radio-group">
              <label><input type="radio" name="visibility" value="all" checked={formData.visibility === 'all'} onChange={handleChange} /> 전체</label>
              <label><input type="radio" name="visibility" value="employees" checked={formData.visibility === 'employees'} onChange={handleChange} /> 직원만</label>
              <label><input type="radio" name="visibility" value="admins" checked={formData.visibility === 'admins'} onChange={handleChange} /> 관리자만</label>
            </div>
          </div>

          <div className="notice-create-input-group">
            <label>사진 첨부 (최대 3개, 5MB 이하)</label>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          <button type="submit" disabled={loading} className="notice-create-submit-button">
            {loading ? '저장 중...' : '작성 완료'}
          </button>
        </form>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default NoticeCreate;