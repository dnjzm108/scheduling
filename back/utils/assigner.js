// server/utils/assigner.js
function getDatesInWeek(weekStart) {
  const dates = [];
  const start = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getDayType(date) {
  const d = new Date(date);
  const day = d.getDay();
  // 주말: 0(일), 6(토)
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

function assignWorkers(applications, needByDate, storeSettings) {
  const assigned = [];

  // 날짜별 신청자 그룹화
  const byDate = {};
  for (const app of applications) {
    const date = app.date;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(app);
  }

  // 각 날짜별 배치
  for (const [date, workers] of Object.entries(byDate)) {
    const need = needByDate[date];
    const lunchNeed = need.lunch;
    const dinnerNeed = need.dinner;

    // 시간대 분류 (런치: 11~15, 디너: 17~22)
    const lunch = workers.filter(w => {
      const start = parseInt(w.start_time.replace(':', ''));
      return start <= 1500;
    });
    const dinner = workers.filter(w => {
      const end = parseInt(w.end_time.replace(':', ''));
      return end >= 1700;
    });

    // 필요 인원만큼 배치
    assigned.push(...lunch.slice(0, lunchNeed).map(w => ({ ...w })));
    assigned.push(...dinner.slice(0, dinnerNeed).map(w => ({ ...w })));
  }

  return assigned;
}

module.exports = { getDatesInWeek, getDayType, assignWorkers };