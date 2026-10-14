import { Markup } from 'telegraf';
import { DateTime } from 'luxon';
import { previousMonth, nextMonth } from '../../utils/dates.js';

export const welcomeKeyboard = () => Markup.inlineKeyboard([
  [Markup.button.callback('let’s do it', 'onboard:start')],
  [Markup.button.callback('how it works', 'onboard:help')]
]);

export const checkinKeyboard = (date) => Markup.inlineKeyboard([
  Markup.button.callback('not today', `checkin:skip:${date}`),
  Markup.button.callback('later', `checkin:snooze:${date}`)
]);

export const snoozeKeyboard = (options, date) => {
  const labels = { 30: '30 minutes', 60: '1 hour', 120: '2 hours' };
  const buttons = options
    .filter((option) => option.valid)
    .map((option) => Markup.button.callback(
      labels[option.minutes],
      `snooze:${option.minutes}:${date}`
    ));

  return Markup.inlineKeyboard([buttons, [Markup.button.callback('skip tonight', `checkin:skip:${date}`)]]);
};

export const settingsKeyboard = (user) => Markup.inlineKeyboard([
  [Markup.button.callback(`daily check-in: ${user.reminders_enabled ? 'on' : 'off'}`, 'settings:toggle:reminders_enabled')],
  [Markup.button.callback('change time', 'settings:time'), Markup.button.callback('change timezone', 'settings:timezone')],
  [Markup.button.callback(`anniversaries: ${user.anniversaries_enabled ? 'on' : 'off'}`, 'settings:toggle:anniversaries_enabled')],
  [Markup.button.callback(`monthly recaps: ${user.monthly_recap_enabled ? 'on' : 'off'}`, 'settings:toggle:monthly_recap_enabled')],
  [Markup.button.callback('export', 'settings:export'), Markup.button.callback('delete everything', 'settings:forget')],
  [Markup.button.callback('reset setup', 'settings:reset')]
]);

export const memoryKeyboard = (id) => Markup.inlineKeyboard([
  [Markup.button.callback('edit text', `memory:edit:${id}`), Markup.button.callback('change date', `memory:date:${id}`)],
  [Markup.button.callback('delete', `memory:delete:${id}`)]
]);

export const deleteConfirmKeyboard = (id) => Markup.inlineKeyboard([
  Markup.button.callback('yep, delete it', `memory:confirm_delete:${id}`),
  Markup.button.callback('never mind', 'action:cancel')
]);

export const forgetKeyboard = () => Markup.inlineKeyboard([
  Markup.button.callback('delete everything', 'account:confirm_forget'),
  Markup.button.callback('never mind', 'action:cancel')
]);

export function paginationKeyboard(prefix, key, offset, total, pageSize) {
  const buttons = [];
  if (offset > 0) buttons.push(Markup.button.callback('back', `${prefix}:${key}:${Math.max(0, offset - pageSize)}`));
  if (offset + pageSize < total) buttons.push(Markup.button.callback('more', `${prefix}:${key}:${offset + pageSize}`));
  return buttons.length ? Markup.inlineKeyboard(buttons) : undefined;
}

export function monthKeyboard(month, offset, total, items, pageSize = 10) {
  const rows = [[
    Markup.button.callback('previous month', `month:${previousMonth(month)}:0`),
    Markup.button.callback('next month', `month:${nextMonth(month)}:0`)
  ]];
  const paging = [];
  if (offset > 0) paging.push(Markup.button.callback('◀', `month:${month}:${Math.max(0, offset - pageSize)}`));
  if (offset + pageSize < total) paging.push(Markup.button.callback('▶', `month:${month}:${offset + pageSize}`));
  if (paging.length) rows.push(paging);
  if (items[0]) rows.push([Markup.button.callback('open one', `memory:view:${items[0].id}`)]);
  rows.push([Markup.button.callback('month recap', `recap:${month}`)]);
  return Markup.inlineKeyboard(rows);
}

export function calendarKeyboard(month, populatedDates) {
  const start = DateTime.fromFormat(`${month}-01`, 'yyyy-LL-dd');
  const marked = new Set(populatedDates.map(String));
  const rows = [[
    Markup.button.callback('‹', `calendar:${previousMonth(month)}`),
    Markup.button.callback(start.toFormat('LLLL yyyy'), 'noop'),
    Markup.button.callback('›', `calendar:${nextMonth(month)}`)
  ]];
  rows.push(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => Markup.button.callback(d, 'noop')));
  let week = Array(start.weekday - 1).fill(Markup.button.callback(' ', 'noop'));
  for (let day = 1; day <= start.daysInMonth; day += 1) {
    const date = start.set({ day }).toISODate();
    week.push(Markup.button.callback(marked.has(date) ? `${day}•` : String(day), `date:${date}:0`));
    if (week.length === 7) { rows.push(week); week = []; }
  }
  if (week.length) rows.push([...week, ...Array(7 - week.length).fill(Markup.button.callback(' ', 'noop'))]);
  return Markup.inlineKeyboard(rows);
}
