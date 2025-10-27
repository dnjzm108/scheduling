import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function SignUp() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    userId: '',
    birthdate: '',
    phone: '',
    password: '',
    store_id: '',
    consent_records: { privacy: false, marketing: false }
  });
  const [stores, setStores] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);
  const [userIdAvailable, setUserIdAvailable] = useState(null);

  // 매장 목록 불러오기 (재시도 로직 추가)
  useEffect(() => {
    const fetchStores = async (retries = 3) => {
      setStoresLoading(true);
      try {
        const response = await axios.get(`${BASE_URL}/stores`, {
          timeout: 5000 // 5초 타임아웃
        });
        setStores(response.data || []);
        if (response.data.length === 0) {
          toast.warn('등록된 매장이 없습니다.');
        }
      } catch (err) {
        console.error('Fetch stores error:', {
          message: err.message,
          code: err.code,
          response: err.response?.data,
          status: err.response?.status
        });
        if (retries > 0 && err.code === 'ECONNABORTED') {
          console.log(`Retrying fetch stores, attempts left: ${retries}`);
          setTimeout(() => fetchStores(retries - 1), 1000);
        } else {
          toast.error('매장 목록을 불러오지 못했습니다. 서버를 확인하세요.');
        }
      } finally {
        setStoresLoading(false);
      }
    };
    fetchStores();
  }, []);

  // 아이디 중복 확인
  const checkUserId = async (userId) => {
    if (!userId) return;
    try {
      const response = await axios.get(`${BASE_URL}/check-userid?userId=${userId}`);
      setUserIdAvailable(!response.data.exists);
    } catch (err) {
      toast.error('아이디 확인 실패');
    }
  };

  // 하이픈 추가 함수
  const formatBirthdate = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 8); // 숫자만, 최대 8자
    if (cleaned.length <= 4) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  };

  const formatPhone = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 11); // 숫자만, 최대 11자
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
  };

  // 입력 처리
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let formattedValue = value;

    if (name === 'birthdate') {
      formattedValue = formatBirthdate(value);
    } else if (name === 'phone') {
      formattedValue = formatPhone(value);
    } else if (name === 'consent_records') {
      setFormData(prev => ({
        ...prev,
        consent_records: { ...prev.consent_records, [value]: checked }
      }));
      setError('');
      return;
    }

    setFormData(prev => ({ ...prev, [name]: formattedValue }));
    if (name === 'userId') checkUserId(value);
    setError('');
  };

  // 폼 제출
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 백엔드 전송용 데이터 (하이픈 제거)
    const submitData = {
      ...formData,
      birthdate: formData.birthdate.replace(/-/g, ''),
      phone: formData.phone.replace(/-/g, '')
    };

    if (!formData.consent_records.privacy) {
      setError('개인정보 수집 동의가 필요합니다.');
      toast.error('개인정보 수집 동의가 필요합니다.');
      setLoading(false);
      return;
    }
    if (!userIdAvailable) {
      setError('사용할 수 없는 아이디입니다.');
      toast.error('사용할 수 없는 아이디입니다.');
      setLoading(false);
      return;
    }
    if (!formData.store_id) {
      setError('매장을 선택하세요.');
      toast.error('매장을 선택하세요.');
      setLoading(false);
      return;
    }
    try {
      await axios.post(`${BASE_URL}/signup`, submitData);
      toast.success('회원가입 성공! 로그인 페이지로 이동합니다.');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      const message = err.response?.data?.message || '회원가입 실패';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1 className="title">회원가입</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">이름</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="이름 입력"
          />
        </div>
        <div className="form-group">
          <label htmlFor="userId">아이디</label>
          <input
            type="text"
            id="userId"
            name="userId"
            value={formData.userId}
            onChange={handleChange}
            placeholder="아이디 입력"
          />
          {formData.userId && (
            <p className={userIdAvailable ? 'success-message' : 'error-message'}>
              {userIdAvailable ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'}
            </p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="birthdate">생년월일</label>
          <input
            type="text"
            id="birthdate"
            name="birthdate"
            value={formData.birthdate}
            onChange={handleChange}
            placeholder="YYYY-MM-DD"
            maxLength="10"
          />
        </div>
        <div className="form-group">
          <label htmlFor="phone">전화번호</label>
          <input
            type="text"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            placeholder="010-1234-5678"
            maxLength="13"
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="비밀번호 입력"
          />
        </div>
        <div className="form-group">
          <label htmlFor="store_id">매장</label>
          {storesLoading ? (
            <p className="loading">매장 목록 로딩 중...</p>
          ) : stores.length === 0 ? (
            <p className="error-message">매장 목록을 불러오지 못했습니다.</p>
          ) : (
            <select
              id="store_id"
              name="store_id"
              value={formData.store_id}
              onChange={handleChange}
            >
              <option value="">매장 선택</option>
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="form-group">
          <label>동의 항목</label>
          <label className="checkbox">
            <input
              type="checkbox"
              name="consent_records"
              value="privacy"
              checked={formData.consent_records.privacy}
              onChange={handleChange}
            />
            개인정보 수집 동의 (필수)
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              name="consent_records"
              value="marketing"
              checked={formData.consent_records.marketing}
              onChange={handleChange}
            />
            마케팅 수신 동의 (선택)
          </label>
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="submit" className="button button-primary" disabled={loading || storesLoading}>
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default SignUp;