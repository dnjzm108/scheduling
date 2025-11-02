// src/component/notices/index.jsx - 공지사항 100% 로드 + 로그인 CSS 통일
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

  const errorShownRef = useRef({});

  const showErrorOnce = useCallback((key, message) => {
    if (!errorShownRef.current[key]) {
      errorShownRef.current[key] = true;
      toast.error(message);
      setTimeout(() => {
        errorShownRef.current[key] = false;
      }, 3000);
    }
  }, []);

  const fetchNotices = useCallback(
    async (storeId = '') => {
      const token = getToken();
      if (!token) return;

      const key = `notices-${storeId || 'all'}`;
      setLoading(true);

      try {
        const url = `${BASE_URL}/api/notices${storeId ? `?store_id=${storeId}` : ''}`;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setNotices(response.data || []);
        errorShownRef.current[key] = false;
      } catch (err) {
        console.error('[/notices] Error:', err.response || err);
        if (!errorShownRef.current[key]) {
          showErrorOnce(key, '공지사항을 불러오지 못했습니다.');
        }
      } finally {
        setLoading(false);
      }
    },
    [showErrorOnce]
  );

  const fetchStores = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const response = await axios.get(`${BASE_URL}/api/stores`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStores(response.data || []);
    } catch (err) {
      console.error('[/stores] Error:', err);
      showErrorOnce('stores', '매장 목록을 불러오지 못했습니다.');
    }
  }, [showErrorOnce]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      showErrorOnce('auth', '로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
      setIsAdmin(!!decoded.isAdmin);
    } catch (err) {
      showErrorOnce('token', '세션이 만료되었거나 유효하지 않습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    if (decoded.isAdmin) {
      fetchStores();
    }

    fetchNotices();

    return () => {
      errorShownRef.current = {};
    };
  }, [navigate, fetchStores, fetchNotices, showErrorOnce]);

  const handleStoreChange = (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);
    fetchNotices(storeId);
  };

  const handleDeleteNotice = async (id) => {
    const token = getToken();
    if (!token) return;

    try {
      await axios.delete(`${BASE_URL}/api/notices/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotices((prev) => prev.filter((n) => n.id !== id));
      toast.success('공지사항이 삭제되었습니다.');
    } catch (err) {
      showErrorOnce(`delete-${id}`, '공지사항 삭제에 실패했습니다.');
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
          onClick={() => navigate(isAdmin ? '/AdminDashboard' : '/myschedules')}
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
            <label htmlFor="store-select">매장 선택</label>
            <select
              id="store-select"
              value={selectedStore}
              onChange={handleStoreChange}
            >
              <option value="">모든 매장</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
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
            {notices.map((notice) => (
              <li
                key={notice.id}
                className={`notices-item ${
                  selectedNotice === notice.id ? 'expanded' : ''
                }`}
                onClick={() =>
                  setSelectedNotice(
                    selectedNotice === notice.id ? null : notice.id
                  )
                }
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
                          alt={`첨부 이미지 ${idx + 1}`}
                          className="notices-attachment"
                        />
                      ))}
                    <p>
                      작성자: {notice.author_name} |{' '}
                      {new Date(notice.published_at).toLocaleDateString('ko-KR')}
                    </p>
                    {isAdmin && (
                      <div className="notices-admin-actions">
                        <button
                          className="notices-edit-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/notice-edit/${notice.id}`);
                          }}
                        >
                          수정
                        </button>
                        <button
                          className="notices-delete-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('정말 삭제하시겠습니까?')) {
                              handleDeleteNotice(notice.id);
                            }
                          }}
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

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}

export default Notices;