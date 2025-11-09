// src/component/notices/index.jsx
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
  const [userLevel, setUserLevel] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const errorShown = useRef({});

  const showErrorOnce = useCallback((key, msg) => {
    if (!errorShown.current[key]) {
      errorShown.current[key] = true;
      toast.error(msg);
      setTimeout(() => errorShown.current[key] = false, 3000);
    }
  }, []);

  const fetchNotices = useCallback(async (storeId = '') => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const url = `${BASE_URL}/api/notices${storeId ? `?store_id=${storeId}` : ''}`;
      const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setNotices(data.map(n => ({
        ...n,
        attachments: n.attachments ? JSON.parse(n.attachments) : []
      })));
    } catch (err) {
      showErrorOnce('notices', '공지사항 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [showErrorOnce]);

  const fetchStores = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const { data } = await axios.get(`${BASE_URL}/api/stores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStores(data);
    } catch (err) {
      showErrorOnce('stores', '매장 목록 로드 실패');
    }
  }, [showErrorOnce]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      showErrorOnce('auth', '로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자');
      setUserLevel(decoded.level || 0);

      if (decoded.level >= 2) fetchStores(); // 매장관리자 이상
      fetchNotices();
    } catch (err) {
      showErrorOnce('token', '세션 만료');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
    }
  }, [navigate, fetchNotices, fetchStores, showErrorOnce]);

  const handleStoreChange = (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);
    fetchNotices(storeId);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/api/notices/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotices(prev => prev.filter(n => n.id !== id));
      toast.success('삭제 완료');
    } catch (err) {
      showErrorOnce(`delete-${id}`, '삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃');
    navigate('/');
  };

  const getLevelText = (level) => {
    const levels = ['승인대기', '직원', '매장관리자', '총관리자'];
    return levels[level] || '알 수 없음';
  };

  return (
    <div className="notices-container">
      <header className="notices-header">
        <button
          className="notices-back-button"
          onClick={() => navigate(userLevel >= 2 ? '/AdminDashboard' : '/myschedules')}
        >
          이전
        </button>
        <div className="notices-user-info">
          <span>{userName}님 ({getLevelText(userLevel)})</span>
          <button className="notices-logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="notices-main-content">
        <h1 className="notices-title">공지사항</h1>

        {userLevel >= 2 && (
          <button
            className="notices-create-button"
            onClick={() => navigate('/NoticeCreate')}
          >
            공지사항 작성
          </button>
        )}

        {userLevel >= 2 && (
          <div className="notices-store-selector">
            <select value={selectedStore} onChange={handleStoreChange}>
              <option value="">모든 매장</option>
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
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
                className={`notices-item ${expandedId === notice.id ? 'expanded' : ''}`}
                onClick={() => setExpandedId(expandedId === notice.id ? null : notice.id)}
              >
                <h3>{notice.title}</h3>
                {expandedId === notice.id && (
                  <div className="notices-details">
                    <p>{notice.body}</p>
                    {notice.attachments.map((url, i) => (
                      <img key={i} src={url} alt={`첨부 ${i + 1}`} className="notices-attachment" />
                    ))}
                    <p>
                      작성자: {notice.author_name} |{' '}
                      {new Date(notice.published_at).toLocaleDateString('ko-KR')}
                    </p>
                    {userLevel >= 2 && (
                      <div className="notices-admin-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/notice-edit/${notice.id}`);
                          }}
                        >
                          수정
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notice.id);
                          }}
                          className="notices-delete-button"
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

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default Notices;