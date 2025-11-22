// src/component/notices/index.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken, removeToken } from '../../utils/auth';
import { jwtDecode } from 'jwt-decode';
import './index.css';

function Notices() {
  const navigate = useNavigate();
  const isProcessing = useRef(false);
  const hasLoaded = useRef(false);

  const [notices, setNotices] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('');
  const [loading, setLoading] = useState(true);
  const [userLevel, setUserLevel] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token) return navigate('/');

    let decoded;
    try {
      decoded = jwtDecode(token);
      setUserLevel(decoded.level);
    } catch {
      removeToken();
      return navigate('/');
    }

    const loadData = async () => {
      try {
        setLoading(true);

        const dataReq = [ api.get('/api/notices') ];
        if (decoded.level >= 3) dataReq.push(api.get('/api/stores'));

        const [noticesRes, storesRes] = await Promise.all(dataReq);

        setNotices(noticesRes.data || []);
        if (storesRes) setStores(storesRes.data || []);

      } catch {
        toast.error('데이터 로드 실패');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

  const handleStoreChange = async (e) => {
    const storeId = e.target.value;
    setSelectedStore(storeId);

    try {
      const { data } = await api.get(`/api/notices${storeId ? `?store_id=${storeId}` : ''}`);
      setNotices(data || []);
    } catch {
      toast.error('로드 실패');
    }
  };

  const handleDelete = async (id) => {
    if (isProcessing.current) return;
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    isProcessing.current = true;

    try {
      await api.delete(`/api/notices/${id}`);
      setNotices(prev => prev.filter(n => n.id !== id));
      toast.success('삭제 완료!');
    } catch {
      toast.error('삭제 실패');
    } finally {
      isProcessing.current = false;
    }
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const renderAttachments = (attachments) => (
    <div className="notices-attachments">
      {attachments.map((file, i) => {
        const isImage = file.mimeType?.startsWith('image');

        return (
          <div key={i} className="notice-file-wrapper">
            {isImage ? (
              <img
                src={file.url}
                alt={file.name}
                className="notices-attachment-image"
              />
            ) : (
              <div className="notices-file-icon">📄</div>
            )}

            <a href={file.url} download className="notices-download-link">
              {file.name}
            </a>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <Header title="공지사항" backTo="/AdminDashboard" />

      <div className="page-with-header">
        <div className="notices-container">
          <main className="notices-main-content">

            {/* 작성 버튼 - 매장관리자 이상만 */}
            {userLevel >= 3 && (
              <button className="notices-create-button" onClick={() => navigate('/NoticeCreate')}>
                공지사항 작성
              </button>
            )}

            {/* 매장 선택 */}
            {userLevel >= 3 && stores.length > 0 && (
              <div className="notices-store-selector">
                <select value={selectedStore} onChange={handleStoreChange}>
                  <option value="">전체 매장</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 출력 */}
            {loading ? (
              <p className="notices-loading">로딩 중...</p>
            ) : notices.length === 0 ? (
              <p className="notices-no-notices">등록된 공지사항이 없습니다.</p>
            ) : (
              <ul className="notices-list">
                {notices.map(notice => (
                  <li
                    key={notice.id}
                    className={`notices-item ${expandedId === notice.id ? 'expanded' : ''}`}
                  >
                    <button
                      className="notices-title-btn"
                      onClick={() => toggleExpand(notice.id)}
                    >
                      {notice.title}
                    </button>

                    {expandedId === notice.id && (
                      <div className="notices-details">
                        <p className="notice-body">{notice.body}</p>

                        {/* 첨부파일 */}
                        {notice.attachments?.length > 0 && renderAttachments(notice.attachments)}

                        <p className="notice-footer">
                          {notice.author_name} · {new Date(notice.published_at).toLocaleDateString('ko-KR')}
                        </p>

                        {/* 관리자 기능 */}
                        {userLevel >= 3 && (
                          <div className="notices-admin-actions">
                            <button
                              className="notices-edit-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/notice-edit/${notice.id}`);
                              }}
                            >
                              수정
                            </button>
                            <button
                              className="notices-delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(notice.id);
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

          </main>
        </div>
      </div>

      <ToastContainer theme="colored" autoClose={3500} />
    </>
  );
}

export default Notices;
