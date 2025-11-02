// server/middleware/admin.js
module.exports = async (req, res, next) => {
  const pool = req.app.get('db');
  try {
    const [rows] = await pool.query('SELECT isAdmin FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]?.isAdmin) return res.status(403).json({ message: '관리자 권한 필요' });
    next();
  } catch (err) {
    res.status(500).json({ message: '권한 확인 실패' });
  }
};