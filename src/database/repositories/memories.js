import { pool } from '../pool.js';

export async function createMemory(memory, connection = pool) {
  const [result] = await connection.execute(
    `INSERT INTO memories (user_id, content_type, text_content, telegram_file_id, telegram_message_id, memory_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [memory.userId, memory.contentType, memory.textContent ?? null, memory.fileId ?? null, memory.messageId ?? null, memory.memoryDate]
  );
  return findMemory(memory.userId, result.insertId, connection);
}

export async function findMemory(userId, id, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM memories WHERE id = ? AND user_id = ?', [id, userId]);
  return rows[0] ?? null;
}

export async function listByDate(userId, date, limit = 20, offset = 0, connection = pool) {
  const [rows] = await connection.execute(
    'SELECT * FROM memories WHERE user_id = ? AND memory_date = ? ORDER BY created_at, id LIMIT ? OFFSET ?',
    [userId, date, Number(limit), Number(offset)]
  );
  return rows;
}

export async function countByDate(userId, date, connection = pool) {
  const [rows] = await connection.execute('SELECT COUNT(*) count FROM memories WHERE user_id = ? AND memory_date = ?', [userId, date]);
  return Number(rows[0].count);
}

export async function listByMonth(userId, month, limit = 10, offset = 0, connection = pool) {
  const start = `${month}-01`;
  const [rows] = await connection.execute(
    `SELECT * FROM memories WHERE user_id = ? AND memory_date >= ? AND memory_date < DATE_ADD(?, INTERVAL 1 MONTH)
     ORDER BY memory_date, created_at, id LIMIT ? OFFSET ?`,
    [userId, start, start, Number(limit), Number(offset)]
  );
  return rows;
}

export async function countByMonth(userId, month, connection = pool) {
  const start = `${month}-01`;
  const [rows] = await connection.execute(
    'SELECT COUNT(*) count FROM memories WHERE user_id = ? AND memory_date >= ? AND memory_date < DATE_ADD(?, INTERVAL 1 MONTH)',
    [userId, start, start]
  );
  return Number(rows[0].count);
}

export async function datesInMonth(userId, month, connection = pool) {
  const start = `${month}-01`;
  const [rows] = await connection.execute(
    `SELECT DISTINCT memory_date FROM memories WHERE user_id = ? AND memory_date >= ?
     AND memory_date < DATE_ADD(?, INTERVAL 1 MONTH) ORDER BY memory_date`,
    [userId, start, start]
  );
  return rows.map((row) => row.memory_date);
}

export async function randomMemory(userId, excludedId = null, connection = pool) {
  const params = [userId];
  let exclusion = '';
  if (excludedId) { exclusion = 'AND id <> ?'; params.push(excludedId); }
  const [rows] = await connection.execute(
    `SELECT * FROM memories WHERE user_id = ? ${exclusion} ORDER BY RAND() LIMIT 1`, params
  );
  if (!rows[0] && excludedId) {
    return findMemory(userId, excludedId, connection);
  }
  return rows[0] ?? null;
}

export async function updateMemory(userId, id, changes, connection = pool) {
  const allowed = Object.entries(changes).filter(([key]) => ['text_content', 'memory_date'].includes(key));
  if (!allowed.length) return findMemory(userId, id, connection);

  const assignments = allowed.map(([key]) => `${key} = ?`).join(', ');
  const values = allowed.map(([, value]) => value);

  await connection.execute(
    `UPDATE memories SET ${assignments} WHERE id = ? AND user_id = ?`,
    [...values, id, userId]
  );

  return findMemory(userId, id, connection);
}

export async function deleteMemory(userId, id, connection = pool) {
  const [result] = await connection.execute('DELETE FROM memories WHERE id = ? AND user_id = ?', [id, userId]);
  return result.affectedRows === 1;
}

export async function statistics(userId, currentMonth, connection = pool) {
  const start = `${currentMonth}-01`;
  const [rows] = await connection.execute(
    `SELECT COUNT(*) total, COUNT(DISTINCT memory_date) unique_days, MIN(memory_date) first_date,
     SUM(memory_date >= ? AND memory_date < DATE_ADD(?, INTERVAL 1 MONTH)) month_count
     FROM memories WHERE user_id = ?`, [start, start, userId]
  );
  const stats = rows[0];
  return {
    ...stats,
    total: Number(stats.total),
    unique_days: Number(stats.unique_days),
    month_count: Number(stats.month_count ?? 0)
  };
}

export async function listAll(userId, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM memories WHERE user_id = ? ORDER BY memory_date, created_at, id', [userId]);
  return rows;
}

export async function listRecent(userId, limit = 10, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM memories WHERE user_id = ? ORDER BY memory_date DESC, created_at DESC, id DESC LIMIT ?', [userId, Number(limit)]);
  return rows;
}

export async function listAnniversary(userId, dates, connection = pool) {
  const placeholders = dates.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT * FROM memories
     WHERE user_id = ? AND memory_date IN (${placeholders})
     ORDER BY id
     LIMIT 1`,
    [userId, ...dates]
  );
  return rows;
}
