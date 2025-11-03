// src/components/StoreSettings/index.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getToken } from '../../utils/auth';
import { BASE_URL } from '../../config';

function StoreSettings({ storeId, onClose }) {
  const [form, setForm] = useState({
    open_time: '10:00', close_time: '22:00',
    break_start: '', break_end: '',
    lunch_staff: 4, dinner_staff: 6,
    is_weekend_break: false
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = getToken();
        const res = await axios.get(`${BASE_URL}/api/stores/${storeId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = res.data;
        setForm({
          open_time: data.open_time?.slice(0,5) || '10:00',
          close_time: data.close_time?.slice(0,5) || '22:00',
          break_start: data.break_start?.slice(0,5) || '',
          break_end: data.break_end?.slice(0,5) || '',
          lunch_staff: data.lunch_staff || 4,
          dinner_staff: data.dinner_staff || 6,
          is_weekend_break: data.is_weekend_break === 1
        });
      } catch (err) {
        toast.error('설정 불러오기 실패');
      }
    };
    fetchSettings();
  }, [storeId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();
    try {
      await axios.put(`${BASE_URL}/api/stores/${storeId}/settings`, form, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('매장 설정 저장 완료');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || '저장 실패');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="store-settings-form">
      <h3>매장 운영 설정</h3>
      <div className="form-row">
        <label>오픈 시간</label>
        <input type="time" value={form.open_time} onChange={e => setForm({...form, open_time: e.target.value})} />
      </div>
      <div className="form-row">
        <label>마감 시간</label>
        <input type="time" value={form.close_time} onChange={e => setForm({...form, close_time: e.target.value})} />
      </div>
      <div className="form-row">
        <label>브레이크 타임</label>
        <input type="time" value={form.break_start} onChange={e => setForm({...form, break_start: e.target.value})} />
        <span>~</span>
        <input type="time" value={form.break_end} onChange={e => setForm({...form, break_end: e.target.value})} />
      </div>
      <div className="form-row">
        <label>런치 필요 인원</label>
        <input type="number" min="0" value={form.lunch_staff} onChange={e => setForm({...form, lunch_staff: +e.target.value})} />
      </div>
      <div className="form-row">
        <label>디너 필요 인원</label>
        <input type="number" min="0" value={form.dinner_staff} onChange={e => setForm({...form, dinner_staff: +e.target.value})} />
      </div>
      <div className="form-row">
        <label>
          <input type="checkbox" checked={form.is_weekend_break} onChange={e => setForm({...form, is_weekend_break: e.target.checked})} />
          주말 브레이크 타임 없음
        </label>
      </div>
      <button type="submit" className="btn-save">저장</button>
    </form>
  );
}

export default StoreSettings;