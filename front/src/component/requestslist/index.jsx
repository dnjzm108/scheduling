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
  const errorShown = useRef({});

  const showErrorOnce = useCallback((key, msg) => {
    if (!errorShown.current[key]) {
      errorShown.current[key] = true;
      toast.error(msg);
      setTimeout(() => errorShown.current[key] = false, 3000);
    }
  }, []);

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

  const fetchSuggestions = useCallback(async (storeId = '') => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const url = `${BASE_URL}/api/requests${storeId ? `?store_id=${storeId}` : ''}`;
      const { data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setSuggestions(data.map(s => ({
        ...s,
        attachments: s.attachments ? JSON.parse(s.attachments) : []
      })));
    } catch (err) {
      showErrorOnce('suggestions', '건의사항 로드 실패');
    } finally {
      setLoading(false);
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
      fetchSuggestions();
    } catch (err) {
      showErrorOnce('token', '세션 만료');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
    }
  }, [navigate, fetchStores, fetchSuggestions, showErrorOnce]);

  const handleStoreChange = (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);
    fetchSuggestions(storeId);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/api/requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuggestions(prev => prev.filter(s => s.id !== id));
      toast.success('삭제 완료');
    } catch (err) {
      showErrorOnce('delete', '삭제 실패');
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
    <>
    <Header title="건의사항" backTo="/AdminDashboard"/>
    <div className="suggestion-container">
      <div className="suggestion-bg-overlay" />
      
      <div className="suggestion-card">
        {/* 매장관리자 이상만 매장 필터 표시 */}
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
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
    </>
  );
}

export default RequestsList;