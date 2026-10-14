import { Markup } from 'telegraf';
import * as memories from '../../database/repositories/memories.js';
import { truncate } from '../../utils/html.js';

export async function deleteCommand(ctx) {
  const rows = await memories.listRecent(ctx.state.user.id, 10);
  if (!rows.length) return ctx.reply('nothing here to delete. easy enough.');
  const keyboard = rows.map((row) => [Markup.button.callback(`${row.memory_date} — ${truncate(row.text_content || row.content_type, 35)}`, `memory:delete:${row.id}`)]);
  keyboard.push([Markup.button.callback('never mind', 'action:cancel')]);
  return ctx.reply('which one’s going?', Markup.inlineKeyboard(keyboard));
}
