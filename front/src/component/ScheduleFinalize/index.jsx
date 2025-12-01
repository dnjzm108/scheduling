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

function getDefaultWorkArea(scheduleArea, userArea) {
  if (scheduleArea === 'hall' || scheduleArea === 'kitchen') return scheduleArea;
  if (userArea === 'hall' || userArea === 'kitchen') return userArea;
  return 'hall';
}

function formatHeaderWithDate(schedule, dayKey, index) {
  if (!schedule || !schedule.week_start) return dayLabels[dayKey];
  const base = new Date(schedule.week_start);
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
  const [requests, setRequests] = useState([]);
  const [finalShifts, setFinalShifts] = useState({});
  const [activeUsers, setActiveUsers] = useState({});
  const [loading, setLoading] = useState(true);

  const [hallSections, setHallSections] = useState([]);
  const [kitchenSections, setKitchenSections] = useState([]);

  const [customRateEnabled, setCustomRateEnabled] = useState(false);
  const [rateMode, setRateMode] = useState("individual");
  const [dailyRate, setDailyRate] = useState({
    mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null
  });

  // 🔥 쉬는시간 커스텀 기능 상태
  const [customBreakEnabled, setCustomBreakEnabled] = useState(true);
  const [breakMode, setBreakMode] = useState("daily");
  const [dailyBreak, setDailyBreak] = useState({
    mon: 60, tue: 60, wed: 60, thu: 60, fri: 60, sat: 60, sun: 60
  });


  const [hasAssigned, setHasAssigned] = useState(false);
  const [addUserId, setAddUserId] = useState("");

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;

    const token = getToken();
    if (!token || !scheduleId) {
      toast.error("잘못된 접근입니다.");
      navigate("/ScheduleManagement");
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        const [schedRes, reqRes, assignedRes] = await Promise.all([
          api.get(`/api/schedules/${scheduleId}`),
          api.get(`/api/schedules/${scheduleId}/applicants`),
          api.get(`/api/schedules/${scheduleId}/assigned`)
        ]);

        const scheduleData = schedRes.data;
        const requestsData = reqRes.data || [];
        const assignedData = assignedRes.data || [];

        if (!scheduleData) {
          toast.error("스케줄을 찾을 수 없습니다.");
          navigate("/ScheduleManagement");
          return;
        }

        const [hallRes, kitchenRes] = await Promise.all([
          api.get(`/api/sections/hall?store_id=${scheduleData.store_id}`),
          api.get(`/api/sections/kitchen?store_id=${scheduleData.store_id}`)
        ]);

        setSchedule(scheduleData);
        setRequests(requestsData);
        setHallSections(hallRes.data || []);
        setKitchenSections(kitchenRes.data || []);

        const start = new Date(scheduleData.week_start);
        start.setHours(0, 0, 0, 0);

        // ======================================================
        // 확정된 스케줄이 있는 경우
        // ======================================================
        if (assignedData.length > 0) {
          setHasAssigned(true);

          const final = {};

          assignedData.forEach((a) => {
            console.log(a);

            const uid = a.user_id.toString();
            if (!final[uid]) final[uid] = {};

            const d = new Date(a.work_date);
            d.setHours(0, 0, 0, 0);

            const idx = Math.floor((d - start) / 86400000);
            if (idx < 0 || idx > 6) return;

            const dayKey = days[idx];

            final[uid][dayKey] = {
              type: a.shift_type === "full" ? "full" : "part",
              start: a.start_time?.slice(0, 5) || "",
              end: a.end_time?.slice(0, 5) || "",
              break_minutes: a.break_minutes ?? 60,
              work_area: a.work_area || "hall",
              section_name: a.section_name || null,
              custom_hourly_rate: a.custom_hourly_rate ?? null
            };
          });

          setFinalShifts(final);

          // 시급 자동 판정
          // 🔥 쉬는시간 자동 판정
          let breakIsDaily = true;
          const detectedBreak = {
            mon: 60, tue: 60, wed: 60, thu: 60,
            fri: 60, sat: 60, sun: 60
          };

          days.forEach((day) => {
            const breaks = [];

            Object.values(final).forEach((userDays) => {
              const shift = userDays[day];
              const br = shift ? shift.break_minutes : 60;
              breaks.push(br);
            });

            if (breaks.length === 0) return;

            const first = breaks[0];
            const allSame = breaks.every((v) => v === first);

            if (!allSame) {
              breakIsDaily = false;
              detectedBreak[day] = 60;
            } else {
              detectedBreak[day] = first;
            }
          });

          // 🔥 breakMode / dailyBreak 자동 설정
          setDailyBreak(detectedBreak);
          setBreakMode(breakIsDaily ? "daily" : "individual");
          setCustomBreakEnabled(true);  // 쉬는시간 기능 활성화


          const anyActualRate = assignedData.some((a) => a.custom_hourly_rate != null);
          setCustomRateEnabled(anyActualRate);

          const active = {};
          Object.keys(final).forEach((id) => (active[id] = true));
          setActiveUsers(active);

          return;
        }

        // ======================================================
        // 확정 없음 → 신청 정보로 초기 세팅
        // ======================================================
        const initial = {};
        const active = {};

        requestsData.forEach((r) => {
          const uid = r.id.toString();
          const baseArea = getDefaultWorkArea(scheduleData.work_area, r.work_area);

          initial[uid] = {};
          let hasWork = false;

          days.forEach((day) => {
            const type = r[`${day}_type`] || "off";
            if (type !== "off") hasWork = true;

            initial[uid][day] = {
              type,
              start: r[`${day}_start`] || "",
              end: r[`${day}_end`] || "",
              break_minutes: r[`${day}_break`] ?? 60,
              work_area: baseArea,
              section_name: null,
              custom_hourly_rate: null
            };
          });

          if (hasWork) active[uid] = true;
        });

        setFinalShifts(initial);
        setActiveUsers(active);

      } catch (err) {
        if (!axios.isCancel(err)) {
          toast.error("데이터 로드 실패");
          navigate("/ScheduleManagement");
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [scheduleId, navigate]);

  const handleShiftChange = (userId, day, field, value) => {
    const id = userId.toString();

    setFinalShifts((prev) => {
      const userObj = prev[id] || {};
      const prevDay = userObj[day] || {
        type: "off",
        start: "",
        end: "",
        break_minutes: 60,
        work_area: getDefaultWorkArea(schedule?.work_area, null),
        section_name: null,
        custom_hourly_rate: null
      };

      if (field === "custom_hourly_rate" && rateMode === "individual") {
        setDailyRate((prev) => ({ ...prev, [day]: null }));
      }

      return {
        ...prev,
        [id]: {
          ...userObj,
          [day]: {
            ...prevDay,
            [field]: value
          }
        }
      };
    });
  };

  const handleAddUser = () => {
    if (!addUserId) return;

    setFinalShifts((prev) => {
      if (prev[addUserId]) return prev;

      const user = requests.find((u) => u.id.toString() === addUserId);
      const baseArea = getDefaultWorkArea(schedule?.work_area, user.work_area);

      const dayObj = {};
      days.forEach((day) => {
        dayObj[day] = {
          type: "off",
          start: "",
          end: "",
          break_minutes: 60,
          work_area: baseArea,
          section_name: null,
          custom_hourly_rate: null
        };
      });

      return { ...prev, [addUserId]: dayObj };
    });

    setActiveUsers((prev) => ({ ...prev, [addUserId]: true }));
  };

  const handleRemoveUser = (userId) => {
    setActiveUsers((prev) => ({ ...prev, [userId.toString()]: false }));
  };

  const handleSave = async () => {
    const clean = {};

    Object.entries(finalShifts).forEach(([uid, daysObj]) => {
      if (!activeUsers[uid]) return;

      clean[uid] = {};

      Object.entries(daysObj).forEach(([day, shift]) => {
        if (!shift || shift.type === "off") {
          clean[uid][day] = { type: "off" };
        } else {
          clean[uid][day] = {
            type: shift.type,
            start: shift.start || null,
            end: shift.end || null,
            break_minutes: shift.break_minutes ?? 60,
            work_area:
              schedule.work_area !== "both"
                ? schedule.work_area
                : shift.work_area || "hall",
            section_name: shift.section_name || null,
            custom_hourly_rate: shift.custom_hourly_rate || null
          };
        }
      });
    });

    try {
      await api.post(`/api/schedules/${scheduleId}/finalize`, { shifts: clean });
      toast.success(hasAssigned ? "스케줄 수정 완료!" : "스케줄 확정 완료!");
      setTimeout(() => navigate("/ScheduleManagement"), 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || "저장 실패");
    }
  };

  const renderSectionSelect = (shift, onChange) => {
    const area = schedule.work_area !== "both"
      ? schedule.work_area
      : shift.work_area || "hall";

    const list = area === "kitchen" ? kitchenSections : hallSections;

    return (
      <select value={shift.section_name || ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">섹션 없음</option>
        {list.map((sec) => (
          <option key={sec.id} value={sec.name}>{sec.name}</option>
        ))}
      </select>
    );
  };

  if (loading || !schedule) {
    return <div className="loading">로딩 중...</div>;
  }

  const scheduleArea = schedule.work_area || "both";
  const filteredUsers = requests.filter((u) => activeUsers[u.id.toString()]);
  const inactiveUsers = requests.filter((u) => !activeUsers[u.id.toString()]);

  const getSectionColor = (name) => {
    if (!name) return "transparent";
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 85%)`;
  };

  return (
    <div className="finalize-page">
      <Header title="스케줄 확정" backTo="/ScheduleManagement" />

      <div className="page-with-header">
        <div className="finalize-container">
          <div className="finalize-header">
            <h1>{schedule.store_name} 스케줄 확정</h1>

            {/* 시급 설정 */}
            <div className="rate-controls">
              <button
                type="button"
                className={customRateEnabled ? "btn-on" : ""}
                onClick={() => setCustomRateEnabled((prev) => !prev)}
              >
                시급 수정 {customRateEnabled ? "ON" : "OFF"}
              </button>

              {customRateEnabled && (
                <select value={rateMode} onChange={(e) => setRateMode(e.target.value)} className="rate-mode-select">
                  <option value="individual">개인별</option>
                  <option value="daily">요일 동일</option>
                </select>
              )}
            </div>

            {/* 🔥 쉬는시간 설정 */}
            <div className="break-controls">
              <button
                type="button"
                className={customBreakEnabled ? "btn-on" : ""}
                onClick={() => {
                  // 기본적으로 ON 상태이므로 모드만 daily ↔ individual 전환
                  setBreakMode(prev => prev === "daily" ? "individual" : "daily");
                }}
              >
                쉬는시간 {breakMode === "daily" ? "개별 입력" : "일괄 입력"}
              </button>



            </div>

            <p>
              {schedule.week_start} ~ {schedule.week_end}{" "}
              {scheduleArea === "both" ? "(홀/주방 전체)" : scheduleArea === "hall" ? "(홀)" : "(주방)"}
            </p>

            <div className="finalize-controls">
              <div className="add-employee">
                <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                  <option value="">직원 추가</option>
                  {inactiveUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button onClick={handleAddUser} className="btn-add">추가</button>
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

                {/* 🔥 요일 시급 */}
                {customRateEnabled && rateMode === "daily" && (
                  <tr className="daily-rate-row">
                    <td style={{ fontWeight: "bold" }}>요일 시급</td>
                    {days.map((day) => (
                      <td key={day}>
                        <input
                          type="number"
                          value={dailyRate[day] ?? ""}
                          placeholder="시급"
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            setDailyRate((prev) => ({ ...prev, [day]: v }));
                            filteredUsers.forEach((u) =>
                              handleShiftChange(u.id, day, "custom_hourly_rate", v)
                            );
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                )}

                {/* 🔥 요일 쉬는시간 */}
                {customBreakEnabled && breakMode === "daily" && (
                  <tr className="daily-break-row">
                    <td style={{ fontWeight: "bold" }}>요일 쉬는시간</td>
                    {days.map((day) => (
                      <td key={day}>
                        <input
                          type="number"
                          value={dailyBreak[day] ?? 60}
                          placeholder="분"
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : 60;
                            setDailyBreak((prev) => ({ ...prev, [day]: v }));
                            filteredUsers.forEach((u) =>
                              handleShiftChange(u.id, day, "break_minutes", v)
                            );
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                )}

                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={days.length + 1} style={{ textAlign: "center" }}>
                      표시할 직원이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const uid = user.id.toString();

                    return (
                      <tr key={user.id}>
                        <td className="employee-name">
                          {user.name}
                          <button type="button" className="btn-remove-user" onClick={() => handleRemoveUser(user.id)}>
                            ✕
                          </button>
                        </td>

                        {days.map((day) => {
                          const shift = finalShifts[uid]?.[day] || {
                            type: "off",
                            start: "",
                            end: "",
                            break_minutes: 60,
                            work_area: getDefaultWorkArea(scheduleArea, user.work_area),
                            section_name: null,
                            custom_hourly_rate: null
                          };

                          return (
                            <td
                              key={day}
                              style={{
                                backgroundColor:
                                  shift.type !== "off" ? getSectionColor(shift.section_name) : "transparent"
                              }}
                            >
                              <div className="shift-editor">

                                {/* 근무타입 */}
                                <select
                                  value={shift.type}
                                  onChange={(e) => handleShiftChange(user.id, day, "type", e.target.value)}
                                >
                                  <option value="full">풀타임</option>
                                  <option value="part">파트타임</option>
                                  <option value="off">휴무</option>
                                </select>

                                {shift.type !== "off" && (
                                  <>
                                    {/* 홀/주방 */}
                                    {scheduleArea === "both" ? (
                                      <select
                                        value={shift.work_area}
                                        onChange={(e) =>
                                          handleShiftChange(user.id, day, "work_area", e.target.value)
                                        }
                                      >
                                        <option value="hall">홀</option>
                                        <option value="kitchen">주방</option>
                                      </select>
                                    ) : (
                                      <span className="fixed-area-label">
                                        {scheduleArea === "hall" ? "홀" : "주방"}
                                      </span>
                                    )}

                                    {/* 섹션 */}
                                    {renderSectionSelect(
                                      shift,
                                      (val) => handleShiftChange(user.id, day, "section_name", val)
                                    )}

                                    {/* 시급(개인 모드일 때만) */}
                                    {customRateEnabled && rateMode === "individual" && (
                                      <input
                                        type="number"
                                        placeholder="시급"
                                        value={shift.custom_hourly_rate ?? ""}
                                        onChange={(e) =>
                                          handleShiftChange(
                                            user.id,
                                            day,
                                            "custom_hourly_rate",
                                            e.target.value ? Number(e.target.value) : null
                                          )
                                        }
                                      />
                                    )}

                                    {/* 파트타임 시간 */}
                                    {shift.type === "part" && (
                                      <div className="time-range">
                                        <input
                                          type="time"
                                          value={shift.start}
                                          onChange={(e) => handleShiftChange(user.id, day, "start", e.target.value)}
                                        />
                                        <input
                                          type="time"
                                          value={shift.end}
                                          onChange={(e) => handleShiftChange(user.id, day, "end", e.target.value)}
                                        />
                                      </div>
                                    )}

                                    {/* 🔥 쉬는시간(개별 모드일 때만 표시) */}
                                    {customBreakEnabled && breakMode === "individual" && (
                                      <div className="break-input">
                                        쉬는시간:
                                        <input
                                          type="number"
                                          placeholder="쉬는시간(분)"
                                          value={shift.break_minutes ?? 60}
                                          onChange={(e) =>
                                            handleShiftChange(
                                              user.id,
                                              day,
                                              "break_minutes",
                                              e.target.value ? Number(e.target.value) : 60
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
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="finalize-actions">
            <button onClick={() => navigate("/ScheduleManagement")} className="btn-cancel">
              취소
            </button>
            <button onClick={handleSave} className="btn-save">
              {hasAssigned ? "스케줄 수정하기" : "스케줄 확정하기"}
            </button>
          </div>
        </div>
      </div>

      <ToastContainer position="top-center" theme="colored" autoClose={4000} />
    </div>
  );
}

export default ScheduleFinalize;
