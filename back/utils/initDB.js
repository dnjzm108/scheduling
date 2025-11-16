// server/utils/initDB.js
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function initDB(pool) {
  let conn;
  try {
    conn = await pool.getConnection();
    const dbName = process.env.DB_DATABASE || 'shabu';
    await conn.query(`USE ${dbName}`);
    console.log(`DB 선택: ${dbName}`);

    // Uploads 폴더
    const uploadDir = path.join(__dirname, '../Uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Uploads 폴더 생성');
    }

    // 외래키 제거
    await dropAllForeignKeys(conn);

    // 테이블 생성 (순서 중요!)
    await Promise.all([
      createTable(conn, 'users', usersSchema),
      createTable(conn, 'stores', storesSchema),
      createTable(conn, 'schedules', schedulesSchema),
      createTable(conn, 'schedule_requests', scheduleRequestsSchema),
      createTable(conn, 'store_settings', storeSettingsSchema),
      createTable(conn, 'notices', noticesSchema),
      createTable(conn, 'requests', requestsSchema),
      createTable(conn, 'notifications', notificationsSchema),
      createTable(conn, 'audit_logs', auditLogsSchema),
    ]);

    // 외래키 복원
    await addAllForeignKeys(conn);

    // 초기 데이터
    await insertInitialData(conn);

    console.log('DB 초기화 완료! (최신 설계 + 에러 없음)');
  } catch (err) {
    console.error('DB 초기화 실패:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

// --- 외래키 제거 ---
async function dropAllForeignKeys(conn) {
  const tables = ['users', 'stores', 'schedules', 'schedule_requests', 'notices', 'requests'];
  for (const table of tables) {
    try {
      const [fks] = await conn.query(`
        SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      `, [table]);
      for (const { CONSTRAINT_NAME } of fks) {
        await conn.query(`ALTER TABLE ${table} DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
      }
    } catch (e) { /* 무시 */ }
  }
  console.log('외래키 제거 완료');
}

// --- 테이블 생성 헬퍼 ---
async function createTable(conn, name, schema) {
  await conn.query(schema);
  console.log(`${name} 테이블 생성`);
}

//회원 정보
const usersSchema = `CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  userId VARCHAR(30) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  birthdate CHAR(8),
  phone CHAR(11) UNIQUE,
  store_id INT,
  level TINYINT(1) DEFAULT 0 COMMENT '0:미승인, 1:직원, 2:매장관리자, 3:총관리자',
  hire_date CHAR(6) DEFAULT NULL COMMENT '입사일 (YYMMDD 형식, 예: 251116)',
  signup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  consent_records JSON,
  INDEX idx_userId (userId),
  INDEX idx_store (store_id),
  INDEX idx_hire_date (hire_date)  -- 입사일 순 정렬용 인덱스
)`;

const storesSchema = `CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  manager_id INT,
  open_time TIME DEFAULT '10:00:00',
  close_time TIME DEFAULT '22:00:00',
  lunch_staff INT DEFAULT 4,
  dinner_staff INT DEFAULT 6,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

const schedulesSchema = `CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status ENUM('open','assigned','closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_store_week (store_id, week_start)
)`;

const scheduleRequestsSchema = `
  CREATE TABLE IF NOT EXISTS schedule_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    schedule_id INT NOT NULL,
    
    mon_type ENUM('full','part','off') DEFAULT 'off',
    mon_start TIME, mon_end TIME,
    tue_type ENUM('full','part','off') DEFAULT 'off',
    tue_start TIME, tue_end TIME,
    wed_type ENUM('full','part','off') DEFAULT 'off',
    wed_start TIME, wed_end TIME,
    thu_type ENUM('full','part','off') DEFAULT 'off',
    thu_start TIME, thu_end TIME,
    fri_type ENUM('full','part','off') DEFAULT 'off',
    fri_start TIME, fri_end TIME,
    sat_type ENUM('full','part','off') DEFAULT 'off',
    sat_start TIME, sat_end TIME,
    sun_type ENUM('full','part','off') DEFAULT 'off',
    sun_start TIME, sun_end TIME,
    
    status ENUM('requested','assigned','confirmed','cancelled') DEFAULT 'requested',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_at TIMESTAMP NULL,
    
    UNIQUE KEY unique_request (user_id, schedule_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
  )`;

const storeSettingsSchema = `CREATE TABLE IF NOT EXISTS store_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  day_type ENUM('weekday','weekend','holiday') NOT NULL,
  lunch_staff INT DEFAULT 0,
  dinner_staff INT DEFAULT 0,
  UNIQUE KEY unique_store_day (store_id, day_type),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
)`;

// 누락되었던 스키마들 추가!
const noticesSchema = `CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  attachments JSON,
  author_id INT NOT NULL,
  visibility ENUM('employees','admins','all') DEFAULT 'all',
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

const requestsSchema = `CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  store_id INT,
  attachments JSON,
  author_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

const notificationsSchema = `CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('schedule_open','assignment','notice','approval'),
  channel ENUM('kakao','email','app') DEFAULT 'app',
  content TEXT,
  status ENUM('sent','failed','read') DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

const auditLogsSchema = `CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  actor_id INT NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  details JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`;

// --- 외래키 복원 ---
async function addAllForeignKeys(conn) {
  const fks = [
    'ALTER TABLE stores ADD CONSTRAINT fk_stores_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL',
    'ALTER TABLE users ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL',
    'ALTER TABLE schedules ADD CONSTRAINT fk_schedules_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE schedule_requests ADD CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE schedule_requests ADD CONSTRAINT fk_sr_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE',
    'ALTER TABLE notices ADD CONSTRAINT fk_notices_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE notices ADD CONSTRAINT fk_notices_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE requests ADD CONSTRAINT fk_requests_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE requests ADD CONSTRAINT fk_requests_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL'
  ];
  for (const fk of fks) {
    try { await conn.query(fk); } catch (e) { /* 무시 */ }
  }
  console.log('모든 외래키 복원 완료');
}

// --- 초기 데이터 ---
async function insertInitialData(conn) {
  const [cnt] = await conn.query('SELECT COUNT(*) as c FROM stores');
  if (cnt[0].c > 0) return console.log('초기 데이터 스킵');

  const pw = await bcrypt.hash('1234', 10);
  await conn.query(`
    INSERT INTO stores (name, address) VALUES
      ('샤브올데이 이천점', '경기도 이천시'),
      ('명륜진사갈비 역동점', '서울시 강동구'),
      ('명륜진사갈비 탄벌점', '인천시 남동구')
  `);

  // 초기 데이터
  await conn.query(`
  INSERT INTO users (name, userId, password, birthdate, phone, store_id, level, consent_records) VALUES
    ('총괄관리자', 'admin', ?, '19800101', '01012345678', 1, 3, '{"privacy":true}'),
    ('역동점관리자', 'storeadmin', ?, '19850505', '01098765432', 2, 2, '{"privacy":true}'),
    ('테스트직원', 'test', ?, '19900101', '01011112222', 1, 0, '{"privacy":true}')
`, [pw, pw, pw]);

  console.log('초기 데이터 삽입 완료 (admin/1234, storeadmin/1234, test/1234)');
}

module.exports = initDB;