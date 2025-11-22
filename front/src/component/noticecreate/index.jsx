// src/component/notices/NoticeCreate.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import Header from '../Header';
import './index.css';

function NoticeCreate() {
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: '', level: 0 });
  const [stores, setStores] = useState([]);
  const [allowedStoreIds, setAllowedStoreIds] = useState([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    store_id: '',
    visibility: 'all'
  });
  const [files, setFiles] = useState([]);

  const showToast = useCallback((type, msg) => {
    toast[type](msg, { position: 'top-center', autoClose: 2500 });
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      showToast('error', '로그인 필요');
      return setTimeout(() => navigate('/'), 1500);
    }

    let decoded;
    try {
      decoded = jwtDecode(token);
    } catch {
      showToast('error', '세션 오류');
      removeToken();
      return setTimeout(() => navigate('/'), 1500);
    }

    if (decoded.level < 2) {
      showToast('error', '권한 없음');
      return setTimeout(() => navigate('/'), 1500);
    }

    setUser({ name: decoded.name, level: decoded.level });

    const loadStores = async () => {
      try {
        const [allowRes, storeRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/user/allowed-stores`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${BASE_URL}/api/stores`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
        ]);

        const allowed = allowRes.data?.allowedStores || [];
        setAllowedStoreIds(allowed);

        // 총관리자면 모든 매장, 아니면 권한 있는 매장만
        const filtered = decoded.level === 4
          ? storeRes.data
          : storeRes.data.filter(s => allowed.includes(s.id));

        setStores(filtered);

        // 하나뿐이면 기본 선택
        if (filtered.length === 1) {
          setFormData(f => ({ ...f, store_id: filtered[0].id.toString() }));
        }
      } catch (err) {
        showToast('error', '매장 정보 로드 실패');
      }
    };

    loadStores();
  }, [navigate, showToast]);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = e => {
    const selected = Array.from(e.target.files);
    const valid = selected.filter(f => f.size <= 5 * 1024 * 1024);

    if (valid.length < selected.length)
      toast.warn('5MB 초과 파일 제외됨');

    setFiles(valid);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const token = getToken();

    if (!formData.title.trim()) return showToast('error', '제목 입력');

    setLoading(true);
    const data = new FormData();

    Object.entries(formData).forEach(([k, v]) => data.append(k, v));
    files.forEach(f => data.append('attachments', f));

    try {
      await axios.post(`${BASE_URL}/api/notices`, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      showToast('success', '공지 작성 완료');
      setTimeout(() => navigate('/notices'), 1500);
    } catch (err) {
      showToast('error', err.response?.data?.message || '작성 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="notice-create-wrapper">
      <Header title="공지사항 작성" backTo="/notices" />

      <form className="notice-create-form" onSubmit={handleSubmit}>
        <label>제목</label>
        <input name="title" value={formData.title} onChange={handleChange} required />

        <label>내용</label>
        <textarea rows="8" name="body" value={formData.body} onChange={handleChange} required />

        {/* 매장 선택 */}
        <label>대상 매장</label>
        <select name="store_id" value={formData.store_id} onChange={handleChange}>
          {user.level === 4 && <option value="">전체 매장</option>}
          {stores.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* 공개범위 */}
        <label>공개 대상</label>
        <div className="notice-radio-group">
          <label><input type="radio" name="visibility" value="all" checked={formData.visibility === 'all'} onChange={handleChange} /> 전체</label>
          <label><input type="radio" name="visibility" value="employees" checked={formData.visibility === 'employees'} onChange={handleChange} /> 직원</label>
          <label><input type="radio" name="visibility" value="admins" checked={formData.visibility === 'admins'} onChange={handleChange} /> 관리자</label>
        </div>

        {/* 첨부 */}
        <label>사진 첨부 (최대 3개, 5MB)</label>
        <input type="file" accept="image/*" multiple onChange={handleFileChange} />

        <button type="submit" disabled={loading}>
          {loading ? '저장 중...' : '작성'}
        </button>
      </form>

      <ToastContainer theme="colored" />
    </div>
  );
}

export default NoticeCreate;
