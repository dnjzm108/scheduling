// src/component/notices/NoticeCreate.jsx - 공지사항 작성 100% OK + 로그인 CSS 통일
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css'; // 별도 CSS

function NoticeCreate() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    store_id: '',
    visibility: 'all'
  });
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
      setIsAdmin(!!decoded.isAdmin);
    } catch (err) {
      toast.error('세션 오류');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    if (decoded.isAdmin) {
      const fetchStores = async () => {
        setStoresLoading(true);
        try {
          const response = await axios.get(`${BASE_URL}/api/stores`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setStores(response.data || []);
        } catch (err) {
          toast.error('매장 목록 불러오기 실패');
        } finally {
          setStoresLoading(false);
        }
      };
      fetchStores();
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const validFiles = selectedFiles.filter(file => file.size <= 5 * 1024 * 1024);
    if (validFiles.length !== selectedFiles.length) {
      toast.error('5MB 초과 파일은 제외됩니다.');
    }
    setFiles(validFiles);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) {
      toast.error('제목과 내용을 입력하세요.');
      return;
    }
    setLoading(true);
    const token = getToken();
    const formDataToSend = new FormData();
    formDataToSend.append('title', formData.title);
    formDataToSend.append('body', formData.body);
    formDataToSend.append('store_id', formData.store_id || '');
    formDataToSend.append('visibility', formData.visibility);
    files.forEach(file => formDataToSend.append('attachments', file));

    try {
      await axios.post(`${BASE_URL}/api/notices`, formDataToSend, {
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
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="notice-create-container">
      <div className="notice-create-bg-overlay" />
      
      <div className="notice-create-card">
        <div className="notice-create-header">
          <button className="notice-create-back-button" onClick={() => navigate('/notices')}>
            ← 이전
          </button>
          <h1 className="notice-create-title">공지사항 작성</h1>
          <div className="notice-create-user-info">
            <span className="notice-create-user-name">{userName}님</span>
            <button className="notice-create-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        {storesLoading ? (
          <div className="notice-create-loading">매장 로딩 중...</div>
        ) : (
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
              />
            </div>

            {isAdmin && (
              <div className="notice-create-input-group">
                <label>매장</label>
                <select name="store_id" value={formData.store_id} onChange={handleChange}>
                  <option value="">모든 매장</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="notice-create-input-group">
              <label>공개 범위</label>
              <div className="notice-create-radio-group">
                <label>
                  <input type="radio" name="visibility" value="all" checked={formData.visibility === 'all'} onChange={handleChange} />
                  전체
                </label>
                <label>
                  <input type="radio" name="visibility" value="employees" checked={formData.visibility === 'employees'} onChange={handleChange} />
                  직원만
                </label>
                <label>
                  <input type="radio" name="visibility" value="admins" checked={formData.visibility === 'admins'} onChange={handleChange} />
                  관리자만
                </label>
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

            <button type="submit" className="notice-create-submit-button" disabled={loading}>
              {loading ? '저장 중...' : '작성 완료'}
            </button>
          </form>
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default NoticeCreate;