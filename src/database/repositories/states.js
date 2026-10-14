import { pool } from '../pool.js';
import { DateTime } from 'luxon';
import { sqlUtc } from '../../utils/dates.js';

export async function getState(userId, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM conversation_states WHERE user_id = ?', [userId]);
  const row = rows[0];
  if (!row) return null;
  if (new Date(`${row.expires_at.replace(' ', 'T')}Z`) <= new Date()) {
    await clearState(userId, connection);
    return null;
  }
  return { ...row, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload ?? {}) };
}

export async function setState(userId, state, payload = {}, ttlMinutes = 30, connection = pool) {
  const expires = sqlUtc(DateTime.utc().plus({ minutes: ttlMinutes }));
  await connection.execute(
    `INSERT INTO conversation_states (user_id, state, payload, expires_at)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE state = VALUES(state), payload = VALUES(payload), expires_at = VALUES(expires_at)`,
    [userId, state, JSON.stringify(payload), expires]
  );
}

export async function clearState(userId, connection = pool) {
  await connection.execute('DELETE FROM conversation_states WHERE user_id = ?', [userId]);
}
