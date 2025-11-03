// src/components/SchedulePreview/index.jsx (dnd-kit 제거 버전)
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getToken } from '../../utils/auth';
import { BASE_URL } from '../../config';

function SchedulePreview({ scheduleId, onClose }) {
  const [preview, setPreview] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPreview = async () => {
      const token = getToken();
      try {
        const res = await axios.get(`${BASE_URL}/api/schedules/${scheduleId}/preview`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPreview(res.data.preview);
      } catch (err) {
        toast.error('미리보기 불러오기 실패');
      } finally {
        setLoading(false);
      }
    };
    fetchPreview();
  }, [scheduleId]);

  const handleConfirm = async () => {
    const token = getToken();
    try {
      await axios.post(`${BASE_URL}/api/schedules/${scheduleId}/confirm`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('배치 확정 완료!');
      onClose();
    } catch (err) {
      toast.error('확정 실패');
    }
  };

  if (loading) return <div>로딩 중...</div>;

  return (
    <div className="schedule-preview">
      <h3>배치 미리보기</h3>
      {Object.entries(preview).map(([date, workers]) => (
        <div key={date} className="date-group">
          <h4>{date} ({workers.length}명)</h4>
          {workers.map((w, i) => (
            <div key={i} className="worker-item">
              <strong>{w.worker}</strong> - {w.time}
            </div>
          ))}
        </div>
      ))}
      <button onClick={handleConfirm} className="btn-confirm">최종 확정</button>
    </div>
  );
}

export default SchedulePreview;