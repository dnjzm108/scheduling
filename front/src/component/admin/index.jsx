// src/pages/AdminDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';
import './index.css';

function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState({ name: '', level: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      toast.error('로그인 필요');
      return setTimeout(() => navigate('/'), 2000);
    }

    axios
      .get(`${BASE_URL}/api/user`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((res) => {
        setUser({
          name: res.data.name || '관리자',
          level: res.data.level
        });
      })
      .catch(() => {
        toast.error('정보 로드 실패');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  // ---------------------------------------------------------------------
  // 메뉴 카테고리 (아이템별 권한 설정 포함)
  // ---------------------------------------------------------------------
  const categories = [
    {
      title: '스케줄 관리',
      items: [
        { label: '스케줄 관리', path: '/ScheduleManagement' }
      ]
    },
    {
      title: '직원 관리',
      items: [
        { label: '직원 관리', path: '/EmployeeManagement' },
        { label: '월급정산 관리', path: '/PayrollCheck' }
      ]
    },

    // ⭐ 하나의 카테고리 안에서 "총관리자만" vs "매장 관리자 이상" 설정
    {
      title: '매장 관리',
      items: [
        { 
          label: '매장 관리', 
          path: '/StoreManagement', 
          allowedLevels: [4]  // 총관리자만 
        },
        { 
          label: '매장 매출 관리', 
          path: '/StoreSales',
          minLevel: 3  // 매장관리자(level=3) 이상 모두
        }
      ]
    },

    {
      title: '공지 / 건의사항',
      items: [
        { label: '공지사항 관리', path: '/notices' },
        { label: '건의사항 관리', path: '/RequestsList' }
      ]
    },
    {
      title: '설정',
      items: [
        { label: '섹션 관리', path: '/SectionManagement' }
      ]
    }
  ];

  return (
    <div className="admin-container">
      <Header title="관리자 대시보드" showBack={false} />

      <div className="admin-content page-with-header">
        <div className="admin-card">

          {loading ? (
            <div className="admin-loading">로딩 중...</div>
          ) : (
            <div className="admin-category-wrap">

              {categories.map((cat, idx) => (
                <div key={idx} className="admin-category">
                  <h3 className="admin-category-title">{cat.title}</h3>

                  <div className="admin-grid">
                    {cat.items.map((item, i) => {
                      
                      // -----------------------------
                      // ⭐ 개별 아이템 권한 체크
                      // -----------------------------

                      // 특정 레벨만 허용
                      if (item.allowedLevels && !item.allowedLevels.includes(user.level)) {
                        return null;
                      }

                      // 특정 레벨 이상만 허용
                      if (item.minLevel && user.level < item.minLevel) {
                        return null;
                      }

                      return (
                        <button
                          key={i}
                          className="admin-menu-btn"
                          onClick={() => navigate(item.path)}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

            </div>
          )}
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default AdminDashboard;
