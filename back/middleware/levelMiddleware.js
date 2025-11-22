// server/middleware/levelMiddleware.js
const requireLevel = (minLevel) => (req, res, next) => {
  if (!req.user || req.user.level < minLevel) {
    const roles = ['미승인', '알바', '직원', '매장관리자', '총관리자'];
    return res.status(403).json({ message: `${roles[minLevel] || '권한'} 이상 필요` });
  }
  next();
};

module.exports = {
  employee: requireLevel(1),      // 알바 이상
  staff: requireLevel(2),         // 직원 이상 (필요하면 사용)
  storeAdmin: requireLevel(3),    // 매장관리자 이상
  globalAdmin: requireLevel(4),   // 총관리자만
  requireLevel
};
