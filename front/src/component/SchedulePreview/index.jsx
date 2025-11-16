// src/component/SchedulePreview/index.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { BASE_URL } from '../../config';
import { getToken } from '../../utils/auth';
import './index.css';

function SchedulePreview({ scheduleId, onClose }) {
  const [applicants, setApplicants] = useState([]);
  const [scheduleInfo, setScheduleInfo] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const token = getToken();
      try {
        const [infoRes, applicantsRes] = await Promise.all([
          axios.get(`${BASE_URL}/api/schedules/${scheduleId}`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${BASE_URL}/api/schedules/${scheduleId}/applicants`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setScheduleInfo(infoRes.data);

        // 입사일 순으로 정렬 (hire_date 오름차순)
        const sortedApplicants = (applicantsRes.data || []).sort((a, b) => {
          if (!a.hire_date) return 1;
          if (!b.hire_date) return -1;
          return a.hire_date.localeCompare(b.hire_date);
        });

        setApplicants(sortedApplicants);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [scheduleId]);

  const exportToExcel = () => {
    const data = applicants.map(a => ({
      이름: a.name,
      월: formatDay(a.mon_type, a.mon_start, a.mon_end),
      화: formatDay(a.tue_type, a.tue_start, a.tue_end),
      수: formatDay(a.wed_type, a.wed_start, a.wed_end),
      목: formatDay(a.thu_type, a.thu_start, a.thu_end),
      금: formatDay(a.fri_type, a.fri_start, a.fri_end),
      토: formatDay(a.sat_type, a.sat_start, a.sat_end),
      일: formatDay(a.sun_type, a.sun_start, a.sun_end)
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    
    // 열 너비 조정
    ws['!cols'] = [
      { wch: 10 }, { wch: 15 }, { wch: 15 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, scheduleInfo.week_start);
    
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(blob, `${scheduleInfo.store_name}_${scheduleInfo.week_start}_신청내역.xlsx`);
  };

  // 휴무는 빈칸으로 반환
  const formatDay = (type, start, end) => {
    if (type === 'full') return '풀타임';
    if (type === 'part') return `${start?.slice(0,5)}~${end?.slice(0,5)}`;
    return ''; // 휴무 → 빈칸
  };

  if (loading) return <div className="preview-loading">로딩 중...</div>;

  return (
    <div className="preview-container">
      <h2>{scheduleInfo.store_name}</h2>
      <p className="preview-period">{scheduleInfo.week_start} ~ {scheduleInfo.week_end}</p>
      
      <button onClick={exportToExcel} className="excel-download-btn">
        엑셀 다운로드
      </button>

      <table className="applicants-table">
        <thead>
          <tr>
            <th>이름</th>
            <th>아이디</th>
            <th>전화번호</th>
            <th>월</th><th>화</th><th>수</th><th>목</th><th>금</th><th>토</th><th>일</th>
          </tr>
        </thead>
        <tbody>
          {applicants.map((a, i) => (
            <tr key={i}>
              <td>{a.name}</td>
              <td>{a.userId}</td>
              <td>{a.phone}</td>
              <td>{formatDay(a.mon_type, a.mon_start, a.mon_end)}</td>
              <td>{formatDay(a.tue_type, a.tue_start, a.tue_end)}</td>
              <td>{formatDay(a.wed_type, a.wed_start, a.wed_end)}</td>
              <td>{formatDay(a.thu_type, a.thu_start, a.thu_end)}</td>
              <td>{formatDay(a.fri_type, a.fri_start, a.fri_end)}</td>
              <td>{formatDay(a.sat_type, a.sat_start, a.sat_end)}</td>
              <td>{formatDay(a.sun_type, a.sun_start, a.sun_end)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SchedulePreview;