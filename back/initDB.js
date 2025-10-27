const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function initDB(pool) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(`USE ${process.env.DB_DATABASE || 'shabu'}`); // 데이터베이스 선택
    console.log(`Selected database ${process.env.DB_DATABASE || 'shabu'}`);

    // Uploads 폴더 생성
    const uploadDir = path.join(__dirname, 'Uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log('Created Uploads directory');
    }

    // 기존 외래 키 제거 (충돌 방지)
    const [userConstraints] = await conn.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `, [process.env.DB_DATABASE || 'shabu']);

    for (const constraint of userConstraints) {
      await conn.query(`ALTER TABLE users DROP FOREIGN KEY \`${constraint.CONSTRAINT_NAME}\``);
    }

    const [storeConstraints] = await conn.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'stores' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    `, [process.env.DB_DATABASE || 'shabu']);

    for (const constraint of storeConstraints) {
      await conn.query(`ALTER TABLE stores DROP FOREIGN KEY \`${constraint.CONSTRAINT_NAME}\``);
    }

    // users 테이블 생성
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        userId VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        birthdate VARCHAR(8),
        phone VARCHAR(11) UNIQUE,
        store_id INT,
        isAdmin BOOLEAN DEFAULT FALSE,
        role ENUM('user', 'store_admin', 'global_admin') DEFAULT 'user',
        signup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        consent_records JSON,
        INDEX idx_userId (userId),
        INDEX idx_phone (phone)
      )
    `);

    // stores 테이블 생성
    await conn.query(`
      CREATE TABLE IF NOT EXISTS stores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT,
        manager_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_name (name)
      )
    `);

    // stores 테이블에 외래 키 추가
    await conn.query(`
      ALTER TABLE stores
      ADD CONSTRAINT fk_stores_manager_id FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    `);

    // users 테이블에 외래 키 추가
    await conn.query(`
      ALTER TABLE users
      ADD CONSTRAINT fk_users_store_id FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
    `);

    // 나머지 테이블 생성
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        store_id INT NOT NULL,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        status ENUM('open', 'closed', 'assigned') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY fk_schedules_store_id (store_id) REFERENCES stores(id) ON DELETE CASCADE,
        INDEX idx_store_week_start (store_id, week_start)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        schedule_id INT NOT NULL,
        status ENUM('requested', 'approved', 'rejected', 'cancelled') DEFAULT 'requested',
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY fk_applications_user_id (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY fk_applications_schedule_id (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
        INDEX idx_schedule_user (schedule_id, user_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT NOT NULL,
        user_id INT NOT NULL,
        assigned_by INT,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY fk_assignments_schedule_id (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
        FOREIGN KEY fk_assignments_user_id (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY fk_assignments_assigned_by (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_schedule (schedule_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS notices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        store_id INT,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        attachments JSON,
        published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        author_id INT NOT NULL,
        visibility ENUM('employees', 'admins', 'all') DEFAULT 'all',
        FOREIGN KEY fk_notices_store_id (store_id) REFERENCES stores(id) ON DELETE SET NULL,
        FOREIGN KEY fk_notices_author_id (author_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_store (store_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        store_id INT,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        attachments JSON,
        status ENUM('pending', 'responded') DEFAULT 'pending',
        response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        FOREIGN KEY fk_requests_user_id (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY fk_requests_store_id (store_id) REFERENCES stores(id) ON DELETE SET NULL,
        INDEX idx_user (user_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('schedule_open', 'assignment', 'notice') NOT NULL,
        channel ENUM('kakao', 'email') DEFAULT 'kakao',
        content TEXT,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('sent', 'failed') DEFAULT 'sent',
        FOREIGN KEY fk_notifications_user_id (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        actor_id INT NOT NULL,
        target_type VARCHAR(50),
        target_id INT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        details JSON,
        FOREIGN KEY fk_audit_logs_actor_id (actor_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_actor (actor_id)
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS schedule_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        schedule_id INT NOT NULL,
        user_id INT NOT NULL,
        date DATE NOT NULL,
        status ENUM('assigned', 'confirmed', 'cancelled') DEFAULT 'assigned',
        FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_schedule_user (schedule_id, user_id)
      )
    `);

    // 초기 데이터 삽입
    const [stores] = await conn.query('SELECT id FROM stores');
    if (stores.length === 0) {
      await conn.query(`
        INSERT INTO stores (name, address) VALUES
          ('샤브올데이 이천점', '경기도 이천시'),
          ('명륜진사갈비 역동점', '서울시 강동구'),
          ('명륜진사갈비 탄벌점', '인천시 남동구')
      `);

      const hashedPassword = await bcrypt.hash('1234', 10);
      await conn.query(`
        INSERT INTO users (name, userId, password, birthdate, phone, store_id, isAdmin, role, consent_records)
        VALUES 
        ('관리자', 'admin', "${hashedPassword}", '19800101', '01012345678', 1, TRUE, 'global_admin', '{"privacy": true, "marketing": false}'),
        ('정성진', 'test', "${hashedPassword}", '19800101', '01012343333', 1, false, 'user', '{"privacy": true, "marketing": false}')
      `);

      await conn.query(`
        UPDATE stores SET manager_id = (SELECT id FROM users WHERE userId = 'admin') WHERE id = 1
      `);
    }

    console.log('DB initialization completed');
  } catch (err) {
    console.error('DB initialization error:', {
      message: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage,
      stack: err.stack
    });
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = initDB;