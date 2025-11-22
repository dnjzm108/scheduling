// src/pages/ScheduleFinalize/index.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import api from '../../utils/api';
import axios from 'axios';
import { getToken } from '../../utils/auth';
import './index.css';

function ScheduleFinalize() {
  const navigate = useNavigate();
  const { scheduleId } = useParams();
  const hasLoaded = useRef(false);

  const [schedule, setSchedule] = useState(null);
  const [requests, setRequests] = useState([]);
  const [finalShifts, setFinalShifts] = useState({});
  const [loading, setLoading] = useState(true);

  // 섹션 목록
  const [hallSections, setHallSections] = useState([]);
  const [kitchenSections, setKitchenSections] = useState([]);

  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayLabels = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token || !scheduleId) {
      toast.error('잘못된 접근입니다.');
      return navigate('/ScheduleManagement');
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [schedRes, reqRes, hallRes, kitchenRes] = await Promise.all([
          api.get(`/api/schedules/${scheduleId}`),
          api.get(`/api/schedules/${scheduleId}/applicants`),
          api.get('/api/sections/hall'),
          api.get('/api/sections/kitchen')
        ]);

        const scheduleData = schedRes.data;
        const requestsData = reqRes.data || [];

        if (!scheduleData) {
          toast.error('스케줄을 찾을 수 없습니다.');
          return navigate('/ScheduleManagement');
        }

        setSchedule(scheduleData);
        setRequests(requestsData);
        setHallSections(hallRes.data || []);
        setKitchenSections(kitchenRes.data || []);

        // 초기값: 문자열 키 사용 + 방어 코드
        const initial = {};
        requestsData.forEach(r => {
          if (!r || !r.id) return;
          const userId = r.id.toString();
          initial[userId] = {};
          days.forEach(day => {
            const typeKey = `${day}_type`;
            if (r[typeKey] && r[typeKey] !== 'off') {
              initial[userId][day] = {
                type: r[typeKey],
                start: r[`${day}_start`] || '',
                end: r[`${day}_end`] || '',
                // 기본값: 홀 / 섹션 미지정
                work_area: 'hall',
                section_id: null,
              };
            }
          });
        });
        setFinalShifts(initial);
      } catch (err) {
        if (!axios.isCancel(err)) {
          toast.error('데이터 로드 실패');
          navigate('/ScheduleManagement');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [scheduleId, navigate]);

  const handleShiftChange = (userId, day, field, value) => {
    if (!userId) return;
    const id = userId.toString();
    setFinalShifts(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [day]: {
          // 기존 값 유지
          ...prev[id]?.[day],
          [field]: value
        }
      }
    }));
  };

  const handleSave = async () => {
    const cleanShifts = {};
    Object.entries(finalShifts).forEach(([userIdStr, daysObj]) => {
      const userId = parseInt(userIdStr, 10);
      if (isNaN(userId)) return;

      cleanShifts[userId] = {};
      Object.entries(daysObj || {}).forEach(([dayKey, shift]) => {
        if (!shift || shift.type === 'off') {
          cleanShifts[userId][dayKey] = { type: 'off' };
          return;
        }
        cleanShifts[userId][dayKey] = {
          type: shift.type,
          start: shift.start || null,
          end: shift.end || null,
          work_area: shift.work_area || 'hall',
          section_id: shift.section_id || null,
        };
      });
    });

    try {
      await api.post(`/api/schedules/${scheduleId}/finalize`, { shifts: cleanShifts });
      toast.success('스케줄 확정 완료!');
      setTimeout(() => navigate('/ScheduleManagement'), 1500);
    } catch (err) {
      if (!axios.isCancel(err)) {
        toast.error(err.response?.data?.message || '저장 실패');
      }
    }
  };

  const renderSectionSelect = (shift, onChange) => {
    const area = shift.work_area || 'hall';
    const list = area === 'kitchen' ? kitchenSections : hallSections;
    return (
      <select
        value={shift.section_id || ''}
        onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
      >
        <option value="">섹션 선택 없음</option>
        {list.map(sec => (
          <option key={sec.id} value={sec.id}>
            {sec.name}
          </option>
        ))}
      </select>
    );
  };

  // 로딩 중이거나 데이터 없으면 렌더링 방지
  if (loading || !schedule || requests.length === 0) {
    return <div className="loading">로딩 중...</div>;
  }

  return (
    <div className="finalize-page">
      <Header title="스케줄 확정" backTo="/ScheduleManagement" />

      <div className="page-with-header">
        <div className="finalize-container">
          <div className="finalize-header">
            <h1>{schedule.store_name} 스케줄 확정</h1>
            <p>{schedule.week_start} ~ {schedule.week_end}</p>
          </div>

          <div className="finalize-table-wrapper">
            <table className="finalize-table">
              <thead>
                <tr>
                  <th>직원</th>
                  {days.map(d => <th key={d}>{dayLabels[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {requests.map(user => {
                  if (!user || !user.id) return null;
                  const userIdStr = user.id.toString();

                  return (
                    <tr key={user.id}>
                      <td className="employee-name">{user.name || '이름 없음'}</td>
                      {days.map(day => {
                        const shift = finalShifts[userIdStr]?.[day];
                        if (!shift) {
                          return (
                            <td key={day}>
                              <span className="off-day">휴무</span>
                            </td>
                          );
                        }
                        return (
                          <td key={day}>
                            <div className="shift-editor">
                              {/* 근무타입 */}
                              <select
                                value={shift.type || 'off'}
                                onChange={e => handleShiftChange(user.id, day, 'type', e.target.value)}
                              >
                                <option value="full">풀타임</option>
                                <option value="part">파트타임</option>
                                <option value="off">휴무</option>
                              </select>

                              {/* type이 off 가 아니면 나머지 표시 */}
                              {shift.type !== 'off' && (
                                <>
                                  {/* 파트 선택: 홀/주방 */}
                                  <select
                                    value={shift.work_area || 'hall'}
                                    onChange={e => handleShiftChange(user.id, day, 'work_area', e.target.value)}
                                  >
                                    <option value="hall">홀</option>
                                    <option value="kitchen">주방</option>
                                  </select>

                                  {/* 섹션 선택 */}
                                  {renderSectionSelect(shift, (val) =>
                                    handleShiftChange(user.id, day, 'section_id', val)
                                  )}

                                  {/* 파트타임일 때 시간 입력 */}
                                  {shift.type === 'part' && (
                                    <div className="time-range">
                                      <input
                                        type="time"
                                        value={shift.start || ''}
                                        onChange={e => handleShiftChange(user.id, day, 'start', e.target.value)}
                                      />
                                      <span>~</span>
                                      <input
                                        type="time"
                                        value={shift.end || ''}
                                        onChange={e => handleShiftChange(user.id, day, 'end', e.target.value)}
                                      />
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="finalize-actions">
            <button onClick={() => navigate('/ScheduleManagement')} className="btn-cancel">
              취소
            </button>
            <button onClick={handleSave} className="btn-save">
              스케줄 확정하기
            </button>
          </div>
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default ScheduleFinalize;
