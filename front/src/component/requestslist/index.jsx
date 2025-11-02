// src/component/requestslist/index.jsx - ESLint 에러 해결 + 기능 OK
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function RequestsList() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [userName, setUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);

  const errorShownRef = useRef({});

  const showErrorOnce = (key, message) => {
    if (!errorShownRef.current[key]) {
      errorShownRef.current[key] = true;
      toast.error(message);
      setTimeout(() => {
        errorShownRef.current[key] = false;
      }, 3000);
    }
  };

  const fetchStores = async (token) => {
    try {
      const response = await axios.get(`${BASE_URL}/api/stores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStores(response.data || []);
    } catch (err) {
      showErrorOnce('stores', '매장 목록 불러오기 실패');
    }
  };

  const fetchSuggestions = async (token, storeId = '') => { // 함수 정의 추가
    setLoading(true);
    try {
      const url = `${BASE_URL}/api/requests${storeId ? `?store_id=${storeId}` : ''}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuggestions(response.data || []);
    } catch (err) {
      showErrorOnce('fetch', '건의사항을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token) {
      showErrorOnce('auth', '로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
      setUserName(decoded.name || '사용자님');
      setIsAdmin(!!decoded.isAdmin);
    } catch (err) {
      showErrorOnce('token', '세션이 만료되었습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    if (isAdmin) { // isAdmin 사용
      fetchStores(token);
    }
    fetchSuggestions(token); // 함수 호출

  }, [navigate, isAdmin]); // 의존성 추가

  const handleStoreChange = (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);
    const token = getToken();
    fetchSuggestions(token, storeId);
  };

  const handleDeleteSuggestion = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/api/requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuggestions(prev => prev.filter(s => s.id !== id));
      toast.success('건의사항 삭제 완료');
    } catch (err) {
      showErrorOnce('delete', '건의사항 삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="suggestion-container">
      <div className="suggestion-bg-overlay" />
      
      <div className="suggestion-card">
        <div className="suggestion-header">
          <button className="suggestion-back-button" onClick={() => navigate(-1)}>
            ← 이전
          </button>
          <h1 className="suggestion-title">건의사항</h1>
          <div className="suggestion-user-info">
            <span className="suggestion-user-name">{userName}님</span>
            <button className="suggestion-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="suggestion-store-selector">
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
          <div className="suggestion-loading">로딩 중...</div>
        ) : suggestions.length === 0 ? (
          <p className="suggestion-no-suggestions">건의사항이 없습니다.</p>
        ) : (
          <ul className="suggestion-list">
            {suggestions.map(suggestion => (
              <li
                key={suggestion.id}
                className={`suggestion-item ${selectedSuggestion === suggestion.id ? 'expanded' : ''}`}
                onClick={() => setSelectedSuggestion(selectedSuggestion === suggestion.id ? null : suggestion.id)}
              >
                <h3>{suggestion.title}</h3>
                {selectedSuggestion === suggestion.id && (
                  <div className="suggestion-details">
                    <p>{suggestion.body}</p>
                    {suggestion.attachments && JSON.parse(suggestion.attachments).map((url, idx) => (
                      <img key={idx} src={url} alt="첨부 이미지" className="suggestion-attachment" />
                    ))}
                    <p>작성일: {new Date(suggestion.created_at).toLocaleDateString('ko-KR')}</p>
                    {isAdmin && (
                      <button
                        className="suggestion-delete-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSuggestion(suggestion.id);
                        }}
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

      <ToastContainer position="top-center" theme="colored" autoClose={3000} />
    </div>
  );
}

export default RequestsList;