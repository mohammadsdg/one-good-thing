import { pool } from '../pool.js';

export async function ensureCheckin(userId, date, connection = pool) {
  await connection.execute(
    `INSERT INTO daily_checkins (user_id, checkin_date) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`, [userId, date]
  );
  const [rows] = await connection.execute('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?', [userId, date]);
  return rows[0];
}

export async function markCheckinSent(userId, date, connection = pool) {
  await connection.execute('UPDATE daily_checkins SET sent_at = COALESCE(sent_at, UTC_TIMESTAMP()) WHERE user_id = ? AND checkin_date = ?', [userId, date]);
}

export async function completeCheckin(userId, date, connection = pool) {
  await connection.execute(
    `INSERT INTO daily_checkins (user_id, checkin_date, status, completed_at)
     VALUES (?, ?, 'completed', UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       status = IF(status = 'skipped', 'skipped', 'completed'),
       completed_at = IF(status = 'skipped', completed_at, UTC_TIMESTAMP())`, [userId, date]
  );
}

export async function skipCheckin(userId, date, connection = pool) {
  const checkin = await ensureCheckin(userId, date, connection);
  await connection.execute("UPDATE daily_checkins SET status = 'skipped' WHERE id = ? AND status = 'pending'", [checkin.id]);
  return checkin.id;
}

export async function getCheckin(userId, date, connection = pool) {
  const [rows] = await connection.execute('SELECT * FROM daily_checkins WHERE user_id = ? AND checkin_date = ?', [userId, date]);
  return rows[0] ?? null;
}
