// server/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createDatabaseAndPool } = require('./config/db');
const initDB = require('./utils/initDB');
const API_URL = process.env.API_URL || 'http://localhost:3000';
// const { assignWorkers } = require('./utils/assigner');

const app = express();
const PORT = process.env.PORT || 5001;


console.log(API_URL)
// 미들웨어
app.use(cors({ origin: API_URL }));
app.use(express.json({ limit: '10mb' }));
app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));
app.use('/api', rateLimit({
  windowMs: 1 * 60 * 1000, // 15분
  max: 100, // IP당 100회
  message: { message: '너무 많은 요청입니다. 잠시 후 다시 시도하세요.' },
  standardHeaders: true,
  legacyHeaders: false
}));

// 라우터 등록
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/stores', require('./routes/store'));
app.use('/api/notices', require('./routes/notice'));
app.use('/api/requests', require('./routes/request'));
app.use('/api/schedules', require('./routes/schedule'));
app.use('/api/payroll', require('./routes/payroll'));
app.use('/api/sections', require('./routes/sections'));
app.use('/api/store-sales', require('./routes/storeSales'));

// 서버 시작
async function startServer() {
  try {
    const pool = await createDatabaseAndPool();
    await initDB(pool);
    app.set('db', pool);
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    process.exit(1);
  }
}

startServer();