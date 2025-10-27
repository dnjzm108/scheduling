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
 console.log('들어옴1');

  const fetchStores = async () => {
      setStoresLoading(true);
      try {
        
        const response = await axios.get(`${BASE_URL}/stores`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setStores(response.data || []);
      } catch (err) {
        toast.error('매장 목록 불러오기 실패');
      } finally {
        setStoresLoading(false);
      }
    };


    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
      setIsAdmin(decoded.isAdmin || false);
    if (decoded.isAdmin) {
      fetchStores();
    }
    } catch (err) {
      console.error('Token decode error:', err);
      toast.error('세션 오류가 발생했습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

   
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const selectedFiles = e.target.files;
    // 파일 크기 제한 (예: 5MB per file)
    for (let i = 0; i < selectedFiles.length; i++) {
      if (selectedFiles[i].size > 5 * 1024 * 1024) {
        toast.error('파일 크기는 5MB를 초과할 수 없습니다.');
        return;
      }
    }
    setFiles(selectedFiles);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const token = getToken();
    const formDataToSend = new FormData();
    formDataToSend.append('title', formData.title);
    formDataToSend.append('body', formData.body);
    formDataToSend.append('store_id', formData.store_id);
    formDataToSend.append('visibility', formData.visibility);
    for (let i = 0; i < files.length; i++) {
      formDataToSend.append('attachments', files[i]);
    }

    try {
      const response = await axios.post(`${BASE_URL}/notices`, formDataToSend, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('공지사항 작성 완료!');
      setTimeout(() => navigate('/notices'), 2000);
    } catch (err) {
      console.error('공지사항 작성 오류:', err.response?.data || err.message);
      toast.error(err.response?.data?.message || '공지사항 작성 실패');
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
      <header className="notice-create-header">
        <button
          className="notice-create-back-button"
          onClick={() => navigate('/notices')}
        >
          이전 페이지
        </button>
        <div className="notice-create-user-info">
          <span className="notice-create-user-name">{userName}님</span>
          <button
            className="notice-create-logout-button"
            onClick={handleLogout}
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className="notice-create-main-content">
        <h1 className="notice-create-title">공지사항 작성</h1>
        {storesLoading ? (
          <p className="notice-create-loading">매장 로딩 중...</p>
        ) : (
          <form onSubmit={handleSubmit} className="notice-create-form">
            <div className="notice-create-form-group">
              <label>제목</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="제목 입력"
              />
            </div>
            <div className="notice-create-form-group">
              <label>내용</label>
              <textarea
                name="body"
                value={formData.body}
                onChange={handleChange}
                required
                placeholder="내용 입력"
              />
            </div>
            <div className="notice-create-form-group">
              <label>매장 선택</label>
              <select name="store_id" value={formData.store_id} onChange={handleChange}>
                <option value="">모든 매장</option>
                {stores.map(store => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
            <div className="notice-create-form-group">
              <label>대상 선택</label>
              <div className="notice-create-visibility-options">
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    value="employees"
                    checked={formData.visibility === 'employees'}
                    onChange={handleChange}
                  />
                  직원들에게만
                </label>
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    value="admins"
                    checked={formData.visibility === 'admins'}
                    onChange={handleChange}
                  />
                  관리자한테만
                </label>
                <label>
                  <input
                    type="radio"
                    name="visibility"
                    value="all"
                    checked={formData.visibility === 'all'}
                    onChange={handleChange}
                  />
                  모두에게
                </label>
              </div>
            </div>
            <div className="notice-create-form-group">
              <label>사진 첨부 (여러 개 가능)</label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
            <button
              type="submit"
              className="notice-create-submit-button"
              disabled={loading}
            >
              {loading ? '저장 중...' : '공지사항 저장'}
            </button>
          </form>
        )}
      </main>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default NoticeCreate;