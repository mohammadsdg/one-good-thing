import { Telegraf } from 'telegraf';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { authorize } from './middleware/auth.js';
import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';
import { addCommand } from './commands/add.js';
import { memoryCommand } from './commands/memory.js';
import { todayCommand } from './commands/today.js';
import { monthCommand } from './commands/month.js';
import { calendarCommand } from './commands/calendar.js';
import { statsCommand } from './commands/stats.js';
import { settingsCommand } from './commands/settings.js';
import { exportCommand } from './commands/export.js';
import { deleteCommand } from './commands/delete.js';
import { forgetmeCommand } from './commands/forgetme.js';
import { callbackHandler } from './handlers/callbacks.js';
import { messageHandler } from './handlers/messages.js';
import { clearState } from '../database/repositories/states.js';

export const bot = new Telegraf(env.BOT_TOKEN, { handlerTimeout: 30_000 });
bot.use(authorize);
bot.start(startCommand);
bot.help(helpCommand);
bot.command('add', addCommand);
bot.command('memory', memoryCommand);
bot.command('today', todayCommand);
bot.command('month', monthCommand);
bot.command('calendar', calendarCommand);
bot.command('stats', statsCommand);
bot.command('settings', settingsCommand);
bot.command('export', exportCommand);
bot.command('delete', deleteCommand);
bot.command('forgetme', forgetmeCommand);
bot.command('cancel', async (ctx) => {
  await clearState(ctx.state.user.id);
  return ctx.reply('alright, never mind.');
});
bot.on('callback_query', callbackHandler);
bot.on('message', messageHandler);

bot.catch((error, ctx) => {
  logger.error({ err: { name: error.name, message: error.message, code: error.code }, updateType: ctx.updateType }, 'bot update failed');
  return ctx.reply('something broke. try again in a bit.').catch(() => {});
});

export const commands = [
  { command: 'start', description: 'open the welcome screen' },
  { command: 'help', description: 'see what i can do' },
  { command: 'add', description: 'save something' },
  { command: 'memory', description: 'pull up an old memory' },
  { command: 'today', description: "see today's memories" },
  { command: 'month', description: 'browse a month' },
  { command: 'calendar', description: 'pick a date' },
  { command: 'stats', description: 'see the numbers' },
  { command: 'settings', description: 'change things' },
  { command: 'export', description: 'download your data' },
  { command: 'delete', description: 'delete a memory' },
  { command: 'forgetme', description: 'delete everything' },
  { command: 'cancel', description: 'never mind' }
];
