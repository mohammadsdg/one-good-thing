import { env } from '../config/env.js';
import * as users from '../database/repositories/users.js';

export const getOrCreateUser = (telegramId) => users.ensureUser(telegramId, {
  timezone: env.DEFAULT_TIMEZONE,
  reminderTime: env.DEFAULT_REMINDER_TIME
});

export async function deleteAccount(userId) {
  return users.deleteUser(userId);
}
