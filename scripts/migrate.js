import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/database/pool.js';
import { logger } from '../src/utils/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(here, '../src/database/migrations');

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [applied] = await pool.query('SELECT name FROM schema_migrations');
  const completed = new Set(applied.map((row) => row.name));
  const files = (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  for (const name of files) {
    if (completed.has(name)) continue;
    const sql = await fs.readFile(path.join(directory, name), 'utf8');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const statement of sql.split(';').map((part) => part.trim()).filter(Boolean)) await connection.query(statement);
      await connection.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      await connection.commit();
      logger.info({ migration: name }, 'migration applied');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
} finally {
  await pool.end();
}
