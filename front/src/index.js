// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';
import { getToken } from './utils/auth';
import { jwtDecode } from 'jwt-decode';

// 페이지 임포트
import Login from './pages/Login';
import Join from './pages/Signup';
import Main from './pages/Apply';
import Admin from './pages/Admin';
import EmployeeManagement from './pages/EmployeeManagement';
import ScheduleManagement from './pages/ScheduleManagement';
import StoreManagement from './pages/StoreManagement';
import Myschedules from './pages/Myschedules';
import Notices from './pages/Notices';
import NoticeCreate from './pages/NoticeCreate';
import Requests from './pages/Requests';
import RequestsList from './pages/RequestsList';
import ScheduleSettings from './pages/ScheduleSettings';
import DaySettings from './pages/DaySettings';
import SchedulePreview from './pages/SchedulePreview';
import PayrollCheck from './pages/PayrollCheck';
import ScheduleFinalize from './pages/ScheduleFinalize';
import SectionManagement from './pages/SectionManagement';
import Mypayroll from './pages/Mypayroll';
import StoreSales from './pages/StoreSales';
import UserEdit from './pages/UserEdit';

// 전역 요청 취소 함수 임포트
import { cancelAllRequests } from './utils/api';

const root = ReactDOM.createRoot(document.getElementById('root'));

// level 기반 권한 체크 컴포넌트
const ProtectedRoute = ({ children, minLevel = 1 }) => {
  const token = getToken();

  if (!token || token.trim() === '') {
    return <Navigate to="/" replace />;
  }

  try {
    const { level } = jwtDecode(token);
    if (level < minLevel) {
      return <Navigate to="/myschedules" replace />;
    }
    return children;
  } catch (err) {
    return <Navigate to="/" replace />;
  }
};

// 페이지 이동 시 이전 요청 모두 취소하는 컴포넌트
const RequestCleaner = () => {
  const location = useLocation();

  React.useEffect(() => {
    // 페이지 이동할 때마다 이전 페이지의 모든 API 요청 취소
    return () => {
      cancelAllRequests();
    };
  }, [location.pathname]);

  return null;
};

// 페이지 라우트 정의
const routes = [
  { path: '/', element: <Login /> },
  { path: '/signup', element: <Join /> },
  { path: '/apply', element: <Main /> },
  { path: '/myschedules', element: <Myschedules />, minLevel: 1 },
  { path: '/Mypayroll', element: <Mypayroll />, minLevel: 1 },

  // 직원 이상
  { path: '/notices', element: <Notices />, minLevel: 1 },
  { path: '/NoticeCreate', element: <NoticeCreate />, minLevel: 2 },
  { path: '/requests', element: <Requests />, minLevel: 1 },
  { path: '/UserEdit', element: <UserEdit />, minLevel: 1 },
  { path: '/RequestsList', element: <RequestsList />, minLevel: 2 },

  // 매장관리자 이상
  { path: '/ScheduleManagement', element: <ScheduleManagement />, minLevel: 2 },
  { path: '/EmployeeManagement', element: <EmployeeManagement />, minLevel: 2 },
  { path: '/ScheduleSettings', element: <ScheduleSettings />, minLevel: 2 },
  { path: '/DaySettings', element: <DaySettings />, minLevel: 2 },
  { path: '/PayrollCheck', element: <PayrollCheck />, minLevel: 2 },
  { path: '/schedule-finalize/:scheduleId', element: <ScheduleFinalize />, minLevel: 2 },
  { path: '/SectionManagement', element: <SectionManagement />, minLevel: 2 },
  { path: '/StoreSales', element: <StoreSales />, minLevel: 2 },

  // 총관리자 전용
  { path: '/AdminDashboard', element: <Admin />, minLevel: 3 },
  { path: '/StoreManagement', element: <StoreManagement />, minLevel: 3 },

  // 미리보기
  { path: '/SchedulePreview', element: <SchedulePreview />, minLevel: 2 },

  // 404
  { path: '*', element: <Navigate to="/" replace /> }
];

root.render(
  <React.StrictMode>
    <BrowserRouter>
      {/* 전역 요청 취소 컴포넌트 */}
      <RequestCleaner />
      
      <Routes>
        {routes.map(({ path, element, minLevel = 0 }) => (
          <Route
            key={path}
            path={path}
            element={
              minLevel > 0 ? (
                <ProtectedRoute minLevel={minLevel}>{element}</ProtectedRoute>
              ) : (
                element
              )
            }
          />
        ))}
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();