import * as memories from '../../database/repositories/memories.js';
import { monthKey } from '../../utils/dates.js';
import { calendarKeyboard } from '../keyboards/index.js';

export async function showCalendar(ctx, month = monthKey(ctx.state.user.timezone)) {
  const dates = await memories.datesInMonth(ctx.state.user.id, month);
  return ctx.reply('pick a date. dots mean there’s something there.', calendarKeyboard(month, dates));
}
export const calendarCommand = (ctx) => showCalendar(ctx);
