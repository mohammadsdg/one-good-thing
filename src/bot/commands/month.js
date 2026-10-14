import { DateTime } from 'luxon';
import * as memories from '../../database/repositories/memories.js';
import { monthKey } from '../../utils/dates.js';
import { escapeHtml, truncate } from '../../utils/html.js';
import { monthKeyboard } from '../keyboards/index.js';

export async function showMonth(ctx, month = monthKey(ctx.state.user.timezone), offset = 0) {
  const size = 10;
  const [items, total] = await Promise.all([memories.listByMonth(ctx.state.user.id, month, size, offset), memories.countByMonth(ctx.state.user.id, month)]);
  const heading = DateTime.fromFormat(month, 'yyyy-LL').toFormat('LLLL yyyy');
  const lines = items.map((item) => {
    const date = DateTime.fromISO(item.memory_date).toFormat('LLLL d');
    const content = item.text_content || (item.content_type === 'photo' ? '[photo]' : '[voice note]');
    return `${escapeHtml(date)} — ${escapeHtml(truncate(content, 250))}`;
  });
  const text = `<b>${escapeHtml(heading)}</b>\n\n${lines.join('\n\n') || 'nothing saved this month.'}\n\n${total} ${total === 1 ? 'thing' : 'things'} in the collection.`;
  return ctx.reply(text, { parse_mode: 'HTML', ...monthKeyboard(month, offset, total, items, size) });
}

export const monthCommand = (ctx) => showMonth(ctx);
