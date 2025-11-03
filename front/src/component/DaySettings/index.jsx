// src/components/DaySettings/index.jsx
import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getToken } from '../../utils/auth';
import { BASE_URL } from '../../config';

const dayTypes = [
  { value: 'weekday', label: '평일 (월~금)' },
  { value: 'weekend', label: '주말 (토~일)' },
  { value: 'holiday', label: '공휴일' }
];

function DaySettings({ storeId, onClose }) {
  const [settings, setSettings] = useState(
    dayTypes.map(t => ({
      day_type: t.value,
      open_time: '10:00',
      close_time: '22:00',
      break_start: t.value === 'weekday' ? '15:00' : '',
      break_end: t.value === 'weekday' ? '17:00' : '',
      lunch_staff: 4,
      dinner_staff: 6
    }))
  );

  const handleChange = (index, field, value) => {
    const newSettings = [...settings];
    newSettings[index][field] = value;
    setSettings(newSettings);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getToken();
    try {
      await axios.put(`${BASE_URL}/api/stores/${storeId}/settings/days`, settings, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('요일별 설정 저장 완료');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || '저장 실패');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="day-settings-form">
      <h3>요일별 운영 설정</h3>
      {settings.map((s, i) => (
        <div key={s.day_type} className="day-group">
          <h4>{dayTypes[i].label}</h4>
          <div className="form-row">
            <label>오픈</label>
            <input type="time" value={s.open_time} onChange={e => handleChange(i, 'open_time', e.target.value)} />
          </div>
          <div className="form-row">
            <label>마감</label>
            <input type="time" value={s.close_time} onChange={e => handleChange(i, 'close_time', e.target.value)} />
          </div>
          {s.day_type === 'weekday' && (
            <>
              <div className="form-row">
                <label>브레이크</label>
                <input type="time" value={s.break_start} onChange={e => handleChange(i, 'break_start', e.target.value)} />
                <span>~</span>
                <input type="time" value={s.break_end} onChange={e => handleChange(i, 'break_end', e.target.value)} />
              </div>
            </>
          )}
          <div className="form-row">
            <label>런치 인원</label>
            <input type="number" min="0" value={s.lunch_staff} onChange={e => handleChange(i, 'lunch_staff', +e.target.value)} />
          </div>
          <div className="form-row">
            <label>디너 인원</label>
            <input type="number" min="0" value={s.dinner_staff} onChange={e => handleChange(i, 'dinner_staff', +e.target.value)} />
          </div>
        </div>
      ))}
      <button type="submit" className="btn-save">저장</button>
    </form>
  );
}

export default DaySettings;