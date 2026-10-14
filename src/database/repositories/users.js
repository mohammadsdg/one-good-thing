import { pool } from '../pool.js';

export async function findUserByTelegramId(telegramId, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
  return rows[0] ?? null;
}

export async function findUserById(id, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function ensureUser(telegramId, defaults, connection = pool) {
  await connection.execute(
    `INSERT INTO users (telegram_id, timezone, reminder_time)
     VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE telegram_id = VALUES(telegram_id)`,
    [telegramId, defaults.timezone, `${defaults.reminderTime}:00`]
  );
  return findUserByTelegramId(telegramId, connection);
}

const fields = new Set(['timezone', 'reminder_time', 'reminders_enabled', 'anniversaries_enabled', 'monthly_recap_enabled', 'onboarding_completed']);
export async function updateUser(id, changes, connection = pool) {
  const entries = Object.entries(changes).filter(([key]) => fields.has(key));
  if (!entries.length) return findUserById(id, connection);
  await connection.execute(`UPDATE users SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`, [...entries.map(([, value]) => value), id]);
  return findUserById(id, connection);
}

export async function listActiveUsers(connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM users WHERE onboarding_completed = TRUE');
  return rows;
}

export async function deleteUser(id, connection = pool) {
  const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [id]);
  return result.affectedRows === 1;
}
