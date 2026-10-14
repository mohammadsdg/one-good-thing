import { Markup } from 'telegraf';
import { DateTime } from 'luxon';
import { env } from '../../config/env.js';
import * as users from '../../database/repositories/users.js';
import * as memories from '../../database/repositories/memories.js';
import * as states from '../../database/repositories/states.js';
import * as checkins from '../../database/repositories/checkins.js';
import { skip, snooze, snoozeOptions } from '../../services/checkin.service.js';
import { deleteAccount } from '../../services/user.service.js';
import { buildRecap } from '../../services/recap.service.js';
import { sendMemory, sendDatePage } from '../render.js';
import { deleteConfirmKeyboard, settingsKeyboard, snoozeKeyboard } from '../keyboards/index.js';
import { showMonth } from '../commands/month.js';
import { showCalendar } from '../commands/calendar.js';
import { exportCommand } from '../commands/export.js';
import { forgetmeCommand } from '../commands/forgetme.js';
import { pick, skipReplies } from '../messages.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const monthPattern = /^\d{4}-\d{2}$/;
const validMonth = (value) => monthPattern.test(value) && DateTime.fromFormat(value, 'yyyy-LL').isValid;
const onboardingTtlMinutes = 60 * 24 * 30;

async function beginOnboarding(ctx) {
  if (ctx.state.user.onboarding_completed) return ctx.reply("you're already set. /settings is there if you wanna change anything.");
  await states.setState(ctx.state.user.id, 'onboarding_timezone', {}, onboardingTtlMinutes);
  return ctx.reply(`what timezone are you in? send something like Asia/Tehran, or use the default.`, Markup.inlineKeyboard([[Markup.button.callback(`use ${env.DEFAULT_TIMEZONE}`, 'onboard:tzdefault')]]));
}

export async function callbackHandler(ctx) {
  const data = ctx.callbackQuery?.data ?? '';
  await ctx.answerCbQuery().catch(() => {});
  const user = ctx.state.user;

  if (data === 'noop') return;
  if (data === 'action:cancel') { await states.clearState(user.id); return ctx.reply('alright, never mind.'); }
  if (data === 'onboard:start') return beginOnboarding(ctx);
  if (data === 'onboard:help') return ctx.reply("i'll check in at night. send text, a photo, or a voice note. i'll keep it until you delete it. that's the whole deal.");
  if (data === 'onboard:tzdefault') {
    await users.updateUser(user.id, { timezone: env.DEFAULT_TIMEZONE });
    await states.setState(user.id, 'onboarding_time', {}, onboardingTtlMinutes);
    return ctx.reply(`what time should i show up? send HH:MM. default's ${env.DEFAULT_REMINDER_TIME}.`, Markup.inlineKeyboard([[Markup.button.callback(`use ${env.DEFAULT_REMINDER_TIME}`, 'onboard:timedefault')]]));
  }
  if (data === 'onboard:timedefault') {
    await users.updateUser(user.id, { reminder_time: `${env.DEFAULT_REMINDER_TIME}:00`, onboarding_completed: 1 });
    await states.clearState(user.id);
    return ctx.reply(`we're good. i'll check in around ${DateTime.fromFormat(env.DEFAULT_REMINDER_TIME, 'HH:mm').toFormat('h:mm a')}.`);
  }

  let match = data.match(/^checkin:skip:(\d{4}-\d{2}-\d{2})$/);
  if (match) { await skip(user, match[1]); return ctx.reply(pick(skipReplies)); }
  match = data.match(/^checkin:snooze:(\d{4}-\d{2}-\d{2})$/);
  if (match) return ctx.reply('when should i come back?', snoozeKeyboard(snoozeOptions(user), match[1]));
  match = data.match(/^snooze:(30|60|120):(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    if (match[2] !== DateTime.utc().setZone(user.timezone).toISODate()) return ctx.reply("that check-in's old now.");
    const ok = await snooze(user, Number(match[1]));
    return ctx.reply(ok ? "alright, i'll be back later." : "that lands after midnight. let's just skip tonight.");
  }

  match = data.match(/^settings:toggle:(reminders_enabled|anniversaries_enabled|monthly_recap_enabled)$/);
  if (match) {
    const field = match[1];
    const updated = await users.updateUser(user.id, { [field]: user[field] ? 0 : 1 });
    return ctx.reply("done. we're good.", settingsKeyboard(updated));
  }
  if (data === 'settings:time') { await states.setState(user.id, 'settings_time', {}, env.CONVERSATION_TTL_MINUTES); return ctx.reply('send the new time like HH:MM.'); }
  if (data === 'settings:timezone') { await states.setState(user.id, 'settings_timezone', {}, env.CONVERSATION_TTL_MINUTES); return ctx.reply('send the new timezone, like Asia/Tehran.'); }
  if (data === 'settings:export') return exportCommand(ctx);
  if (data === 'settings:forget') return forgetmeCommand(ctx);
  if (data === 'settings:reset') {
    await users.updateUser(user.id, { timezone: env.DEFAULT_TIMEZONE, reminder_time: `${env.DEFAULT_REMINDER_TIME}:00`, reminders_enabled: 1, anniversaries_enabled: 1, monthly_recap_enabled: 1, onboarding_completed: 0 });
    await states.setState(user.id, 'onboarding_timezone', {}, onboardingTtlMinutes);
    return ctx.reply("setup's reset. your memories are fine. what timezone are you in?");
  }

  match = data.match(/^memory:view:(\d+)$/);
  if (match) {
    const memory = await memories.findMemory(user.id, match[1]);
    return memory ? sendMemory(ctx, memory) : ctx.reply("can't find that one anymore.");
  }
  match = data.match(/^memory:edit:(\d+)$/);
  if (match) {
    if (!await memories.findMemory(user.id, match[1])) return ctx.reply("can't find that one anymore.");
    await states.setState(user.id, 'editing_text', { memoryId: match[1] }, env.CONVERSATION_TTL_MINUTES);
    return ctx.reply('send the new text or caption.');
  }
  match = data.match(/^memory:date:(\d+)$/);
  if (match) {
    if (!await memories.findMemory(user.id, match[1])) return ctx.reply("can't find that one anymore.");
    await states.setState(user.id, 'editing_date', { memoryId: match[1] }, env.CONVERSATION_TTL_MINUTES);
    return ctx.reply('send the new date like YYYY-MM-DD.');
  }
  match = data.match(/^memory:delete:(\d+)$/);
  if (match) {
    if (!await memories.findMemory(user.id, match[1])) return ctx.reply("can't find that one anymore.");
    return ctx.reply('delete this one?', deleteConfirmKeyboard(match[1]));
  }
  match = data.match(/^memory:confirm_delete:(\d+)$/);
  if (match) return ctx.reply(await memories.deleteMemory(user.id, match[1]) ? 'gone.' : "can't find that one anymore.");

  match = data.match(/^date:(\d{4}-\d{2}-\d{2}):(\d+)$/);
  if (match && datePattern.test(match[1])) return sendDatePage(ctx, user.id, match[1], memories, Number(match[2]));
  match = data.match(/^month:(\d{4}-\d{2}):(\d+)$/);
  if (match && validMonth(match[1])) return showMonth(ctx, match[1], Number(match[2]));
  match = data.match(/^calendar:(\d{4}-\d{2})$/);
  if (match && validMonth(match[1])) return showCalendar(ctx, match[1]);
  match = data.match(/^recap:(\d{4}-\d{2})$/);
  if (match && validMonth(match[1])) return ctx.reply((await buildRecap(user.id, match[1])) ?? 'nothing saved that month.', { parse_mode: 'HTML' });

  if (data === 'account:confirm_forget') {
    const state = await states.getState(user.id);
    if (state?.state !== 'confirm_forget') return ctx.reply("that button's old. use /forgetme again.");
    await deleteAccount(user.id);
    return ctx.reply('gone from the active database. old backups hang around until their retention window ends.');
  }
  return ctx.reply("that button's old. try the command again.");
}
