import { DateTime } from 'luxon';
import * as memories from '../database/repositories/memories.js';
import { balancedSelection } from './memory.service.js';
import { escapeHtml, truncate } from '../utils/html.js';

export async function buildRecap(userId, month) {
  const all = await memories.listByMonth(userId, month, 10000, 0);
  if (!all.length) return null;
  const title = DateTime.fromFormat(month, 'yyyy-LL').toFormat('LLLL');
  const selected = balancedSelection(all);
  const lines = selected.map((item) => {
    const day = DateTime.fromISO(item.memory_date).toFormat('LLLL d');
    const content = item.text_content || (item.content_type === 'photo' ? '[photo]' : '[voice note]');
    return `• ${escapeHtml(day)} — ${escapeHtml(truncate(content, 180))}`;
  });
  return `<b>so, here's how ${escapeHtml(title)} went.</b>\n\n${all.length} ${all.length === 1 ? 'thing' : 'things'} made the collection.\n\n${lines.join('\n')}\n\nthat's the month.`;
}
