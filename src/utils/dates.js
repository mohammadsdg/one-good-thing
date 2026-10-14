import { DateTime, IANAZone } from 'luxon';

export const isTimezone = (value) => typeof value === 'string' && IANAZone.isValidZone(value);
export const isTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export const localNow = (timezone, now = DateTime.utc()) => now.setZone(timezone);
export const localDate = (timezone, now = DateTime.utc()) => localNow(timezone, now).toISODate();
export const sqlUtc = (date = DateTime.utc()) => date.toUTC().toFormat('yyyy-LL-dd HH:mm:ss');
export const fromSqlUtc = (value) => DateTime.fromSQL(String(value), { zone: 'utc' });

export function localScheduleUtc(date, hhmm, timezone) {
  const [hour, minute] = hhmm.split(':').map(Number);
  return DateTime.fromISO(date, { zone: timezone }).set({ hour, minute, second: 0, millisecond: 0 }).toUTC();
}

export const displayDate = (date, timezone = 'UTC', options = { month: 'long', day: 'numeric', year: 'numeric' }) =>
  DateTime.fromISO(String(date), { zone: timezone }).toLocaleString(options);

export const monthKey = (timezone, now = DateTime.utc()) => localNow(timezone, now).toFormat('yyyy-LL');

export function previousMonth(key) {
  return DateTime.fromFormat(key, 'yyyy-LL').minus({ months: 1 }).toFormat('yyyy-LL');
}

export function nextMonth(key) {
  return DateTime.fromFormat(key, 'yyyy-LL').plus({ months: 1 }).toFormat('yyyy-LL');
}

export function anniversarySourceDate(localToday) {
  const today = DateTime.fromISO(localToday);
  const priorYear = today.minus({ years: 1 });
  if (today.month === 2 && today.day === 28 && !today.isInLeapYear) return [priorYear.toISODate(), `${today.year - 1}-02-29`];
  return [priorYear.toISODate()];
}
