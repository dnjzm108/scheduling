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

    const uploadDir = path.join(__dirname, '../Uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Uploads 폴더 생성');
    }

    await dropAllForeignKeys(conn);

    await Promise.all([
      createTable(conn, 'users', usersSchema),
      createTable(conn, 'stores', storesSchema),
      createTable(conn, 'store_settings', storeSettingsSchema),
      createTable(conn, 'schedules', schedulesSchema),
      createTable(conn, 'schedule_requests', scheduleRequestsSchema),
      createTable(conn, 'assigned_shifts', assignedShiftsSchema),
      createTable(conn, 'employee_salary', employeeSalarySchema),
      createTable(conn, 'monthly_payrolls', monthlyPayrollsSchema),
      createTable(conn, 'notices', noticesSchema),
      createTable(conn, 'requests', requestsSchema),
      createTable(conn, 'notifications', notificationsSchema),
      createTable(conn, 'audit_logs', auditLogsSchema),
      createTable(conn, 'hall_sections', hallSectionsSchema),
      createTable(conn, 'kitchen_sections', kitchenSectionsSchema),
      createTable(conn, 'admin_store_access', adminStoreAccessSchema),
      createTable(conn, 'store_daily_sales', storeDailySalesSchema),
      createTable(conn, 'store_bep', storeBepSchema)
    ]);

    await addAllForeignKeys(conn);
    await insertInitialData(conn);

    console.log('DB 초기화 완료! (resident_id + section 포함)');
  } catch (err) {
    console.error('DB 초기화 실패:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

// ----------------------------------------------------
// 모든 FK 제거
// ----------------------------------------------------
async function dropAllForeignKeys(conn) {
  const tables = [
    'users', 'stores', 'schedules', 'schedule_requests', 'store_settings',
    'assigned_shifts', 'employee_salary', 'monthly_payrolls',
    'notices', 'requests', 'notifications', 'audit_logs'
  ];
  for (const table of tables) {
    try {
      const [fks] = await conn.query(`
        SELECT CONSTRAINT_NAME 
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = ? 
          AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      `, [table]);
      for (const { CONSTRAINT_NAME } of fks) {
        await conn.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
        await conn.query(`ALTER TABLE \`${table}\` DROP KEY \`${CONSTRAINT_NAME}\``);
      }
    } catch (e) { }
  }
  console.log('모든 외래키 제거 완료');
}

// ----------------------------------------------------
// 테이블 생성
// ----------------------------------------------------
async function createTable(conn, name, schema) {
  await conn.query(schema);
  console.log(`${name} 테이블 생성/업데이트 완료`);
}

// ----------------------------------------------------
// 테이블 스키마
// ----------------------------------------------------

// 직원
const usersSchema = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  userId VARCHAR(30) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,

  resident_id CHAR(13) NOT NULL COMMENT '주민등록번호 13자리',

  phone CHAR(11) UNIQUE,
  store_id INT NOT NULL,
  level TINYINT(1) NOT NULL DEFAULT 0,

  hire_date CHAR(6) NULL,
  resign_date DATE NULL,
  is_active TINYINT(1) DEFAULT 1,
  signup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  bank_name VARCHAR(50),
  bank_account VARCHAR(50),
  account_holder VARCHAR(50),
  tax_type TINYINT(1) DEFAULT 0,

  work_area ENUM('hall','kitchen','both') DEFAULT 'both',
  admin_role ENUM('hall','kitchen','both','super') DEFAULT 'both' COMMENT '관리 권한',

  INDEX idx_store_level (store_id, level),
  INDEX idx_hire_date (hire_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 매장 
const storesSchema = `
CREATE TABLE IF NOT EXISTS stores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  address TEXT,
  manager_id INT,
  open_time TIME DEFAULT '10:00:00',
  close_time TIME DEFAULT '22:00:00',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 매장 설정
const storeSettingsSchema = `
CREATE TABLE IF NOT EXISTS store_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  day_type ENUM('weekday','weekend','holiday') NOT NULL,
  lunch_staff INT DEFAULT 0,
  dinner_staff INT DEFAULT 0,
  UNIQUE KEY unique_store_day (store_id, day_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 스케줄(오픈)
const schedulesSchema = `
CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status ENUM('draft','open','assigned','closed') DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_at TIMESTAMP NULL,
  work_area ENUM('hall','kitchen','both') NOT NULL DEFAULT 'both'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 직원들이 신청한 스케줄 테이블
const scheduleRequestsSchema = `
CREATE TABLE IF NOT EXISTS schedule_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  schedule_id INT NOT NULL,

  mon_type ENUM('full','part','off') DEFAULT 'off', mon_start TIME, mon_end TIME,
  tue_type ENUM('full','part','off') DEFAULT 'off', tue_start TIME, tue_end TIME,
  wed_type ENUM('full','part','off') DEFAULT 'off', wed_start TIME, wed_end TIME,
  thu_type ENUM('full','part','off') DEFAULT 'off', thu_start TIME, thu_end TIME,
  fri_type ENUM('full','part','off') DEFAULT 'off', fri_start TIME, fri_end TIME,
  sat_type ENUM('full','part','off') DEFAULT 'off', sat_start TIME, sat_end TIME,
  sun_type ENUM('full','part','off') DEFAULT 'off', sun_start TIME, sun_end TIME,

  status ENUM('requested','assigned','confirmed','cancelled') DEFAULT 'requested',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_request (user_id, schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;


const assignedShiftsSchema = `
CREATE TABLE IF NOT EXISTS assigned_shifts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  user_id INT NOT NULL,

  work_date DATE NOT NULL,
  shift_type ENUM('full','part','custom') NOT NULL DEFAULT 'custom',
  start_time TIME NULL,
  end_time TIME NULL,
  break_minutes INT DEFAULT 60,

  custom_hourly_rate INT NULL COMMENT '해당 날짜에 적용되는 수정 시급',

  work_area ENUM('hall','kitchen') NOT NULL DEFAULT 'hall',
  section_name VARCHAR(50),

  status ENUM('confirmed','absent','late','early_leave','cancelled') DEFAULT 'confirmed',

  actual_start TIME NULL,
  actual_end TIME NULL,

  work_minutes INT AS ((TIME_TO_SEC(end_time) - TIME_TO_SEC(start_time) - break_minutes*60)/60) STORED,
  final_minutes INT AS (
    CASE 
      WHEN status IN ('absent','cancelled') THEN 0
      WHEN actual_start IS NOT NULL AND actual_end IS NOT NULL
        THEN GREATEST(0,(TIME_TO_SEC(actual_end)-TIME_TO_SEC(actual_start)-break_minutes*60)/60)
      ELSE work_minutes
    END
  ) STORED,

  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_user_date (user_id, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 직원 급여 테이블
const employeeSalarySchema = `
CREATE TABLE IF NOT EXISTS employee_salary (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  salary_type ENUM('hourly','monthly') NOT NULL DEFAULT 'hourly',
  hourly_rate INT NULL,
  hourly_rate_with_holiday INT NULL,
  monthly_salary INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 한달 급여 테이블
const monthlyPayrollsSchema = `
CREATE TABLE IF NOT EXISTS monthly_payrolls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  store_id INT NOT NULL,
  payroll_year_month CHAR(6) NOT NULL,
  total_work_minutes INT NOT NULL DEFAULT 0,
  base_pay INT NOT NULL DEFAULT 0,
  overtime_pay INT DEFAULT 0,
  weekly_holiday_allowance INT DEFAULT 0,
  bonus INT DEFAULT 0,
  deduction INT DEFAULT 0,
  total_gross_pay INT NOT NULL DEFAULT 0,
  income_tax INT DEFAULT 0,
  resident_tax INT DEFAULT 0,
  national_pension INT DEFAULT 0,
  health_insurance INT DEFAULT 0,
  employment_insurance INT DEFAULT 0,
  total_deduction INT NOT NULL DEFAULT 0,
  net_pay INT NOT NULL DEFAULT 0,
  payroll_status ENUM('calculated','confirmed','paid') DEFAULT 'calculated',
  paid_at DATETIME NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_month (user_id, payroll_year_month),
  INDEX idx_store_month (store_id, payroll_year_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 공지사항
const noticesSchema = `
CREATE TABLE IF NOT EXISTS notices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  attachments JSON,
  author_id INT NOT NULL,
  visibility ENUM('employees','admins','all') DEFAULT 'all',
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 건의사항
const requestsSchema = `
CREATE TABLE IF NOT EXISTS requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  store_id INT,
  attachments JSON,
  author_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 알림 (추후 게발 예정)
const notificationsSchema = `
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('schedule_open','assignment','notice','approval'),
  channel ENUM('kakao','email','app') DEFAULT 'app',
  content TEXT,
  status ENUM('sent','failed','read') DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 감사 로그
const auditLogsSchema = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  actor_id INT NOT NULL,
  target_type VARCHAR(50),
  target_id INT,
  details JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 홀 섹션
const hallSectionsSchema = `
CREATE TABLE IF NOT EXISTS hall_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  UNIQUE KEY uniq_hall_name_store (store_id, name),
  INDEX idx_hall_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 주방 섹션
const kitchenSectionsSchema = `
CREATE TABLE IF NOT EXISTS kitchen_sections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  UNIQUE KEY uniq_kitchen_name_store (store_id, name),
  INDEX idx_kitchen_store (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 매장 관리자 권한
const adminStoreAccessSchema = `
CREATE TABLE IF NOT EXISTS admin_store_access (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NOT NULL,
  store_id INT NOT NULL,
  UNIQUE KEY uniq_admin_store (admin_user_id, store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 매장 매출액
const storeDailySalesSchema = `
CREATE TABLE IF NOT EXISTS store_daily_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  sales_date DATE NOT NULL,
  sales_amount INT DEFAULT 0,
  memo TEXT,
  UNIQUE KEY uniq_store_date (store_id, sales_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// 매장 BEP 
const storeBepSchema = `
CREATE TABLE IF NOT EXISTS store_bep (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  month CHAR(6) NOT NULL COMMENT 'YYYYMM',
  fixed_cost INT DEFAULT 0,
  variable_cost INT DEFAULT 0,
  labor_cost INT DEFAULT 0,
  sales_target INT DEFAULT 0,
  memo TEXT,
  UNIQUE KEY uniq_store_month (store_id, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`;

// ----------------------------------------------------
// FK 복원
// ----------------------------------------------------
async function addAllForeignKeys(conn) {
  const fks = [
    'ALTER TABLE users ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL',
    'ALTER TABLE stores ADD CONSTRAINT fk_stores_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL',
    'ALTER TABLE schedules ADD CONSTRAINT fk_schedules_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE schedule_requests ADD CONSTRAINT fk_sr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE schedule_requests ADD CONSTRAINT fk_sr_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE',
    'ALTER TABLE store_settings ADD CONSTRAINT fk_settings_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE assigned_shifts ADD CONSTRAINT fk_shift_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE',
    'ALTER TABLE assigned_shifts ADD CONSTRAINT fk_shift_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE employee_salary ADD CONSTRAINT fk_salary_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE monthly_payrolls ADD CONSTRAINT fk_payroll_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE monthly_payrolls ADD CONSTRAINT fk_payroll_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE notices ADD CONSTRAINT fk_notices_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE notices ADD CONSTRAINT fk_notices_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE requests ADD CONSTRAINT fk_requests_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL',
    'ALTER TABLE requests ADD CONSTRAINT fk_requests_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE notifications ADD CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE',
    'ALTER TABLE hall_sections ADD CONSTRAINT fk_hall_sections_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE',
    'ALTER TABLE kitchen_sections ADD CONSTRAINT fk_kitchen_sections_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE'
  ];

  for (const fk of fks) {
    try { await conn.query(fk); } catch (e) { }
  }
  console.log('모든 외래키 복원 완료');
}

// ----------------------------------------------------
// 초기 데이터
// ----------------------------------------------------
async function insertInitialData(conn) {
  const [cnt] = await conn.query('SELECT COUNT(*) as c FROM stores');
  if (cnt[0].c > 0) {
    console.log('이미 데이터 존재 → 초기 데이터 스킵');
    return;
  }

  const pw = await bcrypt.hash('1234', 10);

  await conn.query(`INSERT INTO stores (name, address) VALUES ('샤브올데이 이천점', '경기도 이천시')`);

  await conn.query(`
    INSERT INTO users 
      (name, userId, password, store_id, level, phone, resident_id, hire_date, is_active, work_area)
    VALUES
      ('총관리자', 'admin', ?, 1, 4, '01011111111', '9001011234567', '230101', 1, 'both'),
      ('이천점장', 'manager1', ?, 1, 3, '01022222222', '9002022234567', '230615', 1, 'both'),
      ('알바정성진', 'seongjin', ?, 1, 1, '01033333333', '0101013234567', '250310', 1, 'hall'),
      ('정직원김서원', 'seowon', ?, 1, 2, '01044444444', '0001014234567', '241101', 1, 'kitchen')
  `, [pw, pw, pw, pw]);

  await conn.query(`
  INSERT INTO hall_sections (name, store_id) VALUES
    ('소스', 1), ('홀퇴식', 1), ('안내', 1), ('준비실', 1), ('야채', 1)
`);
  await conn.query(`
  INSERT INTO kitchen_sections (name, store_id) VALUES
    ('핫다이', 1), ('샐러드', 1), ('설거지', 1), ('피자', 1)
`);


  console.log('초기 데이터 삽입 완료');
}

module.exports = initDB;
