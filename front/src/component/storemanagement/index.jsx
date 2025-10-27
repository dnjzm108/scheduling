import React, { useState, useEffect } from 'react';
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
  const [isAdmin, setIsAdmin] = useState(null); // 초기값 null로 설정
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

  useEffect(() => {
    const token = getToken();
    console.log('Token:', token);

    if (!token) {
      toast.error('로그인이 필요합니다.', { autoClose: 3000 });
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
      console.log('Decoded token:', decoded);
      setUserName(decoded.name || '사용자님');
      setIsAdmin(decoded.isAdmin || false);
    } catch (err) {
      console.error('Token decode error:', err);
      toast.error('세션 오류가 발생했습니다.', { autoClose: 3000 });
      removeToken();
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    if (decoded.isAdmin === false) {
      toast.error('관리자 권한이 필요합니다.', { autoClose: 3000 });
      setTimeout(() => navigate('/'), 3000);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [storesResponse, usersResponse] = await Promise.all([
          axios.get(`${BASE_URL}/stores`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${BASE_URL}/users`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        console.log('Stores response:', storesResponse.data);
        console.log('Users response:', usersResponse.data);
        setStores(storesResponse.data || []);
        setUsers(usersResponse.data || []);
      } catch (err) {
        console.error('Fetch error:', err.response?.data || err.message);
        toast.error(`데이터 불러오기 실패: ${err.response?.data?.message || err.message}`, { autoClose: 3000 });
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
        await axios.put(`${BASE_URL}/stores/${formData.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('매장 수정 완료!', { autoClose: 3000 });
      } else {
        await axios.post(`${BASE_URL}/stores`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('매장 생성 완료!', { autoClose: 3000 });
      }
      setFormData({ id: null, name: '', address: '', manager_id: '' });
      setIsEditing(false);
      const response = await axios.get(`${BASE_URL}/stores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStores(response.data || []);
    } catch (err) {
      console.error('Submit error:', err.response?.data || err.message);
      toast.error(`${isEditing ? '매장 수정 실패' : '매장 생성 실패'}: ${err.response?.data?.message || err.message}`, { autoClose: 3000 });
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
      await axios.delete(`${BASE_URL}/stores/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('매장 삭제 완료!', { autoClose: 3000 });
      setStores(stores.filter(store => store.id !== id));
    } catch (err) {
      console.error('Delete error:', err.response?.data || err.message);
      toast.error(`매장 삭제 실패: ${err.response?.data?.message || err.message}`, { autoClose: 3000 });
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
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
      {loading && !stores.length ? (
        <div className="store-manage-loading">로딩 중...</div>
      ) : (
        <>
          <header className="store-manage-header">
            <button
              className="store-manage-back-button"
              onClick={() => navigate(-1)}
            >
              이전 페이지
            </button>
            <div className="store-manage-user-info">
              <span className="store-manage-user-name">{userName}님</span>
              <button
                className="store-manage-logout-button"
                onClick={handleLogout}
              >
                로그아웃
              </button>
            </div>
          </header>
          <main className="store-manage-main-content">
            <h1 className="store-manage-title">매장 관리</h1>
            <form onSubmit={handleSubmit} className="store-manage-form">
              <div className="store-manage-form-group">
                <label>매장 이름</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="매장 이름 입력"
                />
              </div>
              <div className="store-manage-form-group">
                <label>주소</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="주소 입력 (선택)"
                />
              </div>
              <div className="store-manage-form-group">
                <label>매니저</label>
                <select
                  name="manager_id"
                  value={formData.manager_id}
                  onChange={handleChange}
                >
                  <option value="">매니저 없음</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
              <div className="store-manage-form-buttons">
                <button
                  type="submit"
                  className="store-manage-submit-button"
                  disabled={loading}
                >
                  {loading ? '처리 중...' : isEditing ? '매장 수정' : '매장 생성'}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    className="store-manage-cancel-button"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    취소
                  </button>
                )}
              </div>
            </form>
            <h2 className="store-manage-list-title">매장 목록</h2>
            {stores.length === 0 ? (
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
                      <button
                        className="store-manage-edit-button"
                        onClick={() => handleEdit(store)}
                      >
                        수정
                      </button>
                      <button
                        className="store-manage-delete-button"
                        onClick={() => handleDelete(store.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </main>
        </>
      )}
    </div>
  );
}

export default StoreManage;