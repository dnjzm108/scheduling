// src/component/stores/index.jsx
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

function StoreManage() {
  const navigate = useNavigate();
  const isProcessing = useRef(false);
  const hasLoaded = useRef(false);

  const [userLevel, setUserLevel] = useState(0);
  const [stores, setStores] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ id: null, name: '', address: '', manager_id: '' });

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
      if (decoded.level < 3) {
        toast.error('총관리자 권한 필요');
        return setTimeout(() => navigate('/'), 2000);
      }
      setUserLevel(decoded.level);
    } catch (err) {
      toast.error('세션 오류');
      removeToken();
      return setTimeout(() => navigate('/'), 2000);
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [storesRes, adminsRes] = await Promise.all([
          api.get('/api/stores'),
          api.get('/api/user/admins')
        ]);
        setStores(storesRes.data || []);
        setAdmins(adminsRes.data || []);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isProcessing.current || !form.name.trim()) {
      if (!form.name.trim()) toast.error('매장명 필수');
      return;
    }
    isProcessing.current = true;

    try {
      if (form.id) {
        await api.put(`/api/stores/${form.id}`, form);
        toast.success('수정 완료');
      } else {
        await api.post('/api/stores', form);
        toast.success('생성 완료');
      }

      const { data } = await api.get('/api/stores');
      setStores(data);
      setForm({ id: null, name: '', address: '', manager_id: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || '처리 실패');
    } finally {
      isProcessing.current = false;
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
    if (isProcessing.current || !window.confirm('정말 삭제하시겠습니까?')) return;
    isProcessing.current = true;

    try {
      await api.delete(`/api/stores/${id}`);
      toast.success('삭제 완료');
      setStores(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      toast.error('삭제 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const resetForm = () => {
    setForm({ id: null, name: '', address: '', manager_id: '' });
  };

  return (
    <>
      <Header title="매장관리" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="store-manage-container">
          <div className="store-manage-bg-overlay" />
          <div className="store-manage-card">

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
                value={form.manager_id || ''}
                onChange={e => setForm(prev => ({ ...prev, manager_id: e.target.value || null }))}
              >
                <option value="">매니저 없음</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.id}>{admin.name}</option>
                ))}
              </select>

              <div className="store-manage-form-buttons">
                <button type="submit"  className="store-manage-submit-button" disabled={isProcessing.current || loading}>
                  {isProcessing.current ? '처리 중...' : form.id ? '수정' : '생성'}
                </button>
                {form.id && (
                  <button type="button" onClick={resetForm} disabled={isProcessing.current}>
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
                      <button onClick={() => handleEdit(store)}  className="store-manage-edit-button"  disabled={isProcessing.current}>
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(store.id)}
                        className="store-manage-delete-button"
                        disabled={isProcessing.current}
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </>
  );
}

export default StoreManage;