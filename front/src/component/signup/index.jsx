import React, { useState, useEffect, useRef } from 'react';
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
    confirmPassword: '',
    store_id: '',
    consent_records: { privacy: false, marketing: false }
  });
  const [stores, setStores] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [storesLoading, setStoresLoading] = useState(true);
  const [userIdAvailable, setUserIdAvailable] = useState(null);
  const userIdTimeout = useRef(null);

  // 매장 로드
  useEffect(() => {
    const fetchStores = async () => {
      setStoresLoading(true);
      try {
        const res = await axios.get(`${BASE_URL}/api/admin/stores`);
        setStores(res.data || []);
      } catch {
        toast.error('매장 정보를 불러오지 못했습니다.');
      } finally {
        setStoresLoading(false);
      }
    };
    fetchStores();
  }, []);

  // 아이디 중복 체크
  useEffect(() => {
    if (!formData.userId || formData.userId.length < 4) {
      setUserIdAvailable(null);
      return;
    }
    if (userIdTimeout.current) clearTimeout(userIdTimeout.current);
    userIdTimeout.current = setTimeout(async () => {
      try {
        const res = await axios.get(`${BASE_URL}/api/auth/check-userid?userId=${formData.userId}`);
        setUserIdAvailable(!res.data.exists);
      } catch {
        setUserIdAvailable(null);
      }
    }, 500);
    return () => clearTimeout(userIdTimeout.current);
  }, [formData.userId]);

  // 포맷
  const formatBirthdate = (v) => {
    const n = v.replace(/\D/g, '').slice(0, 8);
    if (n.length <= 4) return n;
    if (n.length <= 6) return `${n.slice(0,4)}-${n.slice(4)}`;
    return `${n.slice(0,4)}-${n.slice(4,6)}-${n.slice(6)}`;
  };
  const formatPhone = (v) => {
    const n = v.replace(/\D/g, '').slice(0, 11);
    if (n.length <= 3) return n;
    if (n.length <= 7) return `${n.slice(0,3)}-${n.slice(3)}`;
    return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7)}`;
  };

  // 입력
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let val = value;

    if (name === 'birthdate') val = formatBirthdate(value);
    else if (name === 'phone') val = formatPhone(value);

    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        consent_records: { ...prev.consent_records, [value]: checked }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: val }));
    }
    setError('');
  };

  // 제출
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 프론트 검증
    if (!formData.name || !formData.userId || !formData.birthdate || !formData.phone || !formData.password || !formData.store_id) {
      setError('모든 필수 항목을 입력하세요.');
      toast.error('모든 필수 항목을 입력하세요.');
      setLoading(false);
      return;
    }
    if (!formData.consent_records.privacy) {
      setError('개인정보 수집 동의는 필수입니다.');
      toast.error('개인정보 수집 동의는 필수입니다.');
      setLoading(false);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      toast.error('비밀번호를 다시 확인해주세요.');
      setLoading(false);
      return;
    }
    if (!userIdAvailable) {
      setError('사용할 수 없는 아이디입니다.');
      toast.error('아이디 중복 확인해주세요.');
      setLoading(false);
      return;
    }

    // confirmPassword 제거 (DB에 저장하지 않음)
    const payload = {
      name: formData.name,
      userId: formData.userId,
      password: formData.password,
      birthdate: formData.birthdate.replace(/-/g, ''),
      phone: formData.phone.replace(/-/g, ''),
      store_id: formData.store_id,
      consent_records: formData.consent_records
    };

    try {
      await axios.post(`${BASE_URL}/api/auth/signup`, payload);
      toast.success('회원가입 성공! 관리자 승인 후 로그인 가능합니다.');
      setTimeout(() => navigate('/'), 2500);
    } catch (err) {
      const msg = err.response?.data?.message || '회원가입에 실패했습니다.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-bg-overlay" />
      <div className="signup-card">
        <div className="signup-header">
          <h1 className="signup-title">회원가입</h1>
          <p className="signup-subtitle">정보를 입력하고 시작하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="signup-form">
          <div className="signup-input-group">
            <label className="signup-label">이름</label>
            <input name="name" value={formData.name} onChange={handleChange} className="signup-input" placeholder="홍길동" disabled={loading} required />
          </div>

          <div className="signup-input-group">
            <label className="signup-label">아이디</label>
            <input name="userId" value={formData.userId} onChange={handleChange} className={`signup-input ${userIdAvailable === false ? 'signup-input-error' : ''}`} placeholder="4자 이상" disabled={loading} required />
            {userIdAvailable !== null && (
              <p className={userIdAvailable ? 'signup-success' : 'signup-error'}>
                {userIdAvailable ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'}
              </p>
            )}
          </div>

          <div className="signup-input-group">
            <label className="signup-label">생년월일</label>
            <input name="birthdate" value={formData.birthdate} onChange={handleChange} className="signup-input" placeholder="1990-01-01" disabled={loading} />
          </div>

          <div className="signup-input-group">
            <label className="signup-label">전화번호</label>
            <input name="phone" value={formData.phone} onChange={handleChange} className="signup-input" placeholder="010-1234-5678" disabled={loading} />
          </div>

          <div className="signup-input-group">
            <label className="signup-label">비밀번호</label>
            <input type="password" name="password" value={formData.password} onChange={handleChange} className="signup-input" placeholder="비밀번호 입력" disabled={loading} />
          </div>

          <div className="signup-input-group">
            <label className="signup-label">비밀번호 확인</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className={`signup-input ${formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword ? 'signup-input-error' : ''}`}
              placeholder="비밀번호 재입력"
              disabled={loading}
            />
            {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <p className="signup-error">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>

          <div className="signup-input-group">
            <label className="signup-label">매장</label>
            {storesLoading ? (
              <div className="signup-loading">로딩 중...</div>
            ) : stores.length ? (
              <select name="store_id" value={formData.store_id} onChange={handleChange} className="signup-select" disabled={loading} required>
                <option value="">매장 선택</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <p className="signup-error">매장이 없습니다.</p>
            )}
          </div>

          <div className="signup-checkbox-group">
            <label className="signup-checkbox">
              <input type="checkbox" value="privacy" checked={formData.consent_records.privacy} onChange={handleChange} required />
              <span>개인정보 수집 동의 (필수)</span>
            </label>
            <label className="signup-checkbox">
              <input type="checkbox" value="marketing" checked={formData.consent_records.marketing} onChange={handleChange} />
              <span>마케팅 수신 동의 (선택)</span>
            </label>
          </div>

          {error && <div className="signup-error">{error}</div>}

          <button type="submit" className="signup-button" disabled={loading || storesLoading}>
            {loading ? (
              <>
                <div className="signup-spinner" />
                가입 중...
              </>
            ) : (
              '회원가입'
            )}
          </button>
        </form>

        <p className="signup-login-link">
          이미 계정이 있나요? <a href="/">로그인하기</a>
        </p>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default SignUp;