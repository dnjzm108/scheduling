// src/pages/SignUp.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', userId: '', resident_id: '', phone: '',
    password: '', confirmPassword: '', store_id: '',
    bank_name: '', bank_account: '', account_holder: '',
    tax_type: '0', // 기본값은 3.3%
    consent: { privacy: false, marketing: false }
  });
  const [stores, setStores] = useState([]);
  const [error, setError] = useState('');
  const [idOk, setIdOk] = useState(null);

  // 중복 방지
  const isSubmitting = useRef(false);
  const hasLoadedStores = useRef(false);
  const idCheckTimeout = useRef(null);

  // 매장 한 번만 불러오기
  useEffect(() => {
    if (hasLoadedStores.current) return;
    hasLoadedStores.current = true;

    axios.get(`${BASE_URL}/api/stores`)
      .then(res => setStores(res.data || []))
      .catch(() => toast.error('매장 정보를 불러오지 못했습니다.'));
  }, []);

  // 아이디 실시간 중복 체크 (디바운스)
  useEffect(() => {
    if (!form.userId || form.userId.length < 4) {
      setIdOk(null);
      return;
    }
    if (idCheckTimeout.current) clearTimeout(idCheckTimeout.current);
    idCheckTimeout.current = setTimeout(() => {
      axios.get(`${BASE_URL}/api/auth/check-userid?userId=${form.userId}`)
        .then(res => setIdOk(!res.data.exists))
        .catch(() => setIdOk(null));
    }, 500);
  }, [form.userId]);

  // 입력 핸들러
 const handleChange = (e) => {
  const { name, value, type, checked } = e.target;
  let val = value;

  // 주민번호: 13자리 + 자동 하이픈
  if (name === 'resident_id') {
    val = value
      .replace(/\D/g, '')  // 숫자만
      .slice(0, 13);        // 최대 13자리

    if (val.length > 6) {
      val = val.replace(/(\d{6})(\d+)/, '$1-$2');
    }
  }

  // 전화번호 하이픈
  if (name === 'phone') {
    val = value
      .replace(/\D/g, '')
      .slice(0, 11)
      .replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }

  if (type === 'checkbox') {
    setForm(prev => ({
      ...prev,
      consent: { ...prev.consent, [value]: checked }
    }));
  } else {
    setForm(prev => ({ ...prev, [name]: val }));
  }

  setError('');
};


  // 제출
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting.current) return;
    isSubmitting.current = true;
    setError('');

    // 검증
    const required = ['name', 'userId', 'resident_id', 'phone', 'password', 'store_id'];
    if (required.some(field => !form[field])) {
      return done('모든 필수 항목을 입력하세요.');
    }
    if (!form.consent.privacy) return done('개인정보 수집 동의는 필수입니다.');
    if (form.password !== form.confirmPassword) return done('비밀번호가 일치하지 않습니다.');
    if (!idOk) return done('사용 가능한 아이디를 입력해주세요.');

    const payload = {
      ...form,
      resident_id: form.resident_id.replace(/-/g, ''),
      phone: form.phone.replace(/-/g, ''),
      consent_records: form.consent,

      // 새로 추가된 필드 포함
      bank_name: form.bank_name,
      bank_account: form.bank_account,
      account_holder: form.account_holder,
      tax_type: Number(form.tax_type),
    };

    delete payload.confirmPassword;

    try {
      await axios.post(`${BASE_URL}/api/auth/signup`, payload);
      toast.success('회원가입 성공! 관리자 승인 후 로그인 가능합니다.');
      setTimeout(() => navigate('/', { replace: true }), 2500);
    } catch (err) {
      const msg = err.response?.data?.message || '회원가입 실패';
      done(msg);
    } finally {
      isSubmitting.current = false;
    }
  };

  const done = (msg) => {
    setError(msg);
    toast.error(msg);
    isSubmitting.current = false;
  };

  return (
    <div className="signup-container">
      <div className="signup-bg-overlay" />
      <div className="signup-card">

        <form onSubmit={handleSubmit} className="signup-form">

          <div className="signup-input-group">
            <label>이름</label>
            <input name="name" value={form.name} onChange={handleChange} placeholder="홍길동" disabled={isSubmitting.current} required />
          </div>

          <div className="signup-input-group">
            <label>아이디</label>
            <input name="userId" value={form.userId} onChange={handleChange} placeholder="4자 이상" disabled={isSubmitting.current} />
            {idOk !== null && (
              <p className={idOk ? 'signup-success' : 'signup-error'}>
                {idOk ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'}
              </p>
            )}
          </div>

          <div className="signup-input-group">
            <label>주민번호</label>
            <input name="resident_id" value={form.resident_id} onChange={handleChange} placeholder="001122-2000321" disabled={isSubmitting.current} />
          </div>

          <div className="signup-input-group">
            <label>전화번호</label>
            <input name="phone" value={form.phone} onChange={handleChange} placeholder="010-1234-5678" disabled={isSubmitting.current} />
          </div>

          <div className="signup-input-group">
            <label>비밀번호</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="비밀번호" disabled={isSubmitting.current} />
          </div>

          <div className="signup-input-group">
            <label>비밀번호 확인</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="비밀번호 재입력"
              disabled={isSubmitting.current}
              className={form.password && form.confirmPassword && form.password !== form.confirmPassword ? 'signup-input-error' : ''}
            />
          </div>
          <div className="signup-input-group">
            <label>은행명</label>
            <select name="bank_name" value={form.bank_name} onChange={handleChange} required>
              <option value="">은행 선택</option>
              <option value="농협">농협</option>
              <option value="국민">국민은행</option>
              <option value="신한">신한은행</option>
              <option value="우리">우리은행</option>
              <option value="하나">하나은행</option>
              <option value="카카오뱅크">카카오뱅크</option>
              <option value="토스뱅크">토스뱅크</option>
            </select>
          </div>

          <div className="signup-input-group">
            <label>계좌번호</label>
            <input
              name="bank_account"
              value={form.bank_account}
              onChange={handleChange}
              placeholder="123-4567-890123"
              required
            />
          </div>

          <div className="signup-input-group">
            <label>통장 명의자</label>
            <input
              name="account_holder"
              value={form.account_holder}
              onChange={handleChange}
              placeholder="홍길동"
              required
            />
            <p className="signup-info">
              ※ 미성년자 계좌는 입금 제한이 있을 수 있습니다.
              입금 제한이 해제된 계좌 또는 입금에 문제가 없는 계좌 정보를 입력해주세요.
            </p>
          </div>

          <div className="signup-input-group">
            <label>세금 방식</label>
            <select name="tax_type" value={form.tax_type} onChange={handleChange} required>
              <option value="0">3.3% 공제</option>
              <option value="1">4대보험 적용</option>
            </select>
          </div>

          <div className="signup-input-group">
            <label>매장</label>
            {stores.length ? (
              <select name="store_id" value={form.store_id} onChange={handleChange} disabled={isSubmitting.current} required>
                <option value="">매장 선택</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
              <p className="signup-loading">매장 로드 중...</p>
            )}
          </div>

          <div className="signup-checkbox-group">
            <label className="signup-checkbox">
              <input type="checkbox" value="privacy" checked={form.consent.privacy} onChange={handleChange} required />
              <span>개인정보 수집 동의 (필수)</span>
            </label>
            <label className="signup-checkbox">
              <input type="checkbox" value="marketing" checked={form.consent.marketing} onChange={handleChange} />
              <span>마케팅 수신 동의 (선택)</span>
            </label>
          </div>

          {error && <div className="signup-error">{error}</div>}

          <button
            type="submit"
            disabled={isSubmitting.current || stores.length === 0}
            className={`signup-button ${isSubmitting.current ? 'loading' : ''}`}
          >
            {isSubmitting.current ? (
              <>가입 중...</>
            ) : (
              '회원가입'
            )}
          </button>
        </form>

        <p className="signup-login-link">
          이미 계정이 있나요? <a href="/">로그인하기</a>
        </p>
      </div>

      <ToastContainer theme="colored" position="top-center" autoClose={3000} />
    </div>
  );
}

export default SignUp;