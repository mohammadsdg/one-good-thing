import { pool } from '../pool.js';

export async function enqueue(notification, connection = pool) {
  const [result] = await connection.execute(
    `INSERT IGNORE INTO scheduled_notifications
     (user_id, notification_type, deduplication_key, payload, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`,
    [notification.userId, notification.type, notification.key, JSON.stringify(notification.payload ?? {}), notification.scheduledAt]
  );
  return result.affectedRows === 1;
}

export async function lastDailyVariant(userId, connection = pool) {
  const [rows] = await connection.execute(
    `SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.variant')) variant
     FROM scheduled_notifications
     WHERE user_id = ? AND notification_type = 'daily' AND status = 'sent'
       AND JSON_EXTRACT(payload, '$.variant') IS NOT NULL
     ORDER BY sent_at DESC, id DESC LIMIT 1`, [userId]
  );
  const variant = Number(rows[0]?.variant);
  return Number.isInteger(variant) && variant >= 0 && variant <= 6 ? variant : null;
}

export async function cancelActive(userId, type, date, connection = pool) {
  const [result] = await connection.execute(
    `UPDATE scheduled_notifications SET status = 'cancelled'
     WHERE user_id = ? AND notification_type = ? AND status IN ('pending','processing')
     AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.localDate')) = ?`, [userId, type, date]
  );
  return result.affectedRows;
}

export async function claimDue(limit = 10) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM scheduled_notifications
       WHERE status = 'pending' AND scheduled_at <= UTC_TIMESTAMP()
       ORDER BY scheduled_at, id LIMIT ? FOR UPDATE SKIP LOCKED`, [limit]
    );
    if (rows.length) {
      await connection.query(
        `UPDATE scheduled_notifications SET status = 'processing', attempt_count = attempt_count + 1
         WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map((row) => row.id)
      );
    }
    await connection.commit();
    return rows.map((row) => ({ ...row, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload ?? {}) }));
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function markSent(id) {
  await pool.execute("UPDATE scheduled_notifications SET status = 'sent', sent_at = UTC_TIMESTAMP(), last_error = NULL WHERE id = ? AND status = 'processing'", [id]);
}

export async function markFailed(id, attemptCount, message, retryAt) {
  const final = attemptCount >= 5;
  await pool.execute(
    `UPDATE scheduled_notifications SET status = ?, scheduled_at = ?, last_error = ? WHERE id = ? AND status = 'processing'`,
    [final ? 'failed' : 'pending', retryAt, String(message).slice(0, 1000), id]
  );
}

export async function recoverProcessing() {
  const [result] = await pool.execute(
    `UPDATE scheduled_notifications SET status = 'pending', scheduled_at = UTC_TIMESTAMP()
     WHERE status = 'processing' AND updated_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE`
  );
  return result.affectedRows;
}
