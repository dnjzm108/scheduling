import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Main from './pages/Apply'
import Login from './pages/Login'
import Join from './pages/Join'
import Admin from './pages/Admin'
import EmployeeManagement from './pages/EmployeeManagement'
import ScheduleManagement from './pages/ScheduleManagement'
import Myschedules from './pages/Myschedules'

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>


    <BrowserRouter>

      <Routes>
        <Route path='/Apply' exact={true} element={<Main />}></Route>

        <Route path='/admin' exact={true} element={<Admin />}></Route>
        <Route path='/EmployeeManagement' exact={true} element={<EmployeeManagement />}></Route>
        <Route path='/ScheduleManagement' exact={true} element={<ScheduleManagement />}></Route>

        <Route path='/' exact={true} element={<Login />}></Route>
        <Route path='/Join' exact={true} element={<Join />}></Route>
        <Route path='/Myschedules' exact={true} element={<Myschedules />}></Route>
  

      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
