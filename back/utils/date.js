// server/utils/date.js (또는 routes 안에)
const formatDate = (date) => {
  if (!date) return null;
  
  // MySQL DATE/DATETIME을 KST 문자열로 변환
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`; // 2025-11-17
};

const formatTime = (time) => time ? time.slice(0, 5) : null;

module.exports = {formatDate,formatTime};