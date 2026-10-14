import { DateTime } from 'luxon';
import * as checkins from '../database/repositories/checkins.js';
import * as notifications from '../database/repositories/notifications.js';
import { localDate, localNow, sqlUtc } from '../utils/dates.js';

export async function skip(user, date = localDate(user.timezone)) {
  await checkins.skipCheckin(user.id, date);
  await notifications.cancelActive(user.id, 'snooze', date);
  await notifications.cancelActive(user.id, 'daily', date);
}

export function snoozeOptions(user, now = DateTime.utc()) {
  const local = localNow(user.timezone, now);
  return [30, 60, 120].map((minutes) => ({
    minutes,
    valid: local.plus({ minutes }).toISODate() === local.toISODate()
  }));
}

export async function snooze(user, minutes, now = DateTime.utc()) {
  if (![30, 60, 120].includes(minutes)) throw new Error('Invalid snooze duration');
  const local = localNow(user.timezone, now);
  const date = local.toISODate();
  if (local.plus({ minutes }).toISODate() !== date) return false;
  const checkin = await checkins.ensureCheckin(user.id, date);
  if (checkin.status !== 'pending') return false;
  const variant = await notifications.lastDailyVariant(user.id);
  await notifications.cancelActive(user.id, 'snooze', date);
  await notifications.enqueue({
    userId: user.id,
    type: 'snooze',
    key: `snooze:${user.id}:${date}:${Date.now()}`,
    payload: { localDate: date, checkinId: checkin.id, variant },
    scheduledAt: sqlUtc(now.plus({ minutes }))
  });
  return true;
}
