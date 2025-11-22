import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import { jwtDecode } from 'jwt-decode';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import Header from '../Header'; 
import './index.css';

function Requests() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ title: '', body: '' });
  const [files, setFiles] = useState([]);
  const [fileNames, setFileNames] = useState([]); // 👈 파일 이름 목록 상태 추가
  const [requests, setRequests] = useState([]);
  const [userInfo, setUserInfo] = useState({ name: '', store_id: '', store_name: '로딩 중...' });
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
      setUserInfo(prev => ({ ...prev, name: decoded.name || '사용자님' }));
    } catch (err) {
      console.error('Token decode error:', err);
      toast.error('세션 오류가 발생했습니다.');
      removeToken();
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchUserStore = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/api/auth/user-store`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        setUserInfo(prev => ({
          ...prev,
          store_id: response.data.store_id,
          store_name: response.data.store_name || '매장 정보 없음'
        }));
      } catch (err) {
        console.error('User store fetch error:', err.response?.data || err.message);
        toast.error('매장 정보 불러오기 실패. 기본 매장으로 설정됩니다.');
        setUserInfo(prev => ({ ...prev, store_name: '기본 매장' }));
      }
    };

    const fetchData = async () => {
      try {
        const [requestsRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/requests`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        setRequests(requestsRes.data || []);
      } catch (err) {
        console.error('Requests fetch error:', err.response?.data || err.message);
        toast.error('데이터 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };

    fetchUserStore();
    fetchData();
  }, [navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setFiles(e.target.files);
    // 👈 선택된 파일 이름을 추출하여 상태에 저장
    const names = Array.from(e.target.files).map(file => file.name);
    setFileNames(names);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();
    const form = new FormData();
    form.append('title', formData.title);
    form.append('body', formData.body);
    form.append('store_id', userInfo.store_id);
    for (let file of files) {
      form.append('attachments', file);
    }
    
    // 유효성 검사
    if (!formData.title.trim() || !formData.body.trim()) {
        toast.error('제목과 내용을 모두 입력해주세요.');
        return;
    }

    try {
      await axios.post(`${BASE_URL}/api/requests`, form, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      toast.success('건의사항 제출 완료!');
      setFormData({ title: '', body: '' });
      setFiles([]);
      setFileNames([]); // 👈 파일 이름 목록 초기화
      const response = await axios.get(`${BASE_URL}/api/requests`, { headers: { Authorization: `Bearer ${token}` } });
      setRequests(response.data || []);
    } catch (err) {
      console.error('Submit error:', err.response?.data || err.message);
      toast.error('건의사항 제출 실패');
    }
  };

  // const handleLogout = () => { // 사용되지 않으므로 제거하거나 주석 처리
  //   removeToken();
  //   toast.success('로그아웃되었습니다.');
  //   navigate('/');
  // };

  return (
    <>
    <Header title="건의사항 작성" backTo="/myschedules"/>
    {/* page-with-header 클래스를 request-container에 추가하여 스타일 통일 */}
    <div className="request-container page-with-header"> 
      <main className="request-main-content">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>제목</label>
            <input type="text" name="title" value={formData.title} onChange={handleChange} required/>
          </div>
          <div className="form-group">
            <label>내용</label>
            <textarea name="body" value={formData.body} onChange={handleChange} rows="5" required/>
          </div>
          <div className="form-group">
            <label>매장</label>
            <input type="text" value={userInfo.store_name} readOnly />
          </div>
          
          {/* 👇 첨부파일 필드 수정 시작 */}
          <div className="form-group file-upload-group">
            <label>첨부파일 (이미지 권장)</label>
            
            {/* 실제 input은 숨기고 CSS로 스타일링된 label과 연결 */}
            <input 
              id="file-input" 
              type="file" 
              multiple 
              accept="image/*" 
              onChange={handleFileChange} 
              style={{ display: 'none' }}
            />

            {/* 커스텀 버튼/정보 표시 영역 */}
            <div className="custom-file-input">
              <label htmlFor="file-input" className="file-select-button">
                파일 선택
              </label>
              <span className="file-name-display">
                {fileNames.length > 0 
                  ? `${fileNames.length}개의 파일 선택됨 (${fileNames.join(', ')})`
                  : '첨부할 이미지를 선택해주세요.'
                }
              </span>
            </div>
          </div>
          {/* 첨부파일 필드 수정 끝 */}
          
          <button type="submit" className="button button-primary" disabled={loading}>제출</button>
        </form>

        <h2>제출한 건의사항 목록</h2>
        
        {loading ? (
          <p className="loading">로딩 중...</p>
        ) : (
          <ul className="request-list">
            {requests.length === 0 ? (
                <p className="loading">제출된 건의사항이 없습니다.</p>
            ) : (
                requests.map(req => (
                    <li key={req.id} className="request-item">
                      <h3>{req.title}</h3>
                      <p>{req.body}</p>
      
                      {Array.isArray(req.attachments) && req.attachments.length > 0 && (
                        <div className="request-attachments">
                          {req.attachments.map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`첨부파일 ${idx + 1}`}
                            />
                          ))}
                        </div>
                      )}
      
                      <p>
                        작성자: {req.user_name || '알 수 없음'} | 상태: {req.status || '접수됨'} |{' '}
                        {req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}
                      </p>
                    </li>
                  ))
            )}
          </ul>
        )}

      </main>
      <ToastContainer position="top-right" theme="colored" autoClose={3000} />
    </div>
    </>
  );
}

export default Requests;