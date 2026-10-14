import { DateTime } from 'luxon';
import { Markup } from 'telegraf';
import { env } from '../../config/env.js';
import * as memories from '../../database/repositories/memories.js';
import * as states from '../../database/repositories/states.js';
import * as users from '../../database/repositories/users.js';
import { skip, snooze, snoozeOptions } from '../../services/checkin.service.js';
import { buildRecap } from '../../services/recap.service.js';
import { deleteAccount } from '../../services/user.service.js';
import { showCalendar } from '../commands/calendar.js';
import { exportCommand } from '../commands/export.js';
import { forgetmeCommand } from '../commands/forgetme.js';
import { showMonth } from '../commands/month.js';
import { deleteConfirmKeyboard, settingsKeyboard, snoozeKeyboard } from '../keyboards/index.js';
import { pick, skipReplies } from '../messages.js';
import { sendDatePage, sendMemory } from '../render.js';

const ONBOARDING_TTL_MINUTES = 60 * 24 * 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(value) && DateTime.fromFormat(value, 'yyyy-LL').isValid;
}

function expiredAction(ctx) {
  return ctx.reply("that button's old. try the command again.");
}

async function startOnboarding(ctx) {
  const user = ctx.state.user;

  if (user.onboarding_completed) {
    return ctx.reply("you're already set. /settings is there if you wanna change anything.");
  }

  await states.setState(user.id, 'onboarding_timezone', {}, ONBOARDING_TTL_MINUTES);

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`use ${env.DEFAULT_TIMEZONE}`, 'onboard:tzdefault')]
  ]);

  return ctx.reply(
    'what timezone are you in? send something like Asia/Tehran, or use the default.',
    keyboard
  );
}

async function handleOnboarding(ctx, data) {
  const user = ctx.state.user;

  if (data === 'onboard:start') return startOnboarding(ctx);

  if (data === 'onboard:help') {
    return ctx.reply(
      "i'll check in at night. send text, a photo, or a voice note. " +
      "i'll keep it until you delete it. that's the whole deal."
    );
  }

  if (data === 'onboard:tzdefault') {
    await users.updateUser(user.id, { timezone: env.DEFAULT_TIMEZONE });
    await states.setState(user.id, 'onboarding_time', {}, ONBOARDING_TTL_MINUTES);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(`use ${env.DEFAULT_REMINDER_TIME}`, 'onboard:timedefault')]
    ]);

    return ctx.reply(
      `what time should i show up? send HH:MM. default's ${env.DEFAULT_REMINDER_TIME}.`,
      keyboard
    );
  }

  if (data === 'onboard:timedefault') {
    await users.updateUser(user.id, {
      reminder_time: `${env.DEFAULT_REMINDER_TIME}:00`,
      onboarding_completed: 1
    });
    await states.clearState(user.id);

    const friendlyTime = DateTime.fromFormat(env.DEFAULT_REMINDER_TIME, 'HH:mm').toFormat('h:mm a');
    return ctx.reply(`we're good. i'll check in around ${friendlyTime}.`);
  }

  return expiredAction(ctx);
}

async function handleCheckin(ctx, data) {
  const user = ctx.state.user;
  let match = data.match(/^checkin:skip:(\d{4}-\d{2}-\d{2})$/);

  if (match) {
    await skip(user, match[1]);
    return ctx.reply(pick(skipReplies));
  }

  match = data.match(/^checkin:snooze:(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    return ctx.reply('when should i come back?', snoozeKeyboard(snoozeOptions(user), match[1]));
  }

  match = data.match(/^snooze:(30|60|120):(\d{4}-\d{2}-\d{2})$/);
  if (!match) return expiredAction(ctx);

  const [, minutes, checkinDate] = match;
  const today = DateTime.utc().setZone(user.timezone).toISODate();

  if (checkinDate !== today) return ctx.reply("that check-in's old now.");

  const scheduled = await snooze(user, Number(minutes));
  return ctx.reply(
    scheduled
      ? "alright, i'll be back later."
      : "that lands after midnight. let's just skip tonight."
  );
}

async function handleSettings(ctx, data) {
  const user = ctx.state.user;
  const toggle = data.match(
    /^settings:toggle:(reminders_enabled|anniversaries_enabled|monthly_recap_enabled)$/
  );

  if (toggle) {
    const field = toggle[1];
    const updated = await users.updateUser(user.id, { [field]: user[field] ? 0 : 1 });
    return ctx.reply("done. we're good.", settingsKeyboard(updated));
  }

  if (data === 'settings:time') {
    await states.setState(user.id, 'settings_time', {}, env.CONVERSATION_TTL_MINUTES);
    return ctx.reply('send the new time like HH:MM.');
  }

  if (data === 'settings:timezone') {
    await states.setState(user.id, 'settings_timezone', {}, env.CONVERSATION_TTL_MINUTES);
    return ctx.reply('send the new timezone, like Asia/Tehran.');
  }

  if (data === 'settings:export') return exportCommand(ctx);
  if (data === 'settings:forget') return forgetmeCommand(ctx);

  if (data === 'settings:reset') {
    await users.updateUser(user.id, {
      timezone: env.DEFAULT_TIMEZONE,
      reminder_time: `${env.DEFAULT_REMINDER_TIME}:00`,
      reminders_enabled: 1,
      anniversaries_enabled: 1,
      monthly_recap_enabled: 1,
      onboarding_completed: 0
    });
    await states.setState(user.id, 'onboarding_timezone', {}, ONBOARDING_TTL_MINUTES);
    return ctx.reply("setup's reset. your memories are fine. what timezone are you in?");
  }

  return expiredAction(ctx);
}

async function handleMemoryAction(ctx, data) {
  const match = data.match(/^memory:(view|edit|date|delete|confirm_delete):(\d+)$/);
  if (!match) return expiredAction(ctx);

  const [, action, memoryId] = match;
  const userId = ctx.state.user.id;

  if (action === 'confirm_delete') {
    const deleted = await memories.deleteMemory(userId, memoryId);
    return ctx.reply(deleted ? 'gone.' : "can't find that one anymore.");
  }

  const memory = await memories.findMemory(userId, memoryId);
  if (!memory) return ctx.reply("can't find that one anymore.");

  if (action === 'view') return sendMemory(ctx, memory);

  if (action === 'edit') {
    await states.setState(
      userId,
      'editing_text',
      { memoryId },
      env.CONVERSATION_TTL_MINUTES
    );
    return ctx.reply('send the new text or caption.');
  }

  if (action === 'date') {
    await states.setState(
      userId,
      'editing_date',
      { memoryId },
      env.CONVERSATION_TTL_MINUTES
    );
    return ctx.reply('send the new date like YYYY-MM-DD.');
  }

  return ctx.reply('delete this one?', deleteConfirmKeyboard(memoryId));
}

async function handleBrowsing(ctx, data) {
  const userId = ctx.state.user.id;
  let match = data.match(/^date:(\d{4}-\d{2}-\d{2}):(\d+)$/);

  if (match && DATE_PATTERN.test(match[1])) {
    return sendDatePage(ctx, userId, match[1], memories, Number(match[2]));
  }

  match = data.match(/^month:(\d{4}-\d{2}):(\d+)$/);
  if (match && isValidMonth(match[1])) {
    return showMonth(ctx, match[1], Number(match[2]));
  }

  match = data.match(/^calendar:(\d{4}-\d{2})$/);
  if (match && isValidMonth(match[1])) return showCalendar(ctx, match[1]);

  match = data.match(/^recap:(\d{4}-\d{2})$/);
  if (match && isValidMonth(match[1])) {
    const recap = await buildRecap(userId, match[1]);
    return ctx.reply(recap ?? 'nothing saved that month.', { parse_mode: 'HTML' });
  }

  return expiredAction(ctx);
}

async function forgetAccount(ctx) {
  const user = ctx.state.user;
  const state = await states.getState(user.id);

  if (state?.state !== 'confirm_forget') {
    return ctx.reply("that button's old. use /forgetme again.");
  }

  await deleteAccount(user.id);
  return ctx.reply(
    'gone from the active database. old backups hang around until their retention window ends.'
  );
}

export async function callbackHandler(ctx) {
  const data = ctx.callbackQuery?.data ?? '';
  await ctx.answerCbQuery().catch(() => {});

  if (data === 'noop') return;

  if (data === 'action:cancel') {
    await states.clearState(ctx.state.user.id);
    return ctx.reply('alright, never mind.');
  }

  if (data.startsWith('onboard:')) return handleOnboarding(ctx, data);
  if (data.startsWith('checkin:') || data.startsWith('snooze:')) {
    return handleCheckin(ctx, data);
  }
  if (data.startsWith('settings:')) return handleSettings(ctx, data);
  if (data.startsWith('memory:')) return handleMemoryAction(ctx, data);
  if (/^(date|month|calendar|recap):/.test(data)) return handleBrowsing(ctx, data);
  if (data === 'account:confirm_forget') return forgetAccount(ctx);
  return expiredAction(ctx);
}
