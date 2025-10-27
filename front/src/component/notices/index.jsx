import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function Notices() {
  const navigate = useNavigate();
  const [notices, setNotices] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);

  const fetchNotices = async (storeId = '') => {
    const token = getToken();
    try {
      const url = `${BASE_URL}/notices${storeId ? `?store_id=${storeId}` : ''}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotices(response.data || []);
    } catch (err) {
      toast.error('공지사항 불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
      setIsAdmin(decoded.isAdmin || false);
    } catch (err) {
      console.error('Token decode error:', err);
      toast.error('세션 오류가 발생했습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchStores = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/stores`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStores(response.data || []);
      } catch (err) {
        toast.error('매장 목록 불러오기 실패');
      }
    };

    if (isAdmin) {
      fetchStores();
    }
    fetchNotices();
  }, [navigate, isAdmin]);

  const handleStoreChange = (e) => {
    setSelectedStore(e.target.value);
    fetchNotices(e.target.value);
  };

  const handleDeleteNotice = async (id) => {
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/notices/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotices(notices.filter(n => n.id !== id));
      toast.success('공지사항 삭제 완료');
    } catch (err) {
      toast.error('공지사항 삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="notices-container">
      <header className="notices-header">
        <button
          className="notices-back-button"
          onClick={() => navigate(isAdmin ? '/admin' : '/myschedules')}
        >
          이전 페이지
        </button>
        <div className="notices-user-info">
          <span className="notices-user-name">{userName}님</span>
          <button className="notices-logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="notices-main-content">
        <h1 className="notices-title">공지사항</h1>
        {isAdmin && (
          <button
            className="notices-create-button"
            onClick={() => navigate('/NoticeCreate')}
          >
            공지사항 작성
          </button>
        )}
        {isAdmin && (
          <div className="notices-store-selector">
            <label>매장 선택</label>
            <select value={selectedStore} onChange={handleStoreChange}>
              <option value="">모든 매장</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </div>
        )}
        {loading ? (
          <p className="notices-loading">로딩 중...</p>
        ) : notices.length === 0 ? (
          <p className="notices-no-notices">공지사항이 없습니다.</p>
        ) : (
          <ul className="notices-list">
            {notices.map(notice => (
              <li
                key={notice.id}
                className={`notices-item ${selectedNotice === notice.id ? 'expanded' : ''}`}
                onClick={() => setSelectedNotice(selectedNotice === notice.id ? null : notice.id)}
              >
                <h3>{notice.title}</h3>
                {selectedNotice === notice.id && (
                  <div className="notices-details">
                    <p>{notice.body}</p>
                    {notice.attachments &&
                      JSON.parse(notice.attachments).map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt="Attachment"
                          className="notices-attachment"
                        />
                      ))}
                    <p>
                      작성자: {notice.author_name} |{' '}
                      {new Date(notice.published_at).toLocaleDateString()}
                    </p>
                    {isAdmin && (
                      <div className="notices-admin-actions">
                        <button
                          className="notices-edit-button"
                          onClick={() => navigate(`/notice-edit/${notice.id}`)}
                        >
                          수정
                        </button>
                        <button
                          className="notices-delete-button"
                          onClick={() => handleDeleteNotice(notice.id)}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default Notices;