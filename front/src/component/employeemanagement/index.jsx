import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { BASE_URL } from '../../config';
import './index.css';

function EmployeeManagement() {
  const [employees, setEmployees] = useState([]);
  const [stores, setStores] = useState([]);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [error, setError] = useState('');

  // 직원 및 매장 목록 가져오기
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        const [employeesResponse, storesResponse] = await Promise.all([
          axios.get(`${BASE_URL}/admin/employees`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${BASE_URL}/stores`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        setEmployees(employeesResponse.data);
        setStores(storesResponse.data);
      } catch (err) {
        console.error('Error fetching employees or stores:', err);
        setError('데이터를 불러올 수 없습니다.');
        toast.error('데이터를 불러올 수 없습니다.');
      }
    };
    fetchData();
  }, []);

  const handleEdit = (employee) => {
    setEditingEmployee({ ...employee });
  };

  const handleCancelEdit = () => {
    setEditingEmployee(null);
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee.name || !editingEmployee.userId || !editingEmployee.birthdate || !editingEmployee.phone || !editingEmployee.store_id) {
      setError('모든 필드를 입력하세요.');
      toast.error('모든 필드를 입력하세요.');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/admin/employees/${editingEmployee.id}`,
        {
          name: editingEmployee.name,
          userId: editingEmployee.userId,
          birthdate: editingEmployee.birthdate,
          phone: editingEmployee.phone,
          store_id: parseInt(editingEmployee.store_id),
          isAdmin: editingEmployee.isAdmin
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmployees(
        employees.map((emp) =>
          emp.id === editingEmployee.id ? { ...editingEmployee } : emp
        )
      );
      setEditingEmployee(null);
      setError('');
      toast.success('직원 정보가 수정되었습니다.');
    } catch (err) {
      const errorMessage = err.response?.data?.message || '직원 정보 수정 실패';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말로 이 직원을 삭제하시겠습니까?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${BASE_URL}/admin/employees/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmployees(employees.filter((emp) => emp.id !== id));
      setError('');
      toast.success('직원이 삭제되었습니다.');
    } catch (err) {
      const errorMessage = err.response?.data?.message || '직원 삭제 실패';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleToggleAdmin = async (id, currentAdminStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${BASE_URL}/admin/employees/${id}/admin`,
        { isAdmin: !currentAdminStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmployees(
        employees.map((emp) =>
          emp.id === id ? { ...emp, isAdmin: !currentAdminStatus } : emp
        )
      );
      setError('');
      toast.success(`관리자 권한이 ${!currentAdminStatus ? '부여' : '해제'}되었습니다.`);
    } catch (err) {
      const errorMessage = err.response?.data?.message || '관리자 권한 수정 실패';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  };

  return (
    <div className="employee-management-container">
      <h1 className="title">직원 관리</h1>
      {error && <p className="error-message">{error}</p>}
      <div className="employee-list">
        {employees.map((employee) => (
          <div key={employee.id} className="employee-item">
            {editingEmployee && editingEmployee.id === employee.id ? (
              <div className="edit-form">
                <div className="form-group">
                  <label>이름</label>
                  <input
                    type="text"
                    value={editingEmployee.name}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, name: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>아이디</label>
                  <input
                    type="text"
                    value={editingEmployee.userId}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, userId: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>생년월일</label>
                  <input
                    type="text"
                    value={editingEmployee.birthdate}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, birthdate: e.target.value })
                    }
                    placeholder="YYYYMMDD"
                  />
                </div>
                <div className="form-group">
                  <label>전화번호</label>
                  <input
                    type="text"
                    value={editingEmployee.phone}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, phone: e.target.value })
                    }
                    placeholder="010XXXXXXXX"
                  />
                </div>
                <div className="form-group">
                  <label>매장</label>
                  <select
                    value={editingEmployee.store_id}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, store_id: e.target.value })
                    }
                  >
                    <option value="">매장을 선택하세요</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>관리자 권한</label>
                  <input
                    type="checkbox"
                    checked={editingEmployee.isAdmin}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, isAdmin: e.target.checked })
                    }
                  />
                </div>
                <div className="button-group">
                  <button className="save-button" onClick={handleSaveEdit}>
                    저장
                  </button>
                  <button className="cancel-button" onClick={handleCancelEdit}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="employee-details">
                <span>
                  {employee.name} ({employee.userId}) - {employee.birthdate}, {employee.phone},{' '}
                  {stores.find((s) => s.id === employee.store_id)?.name || 'Unknown Store'},{' '}
                  {employee.isAdmin ? '관리자' : '직원'}
                </span>
                <div className="action-buttons">
                  <button className="edit-button" onClick={() => handleEdit(employee)}>
                    수정
                  </button>
                  <button className="delete-button" onClick={() => handleDelete(employee.id)}>
                    삭제
                  </button>
                  <button
                    className="admin-button"
                    onClick={() => handleToggleAdmin(employee.id, employee.isAdmin)}
                  >
                    {employee.isAdmin ? '관리자 해제' : '관리자 부여'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
    </div>
  );
}

export default EmployeeManagement;