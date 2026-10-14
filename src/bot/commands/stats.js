import * as memories from '../../database/repositories/memories.js';
import { monthKey } from '../../utils/dates.js';
import { displayDate } from '../../utils/dates.js';

export async function statsCommand(ctx) {
  const stats = await memories.statistics(ctx.state.user.id, monthKey(ctx.state.user.timezone));
  const first = stats.first_date ? displayDate(stats.first_date, ctx.state.user.timezone) : 'not yet';
  return ctx.reply(`here's the count.\n\ntotal: ${stats.total}\ndays with something saved: ${stats.unique_days}\nthis month: ${stats.month_count}\nfirst one: ${first}`);
}
