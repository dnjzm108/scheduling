// src/component/SectionManagement/index.jsx
import React, { useEffect, useState, useRef } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import './index.css';

function SectionManagement() {
  const [activeTab, setActiveTab] = useState('hall'); // 'hall' | 'kitchen'

  const [user, setUser] = useState(null);          // 로그인한 유저 정보
  const [stores, setStores] = useState([]);        // 선택 가능한 매장 목록
  const [selectedStoreId, setSelectedStoreId] = useState(''); // select value는 문자열로

  const [hallSections, setHallSections] = useState([]);
  const [kitchenSections, setKitchenSections] = useState([]);
  const [newName, setNewName] = useState('');

  const isLoading = useRef(false);

  // 현재 탭에 따른 섹션 리스트 핸들러
  const currentList = activeTab === 'hall' ? hallSections : kitchenSections;
  const setCurrentList = activeTab === 'hall' ? setHallSections : setKitchenSections;

  /* -----------------------------------------
     1. 내 정보 + 매장 목록 + 권한 기반 allowedStores 계산
  ----------------------------------------- */
  const loadUserAndStores = async () => {
    try {
      const [userRes, storesRes, allowedRes] = await Promise.all([
        api.get('/api/user'),
        api.get('/api/stores'),
        api.get('/api/user/allowed-stores')
      ]);

      const me = userRes.data;
      const allStores = storesRes.data || [];
      const allowedInfo = allowedRes.data || {};

      setUser(me);

      let allowedStoreIds = [];

      if (allowedInfo.isSuperAdmin) {
        // 총관리자: 모든 매장 허용
        allowedStoreIds = allStores.map(s => s.id);
      } else if (Array.isArray(allowedInfo.allowedStores) && allowedInfo.allowedStores.length > 0) {
        // 매장관리자: 자기 매장 + 위임받은 매장들 (백엔드에서 이미 포함)
        allowedStoreIds = allowedInfo.allowedStores;
      } else if (me.store_id) {
        // 그 외: 자기 매장만
        allowedStoreIds = [me.store_id];
      }

      const filteredStores = allStores.filter(s => allowedStoreIds.includes(s.id));
      setStores(filteredStores);

      // select 기본값 설정 (null/undefined 방지)
      if (filteredStores.length > 0) {
        setSelectedStoreId(String(filteredStores[0].id));
      } else {
        setSelectedStoreId('');
      }
    } catch (err) {
        console.log(err);
        if(err.message !=="중복 요청 취소"){
            console.error(err);
            toast.error('매장/사용자 정보를 불러오지 못했습니다.');
        }
    }
  };

  /* -----------------------------------------
     2. 선택된 매장의 섹션 목록 로드
  ----------------------------------------- */
  const loadSections = async (storeId) => {
    if (!storeId) return;
    if (isLoading.current) return;
    isLoading.current = true;

    try {
      const [hallRes, kitchenRes] = await Promise.all([
        api.get(`/api/sections/hall`, { params: { store_id: storeId } }),
        api.get(`/api/sections/kitchen`, { params: { store_id: storeId } })
      ]);

      setHallSections(hallRes.data || []);
      setKitchenSections(kitchenRes.data || []);
    } catch (err) {
      // axios 취소 같은 건 여기서 굳이 따로 throw 안 하고, 토스트만 처리
      if (!axios.isCancel(err)) {
        console.error(err);
        toast.error('섹션 목록을 불러오지 못했습니다.');
      }
    } finally {
      isLoading.current = false;
    }
  };

  /* -----------------------------------------
     3. 최초 유저/매장 정보 로딩
  ----------------------------------------- */
  useEffect(() => {
    loadUserAndStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -----------------------------------------
     4. 매장 선택이 바뀔 때마다 섹션 다시 로딩
  ----------------------------------------- */
  useEffect(() => {
    if (selectedStoreId) {
      loadSections(selectedStoreId);
    }
  }, [selectedStoreId]);

  /* -----------------------------------------
     5. 섹션 추가
  ----------------------------------------- */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return toast.error('섹션 이름을 입력하세요.');
    if (!selectedStoreId) return toast.error('매장을 먼저 선택하세요.');
    if (isLoading.current) return;
    isLoading.current = true;

    try {
      await api.post(`/api/sections/${activeTab}`, {
        name: newName.trim(),
        store_id: Number(selectedStoreId)
      });
      toast.success('섹션이 추가되었습니다.');
      setNewName('');
      await loadSections(selectedStoreId);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || '추가 실패');
    } finally {
      isLoading.current = false;
    }
  };

  /* -----------------------------------------
     6. 섹션 수정
  ----------------------------------------- */
  const handleUpdate = async (id, data) => {
    if (isLoading.current) return;
    isLoading.current = true;
    try {
      await api.put(`/api/sections/${activeTab}/${id}`, data);
      toast.success('수정 완료');
      setCurrentList(prev => prev.map(s => (s.id === id ? { ...s, ...data } : s)));
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || '수정 실패');
    } finally {
      isLoading.current = false;
    }
  };

  /* -----------------------------------------
     7. 섹션 삭제
  ----------------------------------------- */
  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제하시겠습니까? 해당 섹션이 들어간 스케줄이 있을 수 있습니다.')) return;
    if (isLoading.current) return;
    isLoading.current = true;

    try {
      await api.delete(`/api/sections/${activeTab}/${id}`);
      toast.success('삭제 완료');
      setCurrentList(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || '삭제 실패');
    } finally {
      isLoading.current = false;
    }
  };

  return (
    <div className="section-page">
      <Header title="섹션 관리" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="section-container">
          {/* 🔹 매장 선택 : 총관리자 + 권한받은 매장 관리자 모두 여기서 선택 가능 */}
          <div className="section-store-selector">
            <label>매장 선택</label>
            {stores.length === 0 ? (
              <div className="no-store">선택 가능한 매장이 없습니다.</div>
            ) : (
              <select
                value={selectedStoreId || ''}   // ❗ null 방지
                onChange={e => setSelectedStoreId(e.target.value)}
              >
                {stores.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 🔹 홀/주방 탭 */}
          <div className="section-tabs">
            <button
              className={activeTab === 'hall' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('hall')}
            >
              홀 섹션
            </button>
            <button
              className={activeTab === 'kitchen' ? 'tab active' : 'tab'}
              onClick={() => setActiveTab('kitchen')}
            >
              주방 섹션
            </button>
          </div>

          {/* 🔹 섹션 추가 폼 */}
          <form className="section-add-form" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder={activeTab === 'hall'
                ? '예: 소스, 홀퇴식, 안내...'
                : '예: 핫다이, 샐러드, 설거지...'}
              value={newName}
              onChange={e => setNewName(e.target.value)}
            />
            <button type="submit" disabled={isLoading.current}>추가</button>
          </form>

          {/* 🔹 섹션 목록 */}
          <div className="section-list">
            {currentList.length === 0 ? (
              <p className="no-data">등록된 섹션이 없습니다.</p>
            ) : (
              currentList.map(sec => (
                <div key={sec.id} className="section-item">
                  <input
                    className="section-name-input"
                    value={sec.name}
                    onChange={e =>
                      setCurrentList(prev =>
                        prev.map(s => s.id === sec.id ? { ...s, name: e.target.value } : s)
                      )
                    }
                    onBlur={e =>
                      handleUpdate(sec.id, { name: e.target.value, is_active: sec.is_active })
                    }
                  />
                  <label className="section-active">
                    <input
                      type="checkbox"
                      checked={sec.is_active !== 0}
                      onChange={e =>
                        handleUpdate(sec.id, { name: sec.name, is_active: e.target.checked ? 1 : 0 })
                      }
                    />
                    사용
                  </label>
                  <button
                    className="btn-delete"
                    onClick={() => handleDelete(sec.id)}
                  >
                    삭제
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={3000} />
    </div>
  );
}

export default SectionManagement;
