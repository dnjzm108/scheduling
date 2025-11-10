// src/component/requestslist/index.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import Header from '../Header';
import './index.css';

function RequestsList() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [userName, setUserName] = useState('');
  const [userLevel, setUserLevel] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);

  // 중복 방지용 ref
  const isFetching = useRef(false);
  const isDeleting = useRef(false);
  const hasInitialized = useRef(false);

  const showToast = useCallback((type, msg) => {
    toast[type](msg, { position: "top-center", autoClose: 3000 });
  }, []);

  // 매장 목록 불러오기 (관리자 이상만)
  const fetchStores = async (token) => {
    try {
      const { data } = await axios.get(`${BASE_URL}/api/stores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStores(data);
    } catch {
      showToast('error', '매장 목록 로드 실패');
    }
  };

  // 건의사항 불러오기
  const fetchSuggestions = async (token, storeId = '') => {
    if (isFetching.current) return;
    isFetching.current = true;
    setLoading(true);

    try {
      const url = `${BASE_URL}/api/requests${storeId ? `?store_id=${storeId}` : ''}`;
      const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setSuggestions(data.map(s => ({
        ...s,
        attachments: s.attachments ? JSON.parse(s.attachments) : []
      })));
    } catch {
      showToast('error', '건의사항 로드 실패');
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  };

  // 초기 데이터 로드 (딱 한 번만!)
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const token = getToken();
    if (!token) {
      showToast('error', '로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
    } catch {
      showToast('error', '세션 만료');
      removeToken();
      return setTimeout(() => navigate('/'), 2000);
    }

    setUserName(decoded.name || '사용자');
    setUserLevel(decoded.level || 0);

    // 병렬로 불러오기
    const loadData = async () => {
      if (decoded.level >= 2) await fetchStores(token);
      await fetchSuggestions(token);
    };

    loadData();
  }, [navigate, showToast]);

  // 매장 변경 시 건의사항만 다시 불러오기
  const handleStoreChange = (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);
    const token = getToken();
    if (token) fetchSuggestions(token, storeId);
  };

  // 삭제 (중복 클릭 방지)
  const handleDelete = async (id) => {
    if (isDeleting.current) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    isDeleting.current = true;
    const token = getToken();

    try {
      await axios.delete(`${BASE_URL}/api/requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuggestions(prev => prev.filter(s => s.id !== id));
      showToast('success', '삭제 완료');
    } catch {
      showToast('error', '삭제 실패');
    } finally {
      isDeleting.current = false;
    }
  };

  const handleLogout = () => {
    removeToken();
    showToast('success', '로그아웃 완료');
    navigate('/');
  };

  const getLevelText = (level) => ['승인대기', '직원', '매장관리자', '총관리자'][level] || '알 수 없음';

  return (
    <>
      <Header title="건의사항" backTo="/AdminDashboard" />
      <div className="suggestion-container">
        <div className="suggestion-bg-overlay" />
        
        <div className="suggestion-card">
          {/* 매장 선택 (관리자 이상) */}
          {userLevel >= 2 && (
            <div className="suggestion-store-selector">
              <select value={selectedStore} onChange={handleStoreChange}>
                <option value="">모든 매장</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* 로딩/빈 상태/리스트 */}
          {loading ? (
            <div className="suggestion-loading">로딩 중...</div>
          ) : suggestions.length === 0 ? (
            <p className="suggestion-no-suggestions">건의사항이 없습니다.</p>
          ) : (
            <ul className="suggestion-list">
              {suggestions.map(s => (
                <li
                  key={s.id}
                  className={`suggestion-item ${expandedId === s.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                >
                  <h3>{s.title}</h3>
                  {expandedId === s.id && (
                    <div className="suggestion-details">
                      <p>{s.body}</p>
                      {s.attachments.map((url, i) => (
                        <img key={i} src={url} alt={`첨부 ${i + 1}`} className="suggestion-attachment" />
                      ))}
                      <p>작성일: {new Date(s.created_at).toLocaleDateString('ko-KR')}</p>
                      {userLevel >= 2 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(s.id);
                          }}
                          className="suggestion-delete-button"
                          disabled={isDeleting.current}
                        >
                          {isDeleting.current ? '삭제 중...' : '삭제'}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <ToastContainer theme="colored" />
      </div>
    </>
  );
}

export default RequestsList;