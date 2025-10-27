import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function Suggestions() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [userName, setUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);

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

    const fetchSuggestions = async (storeId = '') => {
      try {
        const url = `${BASE_URL}/requests${storeId ? `?store_id=${storeId}` : ''}`;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuggestions(response.data || []);
      } catch (err) {
        toast.error('건의사항 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };

    if (isAdmin) {
      fetchStores();
    }
    fetchSuggestions();
  }, [navigate]);

  const handleStoreChange = (e) => {
    setSelectedStore(e.target.value);
    fetchSuggestions(e.target.value);
  };

  const handleDeleteSuggestion = async (id) => {
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/requests/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuggestions(suggestions.filter(s => s.id !== id));
      toast.success('건의사항 삭제 완료');
    } catch (err) {
      toast.error('건의사항 삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    navigate('/');
  };

  return (
    <div className="suggestion-container">
      <header className="suggestion-header">
        <button className="suggestion-back-button" onClick={() => navigate(-1)}>
          이전 페이지
        </button>
        <div className="suggestion-user-info">
          <span className="suggestion-user-name">{userName}님</span>
          <button className="suggestion-logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="suggestion-main-content">
        <h1 className="suggestion-title">건의사항 목록</h1>
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
          <p className="suggestion-loading">로딩 중...</p>
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
                      <img key={idx} src={url} alt="Attachment" className="suggestion-attachment" />
                    ))}
                    <p>작성일: {new Date(suggestion.created_at).toLocaleDateString()}</p>
                    {isAdmin && (
                      <button
                        className="suggestion-delete-button"
                        onClick={() => handleDeleteSuggestion(suggestion.id)}
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
      </main>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default Suggestions;