// server/middleware/auth.js
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your_jwt_secret';

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: '토큰 없음' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = {
      id: decoded.id,
      name: decoded.name,
      level: decoded.level,
      store_id: decoded.store_id
    };
    next();
  } catch (err) {
    res.status(401).json({ message: '유효하지 않은 토큰' });
  }
};