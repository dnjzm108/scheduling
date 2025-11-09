// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

const root = ReactDOM.createRoot(document.getElementById('root'));

// level 기반 권한 체크 컴포넌트
const ProtectedRoute = ({ children, minLevel = 1 }) => {
  const token = getToken();
  if (!token) return <Navigate to="/" replace />;

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

// 페이지별 최소 level
const routes = [
  { path: '/', element: <Login /> },
  { path: '/signup', element: <Join /> },
  { path: '/apply', element: <Main /> },
  { path: '/myschedules', element: <Myschedules />, minLevel: 1 },

  // 직원 이상 (level >= 1)
  { path: '/notices', element: <Notices />, minLevel: 1 },
  { path: '/NoticeCreate', element: <NoticeCreate />, minLevel: 2 },
  { path: '/requests', element: <Requests />, minLevel: 1 },
  { path: '/RequestsList', element: <RequestsList />, minLevel: 2 },

  // 매장관리자 이상 (level >= 2)
  { path: '/ScheduleManagement', element: <ScheduleManagement />, minLevel: 2 },
  { path: '/EmployeeManagement', element: <EmployeeManagement />, minLevel: 2 },
  { path: '/ScheduleSettings', element: <ScheduleSettings />, minLevel: 2 },
  { path: '/DaySettings', element: <DaySettings />, minLevel: 2 },

  // 총관리자 전용 (level === 3)
  { path: '/AdminDashboard', element: <Admin />, minLevel: 3 },
  { path: '/StoreManagement', element: <StoreManagement />, minLevel: 3 },

  // 미리보기 (매장관리자 이상)
  { path: '/SchedulePreview', element: <SchedulePreview />, minLevel: 2 },

  // 404
  { path: '*', element: <Navigate to="/" replace /> }
];

root.render(
  <React.StrictMode>
    <BrowserRouter>
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