// src/component/stores/index.jsx
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
  const [userLevel, setUserLevel] = useState(0);
  const [stores, setStores] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ id: null, name: '', address: '', manager_id: '' });

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() =>navigate('/'), 2000);
    }

    try {
      const decoded = jwtDecode(token);
      setUserName(decoded.name || '관리자');
      setUserLevel(decoded.level || 0);

      if (decoded.level < 3) {
        toast.error('총관리자 권한 필요');
        return setTimeout(() => navigate('/'), 2000);
      }

      const fetchData = async () => {
        setLoading(true);
        try {
          const [storesRes, adminsRes] = await Promise.all([
            axios.get(`${BASE_URL}/api/stores`, { headers: { Authorization: `Bearer ${token}` } }),
            axios.get(`${BASE_URL}/api/user/admins`, { headers: { Authorization: `Bearer ${token}` } })
          ]);
          setStores(storesRes.data || []);
          setAdmins(adminsRes.data || []);
        } catch (err) {
          toast.error('데이터 로드 실패');
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    } catch (err) {
      toast.error('세션 오류');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('매장명 필수');

    setLoading(true);
    const token = getToken();
    try {
      if (form.id) {
        await axios.put(`${BASE_URL}/api/stores/${form.id}`, form, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('수정 완료');
      } else {
        await axios.post(`${BASE_URL}/api/stores`, form, {
          headers: { Authorization: `Bearer ${token}` }
        });
        toast.success('생성 완료');
      }
      resetForm();
      const { data } = await axios.get(`${BASE_URL}/api/stores`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStores(data);
    } catch (err) {
      toast.error(err.response?.data?.message || '처리 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (store) => {
    setForm({
      id: store.id,
      name: store.name,
      address: store.address || '',
      manager_id: store.manager_id || ''
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    setLoading(true);
    try {
      await axios.delete(`${BASE_URL}/api/stores/${id}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      toast.success('삭제 완료');
      setStores(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      toast.error('삭제 실패');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ id: null, name: '', address: '', manager_id: '' });
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃');
    navigate('/');
  };

  return (
    <div className="store-manage-container">
      <div className="store-manage-bg-overlay" />
      
      <div className="store-manage-card">
        <div className="store-manage-header">
          <button className="store-manage-back-button" onClick={() => navigate(-1)}>
            이전
          </button>
          <h1 className="store-manage-title">매장 관리</h1>
          <div className="store-manage-user-info">
            <span>{userName}님 (총관리자)</span>
            <button className="store-manage-logout-button" onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="store-manage-form">
          <input
            type="text"
            placeholder="매장 이름"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            required
          />
          <input
            type="text"
            placeholder="주소 (선택)"
            value={form.address}
            onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
          />
          <select
            value={form.manager_id}
            onChange={e => setForm(prev => ({ ...prev, manager_id: e.target.value || null }))}
          >
            <option value="">매니저 없음</option>
            {admins.map(admin => (
              <option key={admin.id} value={admin.id}>{admin.name}</option>
            ))}
          </select>

          <div className="store-manage-form-buttons">
            <button type="submit" disabled={loading}>
              {loading ? '처리 중...' : form.id ? '수정' : '생성'}
            </button>
            {form.id && (
              <button type="button" onClick={resetForm} disabled={loading}>
                취소
              </button>
            )}
          </div>
        </form>

        <h2 className="store-manage-list-title">매장 목록</h2>
        {loading ? (
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
                  <p>매니저: {store.manager_id ? admins.find(a => a.id === store.manager_id)?.name || '없음' : '없음'}</p>
                </div>
                <div className="store-manage-item-actions">
                  <button onClick={() => handleEdit(store)}>수정</button>
                  <button onClick={() => handleDelete(store.id)} className="store-manage-delete-button">
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default StoreManage;