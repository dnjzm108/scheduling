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

const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayLabels = { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' };

// 스케줄/직원 기준 기본 work_area 결정
function getDefaultWorkArea(scheduleArea, userArea) {
  // 스케줄이 hall/kitchen 이면 그 값으로 고정
  if (scheduleArea === 'hall' || scheduleArea === 'kitchen') return scheduleArea;

  // 스케줄이 both (전체) 일 때는 직원 소속 우선
  if (userArea === 'hall' || userArea === 'kitchen') return userArea;

  // 둘 다 아니면 기본값 hall
  return 'hall';
}

// 헤더: 요일 + 날짜(월/일) 표시
function formatHeaderWithDate(schedule, dayKey, index) {
  if (!schedule || !schedule.week_start) return dayLabels[dayKey];

  const base = new Date(schedule.week_start); // 'YYYY-MM-DD'
  if (Number.isNaN(base.getTime())) return dayLabels[dayKey];

  base.setDate(base.getDate() + index);
  const m = base.getMonth() + 1;
  const d = base.getDate();
  return `${dayLabels[dayKey]} (${m}/${d})`;
}

function ScheduleFinalize() {
  const navigate = useNavigate();
  const { scheduleId } = useParams();
  const hasLoaded = useRef(false);

  const [schedule, setSchedule] = useState(null);
  const [requests, setRequests] = useState([]);          // 매장 직원 전체 (신청 정보 포함)
  const [finalShifts, setFinalShifts] = useState({});    // { [userId]: { mon: {...}, ... } }
  const [activeUsers, setActiveUsers] = useState({});    // { [userId]: true/false }
  const [loading, setLoading] = useState(true);

  // 섹션 목록
  const [hallSections, setHallSections] = useState([]);
  const [kitchenSections, setKitchenSections] = useState([]);

  // 프론트 검색 제거 → 검색 state 삭제
  // 추가용 드롭다운 (비활성 직원들에서 추가)
  const [addUserId, setAddUserId] = useState('');

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token || !scheduleId) {
      toast.error('잘못된 접근입니다.');
      navigate('/ScheduleManagement');
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        const [schedRes, reqRes] = await Promise.all([
          api.get(`/api/schedules/${scheduleId}`),
          api.get(`/api/schedules/${scheduleId}/applicants`),
        ]);
            const [hallRes, kitchenRes] = await Promise.all([
          api.get(`/api/sections/hall?store_id=${schedRes.data.store_id}`),
          api.get(`/api/sections/kitchen?store_id=`),
        ]);

        const scheduleData = schedRes.data;
        const requestsData = reqRes.data || [];

        if (!scheduleData) {
          toast.error('스케줄을 찾을 수 없습니다.');
          navigate('/ScheduleManagement');
          return;
        }

        setSchedule(scheduleData);
        setRequests(requestsData);
        setHallSections(hallRes.data || []);
        setKitchenSections(kitchenRes.data || []);

        // 초기값 세팅: 직원별 요일 데이터 (휴무 포함)
        const initial = {};
        const active = {};

        requestsData.forEach((r) => {
          if (!r || !r.id) return;
          const userIdStr = r.id.toString();
          initial[userIdStr] = {};

          const userArea = r.work_area || 'both';
          const baseArea = getDefaultWorkArea(scheduleData.work_area, userArea);

          let hasAnyWork = false;

          days.forEach((day) => {
            const typeKey = `${day}_type`;
            const type = r[typeKey] || 'off';
            if (type && type !== 'off') hasAnyWork = true;

            initial[userIdStr][day] = {
              type,
              start: r[`${day}_start`] || '',
              end: r[`${day}_end`] || '',
              work_area: baseArea,
              section_name: null, // 섹션은 새로 선택
            };
          });

          // 신청한 적 있는 직원은 기본 활성화
          if (hasAnyWork) {
            active[userIdStr] = true;
          }
        });

        setFinalShifts(initial);
        setActiveUsers(active);
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

  // 셀 내용 변경
  const handleShiftChange = (userId, day, field, value) => {
    if (!userId) return;
    const id = userId.toString();

    setFinalShifts((prev) => {
      const userObj = prev[id] || {};
      const prevDay =
        userObj[day] || {
          type: 'off',
          start: '',
          end: '',
          work_area: getDefaultWorkArea(schedule?.work_area, null),
          section_name: null,
        };

      // 스케줄이 hall/kitchen으로 고정된 경우 work_area 변경 무시
      if (
        field === 'work_area' &&
        schedule?.work_area &&
        schedule.work_area !== 'both'
      ) {
        return prev;
      }

      return {
        ...prev,
        [id]: {
          ...userObj,
          [day]: {
            ...prevDay,
            [field]: value,
          },
        },
      };
    });
  };

  // 확정 대상에 직원 추가 (프론트에서 “추가” 버튼)
  const handleAddUser = () => {
    if (!addUserId) return;

    setFinalShifts((prev) => {
      if (prev[addUserId]) {
        // 이미 셀이 있는 직원이면 그대로 사용
        return prev;
      }
      const user = requests.find(
        (u) => u && u.id && u.id.toString() === addUserId
      );
      if (!user) return prev;

      const userArea = user.work_area || 'both';
      const baseArea = getDefaultWorkArea(schedule?.work_area, userArea);
      const dayObj = {};

      days.forEach((day) => {
        dayObj[day] = {
          type: 'off',
          start: '',
          end: '',
          work_area: baseArea,
          section_name: null,
        };
      });

      return {
        ...prev,
        [addUserId]: dayObj,
      };
    });

    setActiveUsers((prev) => ({
      ...prev,
      [addUserId]: true,
    }));
  };

  // 확정 대상에서 직원 제거 (DB에서는 그냥 안 넣음)
  const handleRemoveUser = (userId) => {
    const idStr = userId.toString();
    setActiveUsers((prev) => ({
      ...prev,
      [idStr]: false,
    }));
  };

  // 저장 요청
  const handleSave = async () => {
    const cleanShifts = {};
    Object.entries(finalShifts).forEach(([userIdStr, daysObj]) => {
      if (!activeUsers[userIdStr]) return; // 비활성 직원 제외

      const userId = parseInt(userIdStr, 10);
      if (Number.isNaN(userId)) return;

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
          work_area:
            schedule?.work_area && schedule.work_area !== 'both'
              ? schedule.work_area
              : shift.work_area || 'hall',
          section_name: shift.section_name || null,
        };
      });
    });

    try {
      await api.post(`/api/schedules/${scheduleId}/finalize`, {
        shifts: cleanShifts,
      });
      toast.success('스케줄 확정 완료!');
      setTimeout(() => navigate('/ScheduleManagement'), 1500);
    } catch (err) {
      if (!axios.isCancel(err)) {
        toast.error(err.response?.data?.message || '저장 실패');
      }
    }
  };

  // 섹션 셀 렌더 - 현재 work_area + 스케줄영역 기준으로 리스트 선택
  const renderSectionSelect = (shift, onChange) => {
    const scheduleArea = schedule?.work_area || 'both';
    const area =
      scheduleArea !== 'both' ? scheduleArea : shift.work_area || 'hall';

    const list = area === 'kitchen' ? kitchenSections : hallSections;

    return (
      <select
        value={shift.section_name || ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">섹션 선택 없음</option>
        {list.map((sec) => (
          <option key={sec.id} value={sec.name}>
            {sec.name}
          </option>
        ))}
      </select>
    );
  };

  if (loading || !schedule) {
    return <div className="loading">로딩 중...</div>;
  }

  const scheduleArea = schedule.work_area || 'both';

  // 검색 기능 제거 → activeUsers 기준으로만 렌더
  const filteredUsers = requests.filter((u) => {
    if (!u || !u.id) return false;
    const idStr = u.id.toString();
    return !!activeUsers[idStr];
  });

  const inactiveUsers = requests.filter((u) => {
    if (!u || !u.id) return false;
    const idStr = u.id.toString();
    return !activeUsers[idStr];
  });

  // 문자열을 항상 같은 색상으로 변환
function getSectionColor(name) {
  if (!name) return 'transparent';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 85%)`; // 부드러운 파스텔
}


  return (
    <div className="finalize-page">
      <Header title="스케줄 확정" backTo="/ScheduleManagement" />

      <div className="page-with-header">
        <div className="finalize-container">
          <div className="finalize-header">
            <h1>{schedule.store_name} 스케줄 확정</h1>
            <p>
              {schedule.week_start} ~ {schedule.week_end}{' '}
              {scheduleArea === 'both'
                ? '(홀/주방 전체)'
                : scheduleArea === 'hall'
                ? '(홀 스케줄)'
                : '(주방 스케줄)'}
            </p>

            {/* 검색 기능 제거 → 직원 추가만 남김 */}
            <div className="finalize-controls">
              <div className="add-employee">
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                >
                  <option value="">직원 추가 선택</option>
                  {inactiveUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="btn-add"
                >
                  추가
                </button>
              </div>
            </div>
          </div>

          <div className="finalize-table-wrapper">
            <table className="finalize-table">
              <thead>
                <tr>
                  <th>직원</th>
                  {days.map((d, idx) => (
                    <th key={d}>{formatHeaderWithDate(schedule, d, idx)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 1} style={{ textAlign: 'center' }}>
                      표시할 직원이 없습니다. (상단 직원 추가에서 선택해 주세요)
                    </td>
                  </tr>
                )}

                {filteredUsers.map((user) => {
                  if (!user || !user.id) return null;
                  const userIdStr = user.id.toString();

                  return (
                    <tr key={user.id}>
                      <td className="employee-name">
                        {/* 직원 이름만 (파트 표기 X 선택) */}
                        {user.name || '이름 없음'}
                        <button
                          type="button"
                          className="btn-remove-user"
                          onClick={() => handleRemoveUser(user.id)}
                        >
                          ✕
                        </button>
                      </td>

                      {days.map((day) => {
                        const shift =
                          finalShifts[userIdStr]?.[day] ||
                          {
                            type: 'off',
                            start: '',
                            end: '',
                            work_area: getDefaultWorkArea(
                              scheduleArea,
                              user.work_area
                            ),
                            section_name: null,
                          };

                        return (
                          <td key={day} style={{
    backgroundColor:
      shift.type !== 'off' ? getSectionColor(shift.section_name) : 'transparent'
  }}>
                            <div className="shift-editor">
                              {/* 근무타입 */}
                              <select
                                value={shift.type || 'off'}
                                onChange={(e) =>
                                  handleShiftChange(
                                    user.id,
                                    day,
                                    'type',
                                    e.target.value
                                  )
                                }
                              >
                                <option value="full">풀타임</option>
                                <option value="part">파트타임</option>
                                <option value="off">휴무</option>
                              </select>

                              {shift.type !== 'off' && (
                                <>
                                  {/* work_area 선택: 스케줄이 both일 때만 홀/주방 선택 */}
                                  {scheduleArea === 'both' ? (
                                    <select
                                      value={shift.work_area || 'hall'}
                                      onChange={(e) =>
                                        handleShiftChange(
                                          user.id,
                                          day,
                                          'work_area',
                                          e.target.value
                                        )
                                      }
                                    >
                                      <option value="hall">홀</option>
                                      <option value="kitchen">주방</option>
                                    </select>
                                  ) : (
                                    <span className="fixed-area-label">
                                      {scheduleArea === 'hall' ? '홀' : '주방'}
                                    </span>
                                  )}

                                  {/* 섹션 선택 */}
                                  {renderSectionSelect(shift, (val) =>
                                    handleShiftChange(
                                      user.id,
                                      day,
                                      'section_name',
                                      val
                                    )
                                  )}

                                  {/* 🔥 파트타임 시간 입력 → 항상 잘 보이게 */}
                                  {shift.type === 'part' && (
                                    <div className="time-range">
                                      <input
                                        type="time"
                                        value={shift.start || ''}
                                        onChange={(e) =>
                                          handleShiftChange(
                                            user.id,
                                            day,
                                            'start',
                                            e.target.value
                                          )
                                        }
                                      />
                                      {/* <span>~</span> */}
                                      <input
                                        type="time"
                                        value={shift.end || ''}
                                        onChange={(e) =>
                                          handleShiftChange(
                                            user.id,
                                            day,
                                            'end',
                                            e.target.value
                                          )
                                        }
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
            <button
              onClick={() => navigate('/ScheduleManagement')}
              className="btn-cancel"
            >
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
