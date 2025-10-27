import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import { getToken, removeToken } from '../../utils/auth';
import './index.css';

function EmployeeManagement() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [stores, setStores] = useState([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editingPassword, setEditingPassword] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인이 필요합니다.');
      setTimeout(() => navigate('/'), 2000);
      return;
    }

    const fetchData = async () => {
      try {
        setError('');
        const [userRes, employeesRes, storesRes] = await Promise.all([
          axios.get(`${BASE_URL}/user`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/users`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/stores`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        console.log('User:', userRes.data);
        console.log('Employees:', employeesRes.data);
        console.log('Stores:', storesRes.data);
        setUserName(userRes.data.name || '사용자');
        setEmployees(employeesRes.data || []);
        setStores(storesRes.data || []);
      } catch (err) {
        console.error('Fetch error:', {
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
        });
        const errorMessage =
          err.response?.status === 401
            ? '세션이 만료되었습니다. 다시 로그인하세요.'
            : err.response?.status === 403
            ? '관리자 권한이 필요합니다.'
            : err.response?.data?.message || '데이터 불러오기 실패';
        setError(errorMessage);
        toast.error(errorMessage);
        if (err.response?.status === 401 || err.response?.status === 403) {
          removeToken();
          setTimeout(() => navigate('/'), 2000);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [navigate]);

  const handleEdit = (employee) => {
    setEditingEmployee({ ...employee });
    setEditingPassword(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const token = getToken();
    if (!editingEmployee.name || !editingEmployee.phone) {
      toast.error('이름과 전화번호는 필수 입력 항목입니다.');
      return;
    }
    try {
      await axios.put(
        `${BASE_URL}/users/${editingEmployee.id}`,
        editingEmployee,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmployees(
        employees.map((emp) =>
          emp.id === editingEmployee.id ? editingEmployee : emp
        )
      );
      setEditingEmployee(null);
      toast.success('직원 정보 수정 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '직원 정보 수정 실패');
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    const token = getToken();
    if (!editingPassword.newPassword) {
      toast.error('새 비밀번호를 입력하세요.');
      return;
    }
    try {
      await axios.put(
        `${BASE_URL}/users/${editingPassword.id}/password`,
        { password: editingPassword.newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingPassword(null);
      toast.success('비밀번호 수정 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '비밀번호 수정 실패');
    }
  };

  const handleToggleAdmin = async (userId, isAdmin) => {
    const token = getToken();
    try {
      await axios.put(
        `${BASE_URL}/users/${userId}/admin`,
        { isAdmin: !isAdmin },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmployees(
        employees.map((emp) =>
          emp.id === userId ? { ...emp, isAdmin: !isAdmin } : emp
        )
      );
      toast.success(`관리자 권한 ${!isAdmin ? '부여' : '해제'} 완료`);
    } catch (err) {
      toast.error(err.response?.data?.message || '관리자 권한 수정 실패');
    }
  };

  const handleDelete = async (userId) => {
    const token = getToken();
    try {
      await axios.delete(`${BASE_URL}/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(employees.filter((emp) => emp.id !== userId));
      toast.success('직원 삭제 완료');
    } catch (err) {
      toast.error(err.response?.data?.message || '직원 삭제 실패');
    }
  };

  const handleLogout = () => {
    removeToken();
    toast.success('로그아웃되었습니다.');
    setTimeout(() => navigate('/'), 2000);
  };

  return (
    <div className="container">
      <header className="header">
        <button className="back-button" onClick={() => navigate('/AdminDashboard')}>
          이전 페이지
        </button>
        <div className="user-info">
          <span>{userName}님</span>
          <button className="logout-button" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="main-content">
        <h1 className="title">직원 관리</h1>
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="loading">로딩 중...</p>
        ) : employees.length === 0 ? (
          <p className="no-data">등록된 직원이 없습니다.</p>
        ) : (
          <ul className="employee-list">
            {employees.map((emp) => (
              <li key={emp.id} className="employee-item">
                {editingEmployee && editingEmployee.id === emp.id ? (
                  <form onSubmit={handleSave} className="edit-form">
                    <input
                      type="text"
                      value={editingEmployee.name}
                      onChange={(e) =>
                        setEditingEmployee({
                          ...editingEmployee,
                          name: e.target.value,
                        })
                      }
                      placeholder="이름"
                      required
                    />
                    <input
                      type="text"
                      value={editingEmployee.birthdate}
                      onChange={(e) =>
                        setEditingEmployee({
                          ...editingEmployee,
                          birthdate: e.target.value,
                        })
                      }
                      placeholder="생년월일 (YYYYMMDD)"
                    />
                    <input
                      type="text"
                      value={editingEmployee.phone}
                      onChange={(e) =>
                        setEditingEmployee({
                          ...editingEmployee,
                          phone: e.target.value,
                        })
                      }
                      placeholder="전화번호"
                      required
                    />
                    <select
                      value={editingEmployee.store_id || ''}
                      onChange={(e) =>
                        setEditingEmployee({
                          ...editingEmployee,
                          store_id: parseInt(e.target.value, 10),
                        })
                      }
                    >
                      <option value="">매장 선택</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <div className="form-buttons">
                      <button type="submit" className="save-button">
                        저장
                      </button>
                      <button
                        type="button"
                        className="cancel-button"
                        onClick={() => setEditingEmployee(null)}
                      >
                        취소
                      </button>
                    </div>
                  </form>
                ) : editingPassword && editingPassword.id === emp.id ? (
                  <form onSubmit={handlePasswordSave} className="password-form">
                    <input
                      type="password"
                      placeholder="새 비밀번호"
                      onChange={(e) =>
                        setEditingPassword({
                          ...editingPassword,
                          newPassword: e.target.value,
                        })
                      }
                      required
                    />
                    <div className="form-buttons">
                      <button type="submit" className="save-button">
                        저장
                      </button>
                      <button
                        type="button"
                        className="cancel-button"
                        onClick={() => setEditingPassword(null)}
                      >
                        취소
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="employee-details">
                    <span className="employee-name">{emp.name}</span>
                    <span className="employee-id">({emp.userId})</span>
                    <span className="employee-phone">전화: {emp.phone}</span>
                    <span className="employee-store">
                      {stores.find((s) => s.id === emp.store_id)?.name ||
                        'Unknown Store'}
                    </span>
                    <span className="employee-role">
                      권한: {emp.isAdmin ? '관리자' : '일반 사용자'}
                    </span>
                    <span className="employee-date">
                      가입일: {new Date(emp.signup_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
                <div className="employee-actions">
                  <button
                    className="edit-button"
                    onClick={() => handleEdit(emp)}
                  >
                    수정
                  </button>
                  <button
                    className="password-button"
                    onClick={() => {
                      setEditingPassword(emp);
                      setEditingEmployee(null);
                    }}
                  >
                    비밀번호 수정
                  </button>
                  <button
                    className="admin-toggle-button"
                    onClick={() => handleToggleAdmin(emp.id, emp.isAdmin)}
                  >
                    {emp.isAdmin ? '관리자 해제' : '관리자 부여'}
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => handleDelete(emp.id)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default EmployeeManagement;