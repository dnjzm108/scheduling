const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function initDB(pool) {
  let conn;
  try {
    conn = await pool.getConnection();
    const dbName = process.env.DB_DATABASE || 'shabu';
    await conn.query(`USE ${dbName}`);
    console.log(`✅ DB 선택: ${dbName}`);

    // 1. Uploads 폴더 생성
    const uploadDir = path.join(__dirname, 'Uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('📁 Uploads 폴더 생성 완료');
    }

    // 2. 기존 외래 키 안전 제거
    await dropForeignKeys(conn, 'users');
    await dropForeignKeys(conn, 'stores');
    await dropForeignKeys(conn, 'schedules');
    await dropForeignKeys(conn, 'applications');
    await dropForeignKeys(conn, 'assignments');
    await dropForeignKeys(conn, 'schedule_assignments');
    await dropForeignKeys(conn, 'notices');
    await dropForeignKeys(conn, 'requests');
    // notifications와 audit_logs는 외래 키가 없으므로 생략

    // 3. 테이블 순차 생성 (의존성 고려: users → stores → 나머지)
    await createUsersTable(conn);
    await createStoresTable(conn);
    await createSchedulesTable(conn);
    await createApplicationsTable(conn);
    await createAssignmentsTable(conn);
    await createScheduleAssignmentsTable(conn);
    await createNoticesTable(conn);
    await createRequestsTable(conn);
    await createNotificationsTable(conn);
    await createAuditLogsTable(conn);

    // 4. 외래 키 복원 (이전에 스케줄 관련 외래 키 추가 요청 반영)
    await addForeignKeys(conn);

    // 5. 초기 데이터 삽입 (stores/users)
    await insertInitialData(conn);

    console.log('🎉 DB 초기화 완료! 모든 테이블/데이터 준비됨');
  } catch (err) {
    console.error('❌ DB 초기화 실패:', {
      message: err.message,
      code: err.code,
      sql: err.sql,
    });
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

// --- 헬퍼 함수: 외래 키 드롭 ---
async function dropForeignKeys(conn, tableName) {
  try {
    const [constraints] = await conn.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `, [tableName]);

    for (const { CONSTRAINT_NAME } of constraints) {
      await conn.query(`ALTER TABLE ${tableName} DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
    }
    console.log(`🔧 ${tableName} 외래 키 제거 완료`);
  } catch (error) {
    // 테이블이 존재하지 않아 외래 키를 드롭할 수 없는 경우 무시
    if (error.code !== 'ER_NO_SUCH_TABLE') {
      console.error(`Error dropping FKs for ${tableName}:`, error.message);
    }
    console.log(`🔧 ${tableName} 외래 키 제거 시도 (테이블 미존재 가능)`);
  }
}

// --- 테이블 생성 함수 ---

// 3-1. users 테이블
async function createUsersTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      userId VARCHAR(30) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      birthdate CHAR(8),
      phone CHAR(11) UNIQUE,
      store_id INT,
      isAdmin TINYINT(1) DEFAULT 0,
      role ENUM('user', 'store_admin', 'global_admin') DEFAULT 'user',
      approved TINYINT(1) DEFAULT 0,  
      signup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      consent_records JSON,
      INDEX idx_userId (userId),
      INDEX idx_phone (phone),
      INDEX idx_store (store_id)
    )
  `);
  console.log('✅ users 테이블 생성');
}

// 3-2. stores 테이블
async function createStoresTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      address TEXT,
      manager_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_name (name)
    )
  `);
  console.log('✅ stores 테이블 생성');
}

// 3-3. schedules 테이블
async function createSchedulesTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT NOT NULL,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      status ENUM('open', 'closed', 'assigned') DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_store_week (store_id, week_start)
    )
  `);
  console.log('✅ schedules 테이블 생성');
}

// 3-4. applications 테이블
async function createApplicationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      schedule_id INT NOT NULL,
      status ENUM('requested', 'approved', 'rejected', 'cancelled') DEFAULT 'requested',
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_app (schedule_id, user_id)
    )
  `);
  console.log('✅ applications 테이블 생성');
}

// 3-5. assignments 테이블
async function createAssignmentsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_id INT NOT NULL,
      user_id INT NOT NULL,
      assigned_by INT,
      assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_assignment (schedule_id, user_id)
    )
  `);
  console.log('✅ assignments 테이블 생성');
}

// 3-6. schedule_assignments 테이블 (요일별 상세 근무 배치)
async function createScheduleAssignmentsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schedule_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_id INT NOT NULL,
      user_id INT NOT NULL,
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      status ENUM('assigned', 'confirmed', 'cancelled') DEFAULT 'assigned',
      UNIQUE KEY unique_schedule_user_date (schedule_id, user_id, date)
    )
  `);
  console.log('✅ schedule_assignments 테이블 생성');
}

// 3-7. notices 테이블
async function createNoticesTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      store_id INT,
      title VARCHAR(200) NOT NULL,
      body TEXT,
      attachments JSON,
      author_id INT NOT NULL,
      visibility ENUM('employees', 'admins', 'all') DEFAULT 'all',
      published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_store_published (store_id, published_at)
    )
  `);
  console.log('✅ notices 테이블 생성');
}

// 3-8. requests 테이블 (건의사항)
async function createRequestsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      store_id INT,
      attachments JSON,
      author_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✅ requests 테이블 생성');
}

// 3-9. notifications 테이블
async function createNotificationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('schedule_open', 'assignment', 'notice', 'approval'),
      channel ENUM('kakao', 'email', 'app') DEFAULT 'app',
      content TEXT,
      status ENUM('sent', 'failed', 'read') DEFAULT 'sent',
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_type (user_id, type)
    )
  `);
  console.log('✅ notifications 테이블 생성');
}

// 3-10. audit_logs 테이블
async function createAuditLogsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(100) NOT NULL,
      actor_id INT NOT NULL,
      target_type VARCHAR(50),
      target_id INT,
      details JSON,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_actor_time (actor_id, timestamp)
    )
  `);

  // 3-11.스케줄 셋팅 테이블
await conn.query(`
  CREATE TABLE IF NOT EXISTS store_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    store_id INT NOT NULL,
    day_type ENUM('weekday', 'weekend', 'holiday') NOT NULL,
    open_time TIME,
    close_time TIME,
    break_start TIME,
    break_end TIME,
    lunch_staff INT DEFAULT 0,
    dinner_staff INT DEFAULT 0,
    UNIQUE KEY unique_store_day (store_id, day_type),
    FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
  )
`);
  console.log('✅ audit_logs 테이블 생성');
}


// --- 외래 키 복원 함수 ---
async function addForeignKeys(conn) {
  const fks = [
    // stores
    `ALTER TABLE stores ADD CONSTRAINT fk_stores_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL`,
    
    // users
    `ALTER TABLE users ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL`,
    
    // schedules
    `ALTER TABLE schedules ADD CONSTRAINT fk_schedules_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`,
    
    // applications
    `ALTER TABLE applications ADD CONSTRAINT fk_apps_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE applications ADD CONSTRAINT fk_apps_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE`,
    
    // assignments
    `ALTER TABLE assignments ADD CONSTRAINT fk_assignments_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE`,
    `ALTER TABLE assignments ADD CONSTRAINT fk_assignments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
    
    // schedule_assignments
    `ALTER TABLE schedule_assignments ADD CONSTRAINT fk_sa_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE`,
    `ALTER TABLE schedule_assignments ADD CONSTRAINT fk_sa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`,
    
    // notices
    `ALTER TABLE notices ADD CONSTRAINT fk_notices_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE`,
    `ALTER TABLE notices ADD CONSTRAINT fk_notices_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE`,

    // requests
    `ALTER TABLE requests ADD CONSTRAINT fk_requests_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE`,
    `ALTER TABLE requests ADD CONSTRAINT fk_requests_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL`
  ];
  
  for (const fk of fks) {
    try {
      // 외래 키 이름이 이미 존재하면 오류가 나므로, CREATE 대신 ALTER TABLE 사용
      await conn.query(fk);
    } catch (e) {
      // 주로 'FK 스킵 (이미 존재)' 오류이므로 무시 (하지만 로그는 남김)
      if (!e.message.includes('Foreign key constraint name already exists')) {
          console.log(`⚠️ FK 설정 중 오류 발생: ${e.message}`);
      }
    }
  }
  console.log('🔗 모든 외래 키 복원 완료');
}


// --- 초기 데이터 삽입 함수 ---
async function insertInitialData(conn) {
  const [storesCount] = await conn.query('SELECT COUNT(*) as cnt FROM stores');
  if (storesCount[0].cnt === 0) {
    const hashedPW = await bcrypt.hash('1234', 10);
    
    // Stores
    await conn.query(`
      INSERT INTO stores (name, address) VALUES
        ('샤브올데이 이천점', '경기도 이천시'),
        ('명륜진사갈비 역동점', '서울시 강동구'),
        ('명륜진사갈비 탄벌점', '인천시 남동구')
    `);
    
    // Users (관리자: approved=1, 테스트: approved=0)
    await conn.query(`
      INSERT INTO users (name, userId, password, birthdate, phone, store_id, isAdmin, role, approved, consent_records) VALUES
        ('총괄관리자', 'admin', ?, '19800101', '01012345678', 1, 1, 'global_admin', 1, '{"privacy":true,"marketing":false}'),
        ('역동점관리자', 'storeadmin', ?, '19850505', '01098765432', 2, 1, 'store_admin', 1, '{"privacy":true,"marketing":false}'),
        ('테스트직원', 'test', ?, '19900101', '01012345679', 1, 0, 'user', 0, '{"privacy":true,"marketing":false}')
    `, [hashedPW, hashedPW, hashedPW]);
    
    // Manager 연결
    await conn.query('UPDATE stores SET manager_id = (SELECT id FROM users WHERE userId="admin") WHERE id=1');
    await conn.query('UPDATE stores SET manager_id = (SELECT id FROM users WHERE userId="storeadmin") WHERE id=2');
    
    await conn.query(`
  ALTER TABLE stores 
  ADD COLUMN IF NOT EXISTS open_time TIME DEFAULT '10:00:00',
  ADD COLUMN IF NOT EXISTS close_time TIME DEFAULT '22:00:00',
  ADD COLUMN IF NOT EXISTS break_start TIME,
  ADD COLUMN IF NOT EXISTS break_end TIME,
  ADD COLUMN IF NOT EXISTS lunch_staff INT DEFAULT 4,
  ADD COLUMN IF NOT EXISTS dinner_staff INT DEFAULT 6,
  ADD COLUMN IF NOT EXISTS is_weekend_break TINYINT(1) DEFAULT 0
`);


    console.log('🆕 초기 데이터 삽입 완료\n데모 계정:\n- admin/1234 (총괄 관리자, 승인됨)\n- storeadmin/1234 (매장 관리자, 승인됨)\n- test/1234 (직원, 승인 대기)');
  } else {
    console.log('⏭️ 초기 데이터 이미 존재 (스킵)');
  }
}



module.exports = initDB;