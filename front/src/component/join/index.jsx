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
    confirmPassword: '',
    store_id: ''
  });
  const [stores, setStores] = useState([]);
  const [errors, setErrors] = useState({});
  const [isUserIdValid, setIsUserIdValid] = useState(null);
  const [isCheckingUserId, setIsCheckingUserId] = useState(false);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await axios.get(`${BASE_URL}/stores`);
        setStores(response.data);
        if (response.data.length > 0) {
          setFormData(prev => ({ ...prev, store_id: response.data[0].id }));
        }
      } catch (err) {
        console.error('매장 목록 불러오기 실패:', err);
        toast.error(err.response?.data?.message || '매장 목록을 불러올 수 없습니다.');
      }
    };
    fetchStores();
  }, []);

  // 생년월일 포맷팅 (YYYYMMDD → YYYY-MM-DD)
  const formatBirthdate = (value) => {
    const digits = value.replace(/\D/g, ''); // 숫자만 추출
    console.log('Birthdate input:', value, 'Digits:', digits); // 디버깅 로그
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  };

  // 전화번호 포맷팅 (01012345678 → 010-1234-5678)
  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, ''); // 숫자만 추출
    console.log('Phone input:', value, 'Digits:', digits); // 디버깅 로그
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
  };

  // 유효한 날짜인지 확인
  const isValidDate = (dateStr) => {
    const regex = /^(\d{4})-(\d{2})-(\d{2})$/;
    if (!regex.test(dateStr)) return false;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && year >= 1900 && date <= new Date();
  };

  // 아이디 중복 체크
  useEffect(() => {
    const checkUserId = async () => {
      if (!formData.userId || formData.userId.length < 4) {
        setIsUserIdValid(null);
        return;
      }
      setIsCheckingUserId(true);
      try {
        const response = await axios.get(`${BASE_URL}/check-userid`, { params: { userId: formData.userId } });
        setIsUserIdValid(!response.data.exists);
        setErrors(prev => ({ ...prev, userId: response.data.exists ? '이미 사용 중인 아이디입니다.' : '' }));
      } catch (err) {
        console.error('아이디 중복 체크 오류:', err);
        toast.error('아이디 중복 체크에 실패했습니다.');
      } finally {
        setIsCheckingUserId(false);
      }
    };
    const timeout = setTimeout(checkUserId, 500); // 디바운싱
    return () => clearTimeout(timeout);
  }, [formData.userId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    let formattedValue = value;

    if (name === 'birthdate') {
      formattedValue = formatBirthdate(value);
    } else if (name === 'phone') {
      formattedValue = formatPhone(value);
    }

    setFormData(prev => ({ ...prev, [name]: formattedValue }));
    
    // 실시간 유효성 검사
    const newErrors = { ...errors };
    if (name === 'name') {
      newErrors.name = /^[가-힣a-zA-Z]{2,20}$/.test(value) ? '' : '이름은 2~20자, 한글 또는 영문만 가능합니다.';
    } else if (name === 'userId') {
      newErrors.userId = /^[a-zA-Z0-9]{4,20}$/.test(value) ? '' : '아이디는 4~20자, 영문/숫자만 가능합니다.';
    } else if (name === 'birthdate') {
      newErrors.birthdate = isValidDate(formattedValue) ? '' : '유효한 생년월일(YYYY-MM-DD)을 입력하세요.';
    } else if (name === 'phone') {
      newErrors.phone = /^010-\d{4}-\d{4}$/.test(formattedValue) ? '' : '전화번호는 010-1234-5678 형식이어야 합니다.';
    } else if (name === 'password') {
      newErrors.password = value ? '' : '비밀번호를 입력하세요.';
    } else if (name === 'confirmPassword') {
      newErrors.confirmPassword = value === formData.password ? '' : '비밀번호가 일치하지 않습니다.';
    }
    setErrors(newErrors);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!formData.name) newErrors.name = '이름을 입력하세요.';
    else if (!/^[가-힣a-zA-Z]{2,20}$/.test(formData.name)) newErrors.name = '이름은 2~20자, 한글 또는 영문만 가능합니다.';

    if (!formData.userId) newErrors.userId = '아이디를 입력하세요.';
    else if (!/^[a-zA-Z0-9]{4,20}$/.test(formData.userId)) newErrors.userId = '아이디는 4~20자, 영문/숫자만 가능합니다.';
    else if (isUserIdValid === false) newErrors.userId = '이미 사용 중인 아이디입니다.';

    if (!formData.birthdate) newErrors.birthdate = '생년월일을 입력하세요.';
    else if (!isValidDate(formData.birthdate)) newErrors.birthdate = '유효한 생년월일(YYYY-MM-DD)을 입력하세요.';

    if (!formData.phone) newErrors.phone = '전화번호를 입력하세요.';
    else if (!/^010-\d{4}-\d{4}$/.test(formData.phone)) newErrors.phone = '전화번호는 010-1234-5678 형식이어야 합니다.';

    if (!formData.password) newErrors.password = '비밀번호를 입력하세요.';
    if (!formData.confirmPassword) newErrors.confirmPassword = '비밀번호 확인을 입력하세요.';
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = '비밀번호가 일치하지 않습니다.';

    if (!formData.store_id) newErrors.store_id = '매장을 선택하세요.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('입력 정보를 확인해주세요.');
      return;
    }

    try {
      const submitData = {
        ...formData,
        birthdate: formData.birthdate.replace(/-/g, ''),
        phone: formData.phone.replace(/-/g, '')
      };
      await axios.post(`${BASE_URL}/signup`, submitData);
      toast.success('회원가입 성공!');
      setTimeout(() => navigate('/'), 1000);
    } catch (err) {
      console.error('회원가입 오류:', err);
      const errorMessage = err.response?.data?.message || '회원가입에 실패했습니다.';
      toast.error(errorMessage);
      setErrors(prev => ({ ...prev, server: errorMessage }));
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="signup-container">
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
            placeholder="이름을 입력하세요"
          />
          {errors.name && <p className="error-message">{errors.name}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="userId">아이디</label>
          <input
            type="text"
            id="userId"
            name="userId"
            value={formData.userId}
            onChange={handleChange}
            placeholder="아이디를 입력하세요 (영문/숫자 4~20자)"
          />
          {isCheckingUserId && <p className="info-message">아이디 확인 중...</p>}
          {errors.userId && <p className="error-message">{errors.userId}</p>}
          {isUserIdValid && !isCheckingUserId && <p className="success-message">사용 가능한 아이디입니다.</p>}
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
            maxLength={10}
          />
          {errors.birthdate && <p className="error-message">{errors.birthdate}</p>}
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
            maxLength={13}
          />
          {errors.phone && <p className="error-message">{errors.phone}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="password">비밀번호</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="비밀번호를 입력하세요"
          />
          {errors.password && <p className="error-message">{errors.password}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">비밀번호 확인</label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            placeholder="비밀번호를 다시 입력하세요"
          />
          {errors.confirmPassword && <p className="error-message">{errors.confirmPassword}</p>}
        </div>
        <div className="form-group">
          <label htmlFor="store_id">매장 선택</label>
          <select
            id="store_id"
            name="store_id"
            value={formData.store_id}
            onChange={handleChange}
          >
            <option value="">매장을 선택하세요</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
          {errors.store_id && <p className="error-message">{errors.store_id}</p>}
        </div>
        {errors.server && <p className="error-message">{errors.server}</p>}
        <div className="button-group">
          <button type="submit" className="submit-button">회원가입</button>
          <button type="button" className="back-button" onClick={handleBack}>이전페이지</button>
        </div>
      </form>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default SignUp;