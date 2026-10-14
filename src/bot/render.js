import { DateTime } from 'luxon';
import { escapeHtml, truncate } from '../utils/html.js';
import { memoryKeyboard, paginationKeyboard } from './keyboards/index.js';

export async function sendMemory(ctx, memory, intro = 'found this one.') {
  const date = DateTime.fromISO(memory.memory_date).toFormat('LLLL d, yyyy');
  const text = memory.text_content ? `\n\n${escapeHtml(memory.text_content)}` : '';
  const caption = `${escapeHtml(intro)}\n\n<b>${escapeHtml(date)}</b>${text}`.slice(0, 1024);
  const extra = { parse_mode: 'HTML', ...memoryKeyboard(memory.id) };
  if (memory.content_type === 'photo') return ctx.replyWithPhoto(memory.telegram_file_id, { caption, ...extra });
  if (memory.content_type === 'voice') return ctx.replyWithVoice(memory.telegram_file_id, { caption, ...extra });
  return ctx.reply(caption, extra);
}

export function memoryListText(title, items, total = items.length) {
  const body = items.map((item, index) => {
    const content = item.text_content || (item.content_type === 'photo' ? '[photo]' : '[voice note]');
    return `${index + 1}. ${escapeHtml(truncate(content, 300))}`;
  }).join('\n\n');
  return `<b>${escapeHtml(title)}</b>\n\n${body || 'nothing here.'}${total > items.length ? `\n\n${items.length} of ${total} shown.` : ''}`;
}

export async function sendDatePage(ctx, userId, date, repository, offset = 0) {
  const size = 10;
  const [items, total] = await Promise.all([
    repository.listByDate(userId, date, size, offset),
    repository.countByDate(userId, date)
  ]);
  const title = DateTime.fromISO(date).toFormat('LLLL d, yyyy');
  const keyboard = paginationKeyboard('date', date, offset, total, size);
  return ctx.reply(memoryListText(title, items, total), { parse_mode: 'HTML', ...(keyboard ?? {}) });
}
