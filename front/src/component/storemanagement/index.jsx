// src/component/stores/index.jsx - 데이터 불러오기 실패 1회 + 로그인 테마 통일
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function StoreManage() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(null);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    id: null,
    name: '',
    address: '',
    manager_id: ''
  });
  const [users, setUsers] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  const errorShownRef = useRef({}); // 에러 중복 방지

  const showErrorOnce = (key, message) => {
    if (!errorShownRef.current[key]) {
      errorShownRef.current[key] = true;
      toast.error(message, { autoClose: 3000 });
      setTimeout(() => {
        errorShownRef.current[key] = false;
      }, 3000);
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
      setIsAdmin(decoded.isAdmin || false);
    } catch (err) {
      showErrorOnce('token', '세션이 만료되었습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    if (!decoded.isAdmin) {
      showErrorOnce('permission', '관리자 권한이 필요합니다.');
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [storesResponse, usersResponse] = await Promise.all([
          axios.get(`${BASE_URL}/api/stores`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${BASE_URL}/api/user/admins`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        
        setStores(storesResponse.data || []);
        setUsers(usersResponse.data || []);
      } catch (err) {
        console.log(err);
        
        showErrorOnce('fetch', '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const token = getToken();
    try {
      if (isEditing) {
        await axios.put(`${BASE_URL}/api/stores/${formData.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('매장 수정 완료!', { autoClose: 3000 });
      } else {
        await axios.post(`${BASE_URL}/api/stores`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('매장 생성 완료!', { autoClose: 3000 });
      }
      resetForm();
      const response = await axios.get(`${BASE_URL}/api/stores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStores(response.data || []);
    } catch (err) {
      console.log(err);
      
      showErrorOnce('submit', isEditing ? '매장 수정 실패' : '매장 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (store) => {
    setFormData({
      id: store.id,
      name: store.name,
      address: store.address || '',
      manager_id: store.manager_id || ''
    });
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    setLoading(true);
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/api/stores/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('매장 삭제 완료!', { autoClose: 3000 });
      setStores(stores.filter(store => store.id !== id));
    } catch (err) {
      showErrorOnce('delete', '매장 삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.', { autoClose: 3000 });
    setTimeout(() => navigate('/'), 3000);
  };

  const resetForm = () => {
    setFormData({ id: null, name: '', address: '', manager_id: '' });
    setIsEditing(false);
  };

  return (
    <div className="store-manage-container">
      <div className="store-manage-bg-overlay" />
      
      <div className="store-manage-card">
        <div className="store-manage-header">
          <button className="store-manage-back-button" onClick={() => navigate(-1)}>
            ← 이전
          </button>
          <h1 className="store-manage-title">매장 관리</h1>
          <div className="store-manage-user-info">
            <span className="store-manage-user-name">{userName}님</span>
            <button className="store-manage-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="store-manage-form">
          <div className="store-manage-input-group">
            <label>매장 이름</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="매장 이름 입력"
              required
            />
          </div>

          <div className="store-manage-input-group">
            <label>주소</label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="주소 입력 (선택)"
            />
          </div>

          <div className="store-manage-input-group">
            <label>매니저</label>
            <select name="manager_id" value={formData.manager_id} onChange={handleChange}>
              <option value="">매니저 없음</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          <div className="store-manage-form-buttons">
            <button type="submit" className="store-manage-submit-button" disabled={loading}>
              {loading ? '처리 중...' : isEditing ? '수정' : '생성'}
            </button>
            {isEditing && (
              <button type="button" className="store-manage-cancel-button" onClick={resetForm} disabled={loading}>
                취소
              </button>
            )}
          </div>
        </form>

        <h2 className="store-manage-list-title">매장 목록</h2>
        {loading && stores.length === 0 ? (
          <div className="store-manage-loading">로딩 중...</div>
        ) : stores.length === 0 ? (
          <p className="store-manage-no-stores">등록된 매장이 없습니다.</p>
        ) : (
          <ul className="store-manage-list">
            {stores.map(store => (
              <li key={store.id} className="store-manage-item">
                <div className="store-manage-item-details">
                  <strong>{store.name}</strong>
                  <p>{store.address || '주소 미등록'}</p>
                  <p>매니저: {store.manager_id ? users.find(u => u.id === store.manager_id)?.name || '알 수 없음' : '없음'}</p>
                </div>
                <div className="store-manage-item-actions">
                  <button className="store-manage-edit-button" onClick={() => handleEdit(store)}>
                    수정
                  </button>
                  <button className="store-manage-delete-button" onClick={() => handleDelete(store.id)}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={3000} />
    </div>
  );
}

export default StoreManage;