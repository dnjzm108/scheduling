// server/middleware/levelMiddleware.js
const requireLevel = (minLevel) => (req, res, next) => {
  if (!req.user || req.user.level < minLevel) {
    const roles = ['미승인', '직원', '매장관리자', '총관리자'];
    return res.status(403).json({ message: `${roles[minLevel]} 이상 필요` });
  }
  next();
};

module.exports = {
  employee: requireLevel(1),
  storeAdmin: requireLevel(2),   // 이 이름 정확히!
  globalAdmin: requireLevel(3),
  requireLevel
};