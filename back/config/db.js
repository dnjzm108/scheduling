// server/config/db.js
const mysql = require('mysql2/promise');

async function createDatabaseAndPool() {
  let conn;
  try {
    const rootPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

    conn = await rootPool.getConnection();
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_DATABASE}`);

    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      connectionLimit: 10
    });

    const testConn = await pool.getConnection();
    await testConn.query(`USE ${process.env.DB_DATABASE}`);
    testConn.release();
    return pool;
  } catch (err) {
    console.error('DB error:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { createDatabaseAndPool };