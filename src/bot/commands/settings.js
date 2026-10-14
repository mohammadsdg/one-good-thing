import { settingsKeyboard } from '../keyboards/index.js';

export async function settingsCommand(ctx) {
  const user = ctx.state.user;
  const time = String(user.reminder_time).slice(0, 5);
  return ctx.reply(`settings\n\ntimezone: ${user.timezone}\ndaily check-in: ${time}\nstarted: ${String(user.created_at).replace(' ', ' UTC ')}`, settingsKeyboard(user));
}
