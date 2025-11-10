// src/component/notices/index.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken, removeToken } from '../../utils/auth';
import { jwtDecode } from 'jwt-decode';
import './index.css';

function Notices() {
  const navigate = useNavigate();
  const isProcessing = useRef(false);
  const hasLoaded = useRef(false); // 첫 로드 1회만

  const [notices, setNotices] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userLevel, setUserLevel] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  // 첫 로드 1회만 실행
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자');
      setUserLevel(decoded.level || 0);
    } catch (err) {
      toast.error('세션 만료');
      removeToken();
      return setTimeout(() => navigate('/'), 2000);
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const requests = [
          api.get('/api/notices')
        ];

        if (decoded.level >= 2) {
          requests.push(api.get('/api/stores'));
        }

        const [noticesRes, storesRes] = await Promise.all(requests);

        setNotices((noticesRes.data || []).map(n => ({
          ...n,
          attachments: n.attachments ? JSON.parse(n.attachments) : []
        })));

        if (storesRes) {
          setStores(storesRes.data || []);
        }
      } catch (err) {
        if (!axios.isCancel(err)) {
          toast.error('데이터 로드 실패');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  // 매장 변경 시 공지사항만 재요청
  const handleStoreChange = async (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);

    try {
      // const url = `${BASE_URL}/api/notices${storeId ? `?store_id=${storeId}` : ''}`;
      const { data } = await api.get(`/api/notices${storeId ? `?store_id=${storeId}` : ''}`);
      setNotices((data || []).map(n => ({
        ...n,
        attachments: n.attachments ? JSON.parse(n.attachments) : []
      })));
    } catch (err) {
      if (!axios.isCancel(err)) toast.error('공지사항 로드 실패');
    }
  };

  // 삭제 (중복 방지)
  const handleDelete = async (id) => {
    if (isProcessing.current || !window.confirm('정말 삭제하시겠습니까?')) return;
    isProcessing.current = true;

    try {
      await api.delete(`/api/notices/${id}`);
      setNotices(prev => prev.filter(n => n.id !== id));
      toast.success('삭제 완료');
    } catch (err) {
      if (!axios.isCancel(err)) toast.error('삭제 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const getLevelText = (level) => {
    const levels = ['승인대기', '직원', '매장관리자', '총관리자'];
    return levels[level] || '알 수 없음';
  };

  return (
    <>
      <Header title="공지사항" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="notices-container">
          <main className="notices-main-content">

            {/* 작성 버튼 */}
            {userLevel >= 2 && (
              <button
                className="notices-create-button"
                onClick={() => navigate('/NoticeCreate')}
              >
                공지사항 작성
              </button>
            )}

            {/* 매장 선택 */}
            {userLevel >= 2 && stores.length > 0 && (
              <div className="notices-store-selector">
                <select value={selectedStore} onChange={handleStoreChange}>
                  <option value="">모든 매장</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 로딩 */}
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
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </>
  );
}

export default Notices;