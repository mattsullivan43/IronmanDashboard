import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import config from '../config';

let pool: mysql.Pool;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.mysqlHost,
      port: config.mysqlPort,
      user: config.mysqlUser,
      password: config.mysqlPassword,
      database: config.mysqlDatabase,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true,
    });
  }
  return pool;
}

/**
 * Execute a parameterized query. Uses ? placeholders (MySQL style).
 * Returns [rows, fields]. rows is the array of result objects for SELECT,
 * or ResultSetHeader for INSERT/UPDATE/DELETE.
 */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const p = getPool();
  const start = Date.now();
  const [rows] = await p.query(sql, params || []);
  const duration = Date.now() - start;

  if (config.nodeEnv === 'development') {
    console.log('[JARVIS DB] Query executed', {
      text: sql.substring(0, 80),
      duration: `${duration}ms`,
    });
  }

  return rows as T[];
}

/**
 * Execute raw SQL (for init scripts with multiple statements).
 */
export async function execRaw(sql: string): Promise<void> {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.query(sql);
  } finally {
    conn.release();
  }
}

/**
 * Get a connection from the pool for transactions.
 */
export async function getClient(): Promise<mysql.PoolConnection> {
  const p = getPool();
  return p.getConnection();
}

/**
 * Initialize the database by running init.sql.
 */
export async function initializeDatabase(): Promise<void> {
  const initSqlPath = path.resolve(__dirname, 'init.sql');

  if (!fs.existsSync(initSqlPath)) {
    console.error('[JARVIS DB] init.sql not found at', initSqlPath);
    throw new Error('Database initialization file not found');
  }

  const sql = fs.readFileSync(initSqlPath, 'utf-8');

  try {
    await execRaw(sql);
    console.log('[JARVIS DB] Database initialized successfully');
  } catch (err: any) {
    // Table already exists is non-fatal
    if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.errno === 1050) {
      console.log('[JARVIS DB] Database already initialized (tables exist)');
    } else if (err.code === 'ER_DUP_KEYNAME' || err.errno === 1061) {
      console.log('[JARVIS DB] Database already initialized (indexes exist)');
    } else if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
      console.log('[JARVIS DB] Database already initialized (seed data exists)');
    } else if (err.message?.includes('already exists') || err.message?.includes('Duplicate')) {
      console.log('[JARVIS DB] Database already initialized');
    } else {
      console.error('[JARVIS DB] Database initialization error:', err.message);
      throw err;
    }
  }
}

/**
 * Graceful shutdown helper.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('[JARVIS DB] Connection pool closed');
  }
}

export { pool };
export default getPool;
