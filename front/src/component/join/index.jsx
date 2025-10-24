import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // 추가: 서버 요청
import { toast, ToastContainer } from 'react-toastify'; // 추가: 알림
import 'react-toastify/dist/ReactToastify.css'; // 추가: 알림 스타일
import './index.css';

function SignUp() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [userId, setUserId] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    // 생년월일: YYYYMMDD → YYYY-MM-DD
    const formatBirthdate = (input) => {
        const cleaned = input.replace(/[^0-9]/g, '').slice(0, 8);
        if (cleaned.length >= 4) {
            let year = cleaned.slice(0, 4);
            let month = cleaned.slice(4, 6);
            let day = cleaned.slice(6, 8);
            if (month && parseInt(month) > 12) month = '12';
            if (day && parseInt(day) > 31) day = '31';
            let formatted = year;
            if (month) formatted += '-' + month;
            if (day) formatted += '-' + day;
            return formatted;
        }
        return cleaned;
    };

    // 전화번호: 010XXXXXXXX → 010-XXXX-XXXX
    const formatPhone = (input) => {
        const cleaned = input.replace(/[^0-9]/g, '').slice(0, 11);
        if (cleaned.length >= 3) {
            let formatted = cleaned.slice(0, 3);
            if (cleaned.length > 3) formatted += '-' + cleaned.slice(3, 7);
            if (cleaned.length > 7) formatted += '-' + cleaned.slice(7, 11);
            return formatted;
        }
        return cleaned;
    };

    const handleBirthdateChange = (e) => {
        setBirthdate(formatBirthdate(e.target.value));
    };

    const handlePhoneChange = (e) => {
        setPhone(formatPhone(e.target.value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // 유효성 검사
        if (userId.length < 4) {
            setError('아이디는 최소 4자리 이상이어야 합니다.');
            toast.error('아이디는 최소 4자리 이상이어야 합니다.');
            return;
        }
        if (password !== confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.');
            toast.error('비밀번호가 일치하지 않습니다.');
            return;
        }
        const cleanedBirthdate = birthdate.replace(/-/g, '');
        if (cleanedBirthdate.length !== 8) {
            setError('생년월일을 8자리로 입력하세요 (예: 19950810).');
            toast.error('생년월일을 8자리로 입력하세요.');
            return;
        }
        const cleanedPhone = phone.replace(/-/g, '');
        if (!cleanedPhone.startsWith('010') || cleanedPhone.length !== 11) {
            setError('전화번호는 010으로 시작하는 11자리 숫자여야 합니다.');
            toast.error('전화번호는 010으로 시작하는 11자리 숫자여야 합니다.');
            return;
        }

        // 서버로 데이터 전송
        try {
            console.log(  {name,
                userId,
                birthdate: cleanedBirthdate,
                phone: cleanedPhone,
                password});
            
            const response = await axios.post('http://localhost:5001/signup', {
                name,
                userId,
                birthdate: cleanedBirthdate,
                phone: cleanedPhone,
                password
            });
            setError('');
            toast.success('회원가입 성공! 로그인 페이지로 이동합니다.');
            console.log('회원가입 성공:', response.data);
            setTimeout(() => navigate('/'), 2000); // 2초 후 로그인 페이지로 이동
        } catch (err) {
            const errorMessage = err.response?.data?.message || '회원가입 실패: 서버 오류';
            setError(errorMessage);
            toast.error(errorMessage);
            console.error('회원가입 오류:', err);
        }
    };

    return (
        <div className="signup-container">
            <h1 className="title">회원가입</h1>
            {error && <p className="error-message">{error}</p>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="name">이름</label>
                    <input
                        type="text"
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="이름을 입력하세요"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="userId">아이디</label>
                    <input
                        type="text"
                        id="userId"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        required
                        placeholder="아이디를 입력하세요 (4자리 이상)"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="birthdate">생년월일</label>
                    <input
                        type="text"
                        id="birthdate"
                        value={birthdate}
                        onChange={handleBirthdateChange}
                        required
                        placeholder="YYYYMMDD (예: 19950810)"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="phone">전화번호</label>
                    <input
                        type="text"
                        id="phone"
                        value={phone}
                        onChange={handlePhoneChange}
                        required
                        placeholder="010XXXXXXXX (예: 01082829999)"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">비밀번호</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="비밀번호를 입력하세요"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="confirm-password">비밀번호 확인</label>
                    <input
                        type="password"
                        id="confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="비밀번호를 다시 입력하세요"
                    />
                </div>
                <button type="submit" className="submit-button">회원가입</button>
                <button type="button" className="back-button" onClick={() => navigate('/')}>
                    로그인 페이지로 돌아가기
                </button>
            </form>
            <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
        </div>
    );
}

export default SignUp;