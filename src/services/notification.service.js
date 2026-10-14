import { DateTime } from 'luxon';
import { checkinKeyboard } from '../bot/keyboards/index.js';
import { dailyMessage, pickDailyVariant } from '../bot/messages.js';
import { env } from '../config/env.js';
import * as checkins from '../database/repositories/checkins.js';
import * as memories from '../database/repositories/memories.js';
import * as notifications from '../database/repositories/notifications.js';
import * as users from '../database/repositories/users.js';
import { anniversarySourceDate, localNow, localScheduleUtc, sqlUtc } from '../utils/dates.js';
import { escapeHtml } from '../utils/html.js';
import { buildRecap } from './recap.service.js';

const LATEST_DAYTIME_HOUR = 21;

function timeHasPassed(localTime, value) {
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  return localTime.hour > hour || (localTime.hour === hour && localTime.minute >= minute);
}

function scheduledTime(date, time, timezone) {
  return sqlUtc(localScheduleUtc(date, String(time).slice(0, 5), timezone));
}

async function scheduleDailyCheckin(user, localTime, date) {
  if (!user.reminders_enabled || !timeHasPassed(localTime, user.reminder_time)) return;

  const previousVariant = await notifications.lastDailyVariant(user.id);
  const variant = pickDailyVariant(previousVariant);

  await notifications.enqueue({
    userId: user.id,
    type: 'daily',
    key: `daily:${user.id}:${date}`,
    payload: { localDate: date, variant },
    scheduledAt: scheduledTime(date, user.reminder_time, user.timezone)
  });
}

async function scheduleAnniversary(user, localTime, date) {
  const isDue = timeHasPassed(localTime, env.ANNIVERSARY_TIME);
  if (!user.anniversaries_enabled || !isDue || localTime.hour >= LATEST_DAYTIME_HOUR) return;

  const [memory] = await memories.listAnniversary(user.id, anniversarySourceDate(date));
  if (!memory) return;

  await notifications.enqueue({
    userId: user.id,
    type: 'anniversary',
    key: `anniversary:${user.id}:${date}`,
    payload: { localDate: date, memoryId: memory.id },
    scheduledAt: scheduledTime(date, env.ANNIVERSARY_TIME, user.timezone)
  });
}

async function scheduleMonthlyRecap(user, localTime, date) {
  const isDue = localTime.day === 1 && timeHasPassed(localTime, env.MONTHLY_RECAP_TIME);
  if (!user.monthly_recap_enabled || !isDue || localTime.hour >= LATEST_DAYTIME_HOUR) return;

  const month = localTime.minus({ months: 1 }).toFormat('yyyy-LL');
  if (!await memories.countByMonth(user.id, month)) return;

  await notifications.enqueue({
    userId: user.id,
    type: 'recap',
    key: `recap:${user.id}:${month}`,
    payload: { localDate: date, month },
    scheduledAt: scheduledTime(date, env.MONTHLY_RECAP_TIME, user.timezone)
  });
}

export async function planNotifications(now = DateTime.utc()) {
  const activeUsers = await users.listActiveUsers();

  for (const user of activeUsers) {
    const localTime = localNow(user.timezone, now);
    const date = localTime.toISODate();

    await scheduleDailyCheckin(user, localTime, date);
    await scheduleAnniversary(user, localTime, date);
    await scheduleMonthlyRecap(user, localTime, date);
  }
}

async function sendMemory(telegram, chatId, memory, intro) {
  const date = DateTime.fromISO(memory.memory_date).toFormat('LLLL d, yyyy');
  const text = memory.text_content ? `\n\n${escapeHtml(memory.text_content)}` : '';
  const caption = `${escapeHtml(intro)}\n\n<b>${escapeHtml(date)}</b>${text}`.slice(0, 1024);
  const options = { parse_mode: 'HTML' };

  if (memory.content_type === 'photo') {
    return telegram.sendPhoto(chatId, memory.telegram_file_id, { caption, ...options });
  }
  if (memory.content_type === 'voice') {
    return telegram.sendVoice(chatId, memory.telegram_file_id, { caption, ...options });
  }
  return telegram.sendMessage(chatId, caption, options);
}

async function deliverCheckin(telegram, user, notification) {
  if (!user.reminders_enabled) return;

  const date = notification.payload.localDate;
  const checkin = await checkins.ensureCheckin(user.id, date);
  if (checkin.status !== 'pending') return;

  await telegram.sendMessage(
    user.telegram_id,
    dailyMessage(notification.payload.variant),
    checkinKeyboard(date)
  );
  await checkins.markCheckinSent(user.id, date);
}

async function deliverAnniversary(telegram, user, notification) {
  if (!user.anniversaries_enabled) return;

  const memory = await memories.findMemory(user.id, notification.payload.memoryId);
  if (memory) {
    await sendMemory(telegram, user.telegram_id, memory, 'found this one from a year ago.');
  }
}

async function deliverRecap(telegram, user, notification) {
  if (!user.monthly_recap_enabled) return;

  const recap = await buildRecap(user.id, notification.payload.month);
  if (recap) {
    await telegram.sendMessage(user.telegram_id, recap, { parse_mode: 'HTML' });
  }
}

export async function deliverNotification(telegram, notification) {
  const user = await users.findUserById(notification.user_id);
  if (!user?.onboarding_completed) return;

  switch (notification.notification_type) {
    case 'daily':
    case 'snooze':
      return deliverCheckin(telegram, user, notification);
    case 'anniversary':
      return deliverAnniversary(telegram, user, notification);
    case 'recap':
      return deliverRecap(telegram, user, notification);
    default:
      return undefined;
  }
}

function retryDelayMinutes(error, attempt) {
  const telegramDelay = Number(error?.response?.parameters?.retry_after ?? 0) / 60;
  const backoff = 2 ** Math.max(0, attempt - 1);
  return Math.min(60, Math.max(backoff, telegramDelay));
}

function safeErrorMessage(error) {
  const code = error?.code ?? error?.response?.error_code ?? 'DELIVERY_ERROR';
  const description = error?.description ?? error?.message ?? 'unknown error';
  return `${code}: ${description}`;
}

export async function processDue(telegram) {
  const batch = await notifications.claimDue(10);

  for (const notification of batch) {
    try {
      await deliverNotification(telegram, notification);
      await notifications.markSent(notification.id);
    } catch (error) {
      const attempt = Number(notification.attempt_count) + 1;
      const delay = retryDelayMinutes(error, attempt);
      const retryAt = sqlUtc(DateTime.utc().plus({ minutes: delay }));

      await notifications.markFailed(
        notification.id,
        attempt,
        safeErrorMessage(error),
        retryAt
      );
    }
  }

  return batch.length;
}
