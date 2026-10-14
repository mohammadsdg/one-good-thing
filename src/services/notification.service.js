import { DateTime } from 'luxon';
import { env } from '../config/env.js';
import * as users from '../database/repositories/users.js';
import * as memories from '../database/repositories/memories.js';
import * as checkins from '../database/repositories/checkins.js';
import * as notifications from '../database/repositories/notifications.js';
import { anniversarySourceDate, localNow, localScheduleUtc, sqlUtc } from '../utils/dates.js';
import { escapeHtml } from '../utils/html.js';
import { buildRecap } from './recap.service.js';
import { checkinKeyboard } from '../bot/keyboards/index.js';
import { dailyMessage, pickDailyVariant } from '../bot/messages.js';

const afterTime = (local, value) => {
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  return local.hour > hour || (local.hour === hour && local.minute >= minute);
};

export async function planNotifications(now = DateTime.utc()) {
  const activeUsers = await users.listActiveUsers();
  for (const user of activeUsers) {
    const local = localNow(user.timezone, now);
    const date = local.toISODate();

    if (user.reminders_enabled && afterTime(local, user.reminder_time)) {
      const variant = pickDailyVariant(await notifications.lastDailyVariant(user.id));
      await notifications.enqueue({
        userId: user.id,
        type: 'daily',
        key: `daily:${user.id}:${date}`,
        payload: { localDate: date, variant },
        scheduledAt: sqlUtc(localScheduleUtc(date, String(user.reminder_time).slice(0, 5), user.timezone))
      });
    }

    if (user.anniversaries_enabled && afterTime(local, env.ANNIVERSARY_TIME) && local.hour < 21) {
      const matches = await memories.listAnniversary(user.id, anniversarySourceDate(date));
      if (matches.length) {
        await notifications.enqueue({
          userId: user.id,
          type: 'anniversary',
          key: `anniversary:${user.id}:${date}`,
          payload: { localDate: date, memoryId: matches[0].id },
          scheduledAt: sqlUtc(localScheduleUtc(date, env.ANNIVERSARY_TIME, user.timezone))
        });
      }
    }

    if (user.monthly_recap_enabled && local.day === 1 && afterTime(local, env.MONTHLY_RECAP_TIME) && local.hour < 21) {
      const previous = local.minus({ months: 1 }).toFormat('yyyy-LL');
      if (await memories.countByMonth(user.id, previous)) {
        await notifications.enqueue({
          userId: user.id,
          type: 'recap',
          key: `recap:${user.id}:${previous}`,
          payload: { localDate: date, month: previous },
          scheduledAt: sqlUtc(localScheduleUtc(date, env.MONTHLY_RECAP_TIME, user.timezone))
        });
      }
    }
  }
}

async function sendMemoryTelegram(telegram, chatId, memory, intro) {
  const date = DateTime.fromISO(memory.memory_date).toFormat('LLLL d, yyyy');
  const text = memory.text_content ? `\n\n${escapeHtml(memory.text_content)}` : '';
  const caption = `${escapeHtml(intro)}\n\n<b>${escapeHtml(date)}</b>${text}`.slice(0, 1024);
  const extra = { parse_mode: 'HTML' };
  if (memory.content_type === 'photo') return telegram.sendPhoto(chatId, memory.telegram_file_id, { caption, ...extra });
  if (memory.content_type === 'voice') return telegram.sendVoice(chatId, memory.telegram_file_id, { caption, ...extra });
  return telegram.sendMessage(chatId, caption, extra);
}

export async function deliverNotification(telegram, notification) {
  const user = await users.findUserById(notification.user_id);
  if (!user || !user.onboarding_completed) return;
  const chatId = user.telegram_id;
  const date = notification.payload.localDate;

  if (notification.notification_type === 'daily' || notification.notification_type === 'snooze') {
    if (!user.reminders_enabled) return;
    const checkin = await checkins.ensureCheckin(user.id, date);
    if (checkin.status !== 'pending') return;
    await telegram.sendMessage(chatId, dailyMessage(notification.payload.variant), checkinKeyboard(date));
    await checkins.markCheckinSent(user.id, date);
    return;
  }
  if (notification.notification_type === 'anniversary') {
    if (!user.anniversaries_enabled) return;
    const memory = await memories.findMemory(user.id, notification.payload.memoryId);
    if (memory) await sendMemoryTelegram(telegram, chatId, memory, 'found this one from a year ago.');
    return;
  }
  if (notification.notification_type === 'recap') {
    if (!user.monthly_recap_enabled) return;
    const recap = await buildRecap(user.id, notification.payload.month);
    if (recap) await telegram.sendMessage(chatId, recap, { parse_mode: 'HTML' });
  }
}

export async function processDue(telegram) {
  const claimed = await notifications.claimDue(10);
  for (const item of claimed) {
    try {
      await deliverNotification(telegram, item);
      await notifications.markSent(item.id);
    } catch (error) {
      const delayMinutes = Math.min(60, 2 ** Math.max(0, Number(item.attempt_count) - 1));
      const retryAt = sqlUtc(DateTime.utc().plus({ minutes: delayMinutes }));
      const safeError = `${error?.code ?? error?.response?.error_code ?? 'DELIVERY_ERROR'}: ${error?.description ?? error?.message ?? 'unknown error'}`;
      await notifications.markFailed(item.id, Number(item.attempt_count) + 1, safeError, retryAt);
    }
  }
  return claimed.length;
}
