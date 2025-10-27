import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter , Router, Routes, Route, Navigate } from 'react-router-dom';

import Main from './pages/Apply'
import Login from './pages/Login'
import Join from './pages/Signup'
import Admin from './pages/Admin'
import EmployeeManagement from './pages/EmployeeManagement'
import ScheduleManagement from './pages/ScheduleManagement'
import StoreManagement from './pages/StoreManagement'
import Myschedules from './pages/Myschedules'
import Notices from './pages/Notices'
import NoticeCreate from './pages/NoticeCreate'
import Requests from './pages/Requests'
import RequestsList from './pages/RequestsList'
import { getToken } from './utils/auth';

const root = ReactDOM.createRoot(document.getElementById('root'));

function ProtectedRoute({ children, isAdmin }) {
  const token = getToken();
  if (!token) return <Navigate to="/" />;
  if (isAdmin) {
    const decoded = require('jwt-decode')(token);
    if (!decoded.isAdmin) return <Navigate to="/myschedules" />;
  }
  return children;
}

root.render(
  <React.StrictMode>
    <BrowserRouter>

      <Routes>
        <Route path='/Apply' exact={true} element={<Main />}></Route>

        <Route path='/AdminDashboard' exact={true} element={<Admin />}></Route>
        <Route path='/EmployeeManagement' exact={true} element={<EmployeeManagement />}></Route>
        <Route path='/ScheduleManagement' exact={true} element={<ScheduleManagement />}></Route>
        <Route path='/StoreManagement' exact={true} element={<StoreManagement />}></Route>

        <Route path='/' exact={true} element={<Login />}></Route>
        <Route path='/signup' exact={true} element={<Join />}></Route>
        <Route path='/Myschedules' exact={true} element={<Myschedules />}></Route>

        <Route path="/notices" element={<ProtectedRoute><Notices /></ProtectedRoute>} />
        <Route path="/NoticeCreate" element={<ProtectedRoute><NoticeCreate /></ProtectedRoute>} />

        <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
        <Route path="/RequestsList" element={<ProtectedRoute><RequestsList /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" />} />


      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();