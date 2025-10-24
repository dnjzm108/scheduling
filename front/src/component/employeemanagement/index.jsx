import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './index.css';

function EmployeeManagement() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([
    { id: 1, name: '홍길동', userId: 'hong123', password: 'pass123', birthdate: '19900101', phone: '01012345678' },
    { id: 2, name: '김철수', userId: 'kim456', password: 'pass456', birthdate: '19950215', phone: '01098765432' },
    // 추가 직원 데이터 (DB에서 불러올 수 있음)
  ]);
  const [editingId, setEditingId] = useState(null);
  const [editedData, setEditedData] = useState({});

  const handleLogout = () => {
    navigate('/');
  };

  const handleBack = () => {
    navigate('/admin');
  };

  const handleEdit = (employee) => {
    setEditingId(employee.id);
    setEditedData(employee);
  };

  const handleSave = (id) => {
    setEmployees(prev => prev.map(emp => emp.id === id ? editedData : emp));
    setEditingId(null);
  };

  const handleChange = (field, value) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = (id) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      setEmployees(prev => prev.filter(emp => emp.id !== id));
    }
  };

  return (
    <div className="employee-container">
      <div className="header">
        <h1 className="title">직원 관리</h1>
        <div className="admin-info">
          <span className="admin-name">관리자님</span>
          <button className="logout-button" onClick={handleLogout}>로그아웃</button>
        </div>
      </div>
      <button className="back-button" onClick={handleBack}>이전 페이지로 돌아가기</button>
      <table className="employee-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>아이디</th>
            <th>비밀번호</th>
            <th>생년월일</th>
            <th>전화번호</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id}>
              {editingId === emp.id ? (
                <>
                  <td><input value={editedData.name} onChange={(e) => handleChange('name', e.target.value)} /></td>
                  <td><input value={editedData.userId} onChange={(e) => handleChange('userId', e.target.value)} /></td>
                  <td><input type="password" value={editedData.password} onChange={(e) => handleChange('password', e.target.value)} /></td>
                  <td><input value={editedData.birthdate} onChange={(e) => handleChange('birthdate', e.target.value)} /></td>
                  <td><input value={editedData.phone} onChange={(e) => handleChange('phone', e.target.value)} /></td>
                  <td>
                    <button className="save-button" onClick={() => handleSave(emp.id)}>저장</button>
                    <button className="cancel-button" onClick={() => setEditingId(null)}>취소</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{emp.name}</td>
                  <td>{emp.userId}</td>
                  <td>{emp.password}</td>
                  <td>{emp.birthdate}</td>
                  <td>{emp.phone}</td>
                  <td>
                    <button className="edit-button" onClick={() => handleEdit(emp)}>수정</button>
                    <button className="delete-button" onClick={() => handleDelete(emp.id)}>삭제</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default EmployeeManagement;