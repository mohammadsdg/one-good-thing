import { DateTime } from 'luxon';
import { env } from '../../config/env.js';
import * as memories from '../../database/repositories/memories.js';
import { clearState, getState, setState } from '../../database/repositories/states.js';
import { updateUser } from '../../database/repositories/users.js';
import { extractMemory, saveIncoming } from '../../services/memory.service.js';
import { isTime, isTimezone } from '../../utils/dates.js';
import { pick, savedReplies } from '../messages.js';

const ONBOARDING_TTL_MINUTES = 60 * 24 * 30;

function isCalendarDate(value) {
  const date = DateTime.fromISO(value, { zone: 'utc' });
  return date.isValid && date.toISODate() === value;
}

async function saveTimezone(ctx, state, text) {
  const user = ctx.state.user;

  if (!isTimezone(text)) {
    return ctx.reply("that timezone doesn't look right. try something like Asia/Tehran.");
  }

  await updateUser(user.id, { timezone: text });

  if (state.state === 'onboarding_timezone') {
    await setState(user.id, 'onboarding_time', {}, ONBOARDING_TTL_MINUTES);
    return ctx.reply(
      `what time should i show up? send it like HH:MM. ${env.DEFAULT_REMINDER_TIME} works too.`
    );
  }

  await clearState(user.id);
  return ctx.reply(`done. timezone's ${text} now.`);
}

async function saveReminderTime(ctx, state, text) {
  const user = ctx.state.user;

  if (!isTime(text)) {
    return ctx.reply("that time's a little weird. try HH:MM, like 22:30.");
  }

  const finishingOnboarding = state.state === 'onboarding_time';
  const updated = await updateUser(user.id, {
    reminder_time: `${text}:00`,
    onboarding_completed: finishingOnboarding ? 1 : user.onboarding_completed
  });

  await clearState(user.id);

  if (finishingOnboarding) {
    const friendlyTime = DateTime.fromFormat(text, 'HH:mm').toFormat('h:mm a');
    return ctx.reply(`we're good. i'll check in around ${friendlyTime}.`);
  }

  return ctx.reply(`done. i'll show up around ${String(updated.reminder_time).slice(0, 5)}.`);
}

async function editMemoryText(ctx, state, text) {
  if (!text || text.startsWith('/')) {
    return ctx.reply('send the new text or caption. /cancel works too.');
  }

  const memory = await memories.updateMemory(ctx.state.user.id, state.payload.memoryId, {
    text_content: text.slice(0, 4000)
  });

  await clearState(ctx.state.user.id);
  return ctx.reply(memory ? 'updated.' : "can't find that one anymore.");
}

async function editMemoryDate(ctx, state, text) {
  if (!isCalendarDate(text)) {
    return ctx.reply('send the date like YYYY-MM-DD. or /cancel.');
  }

  const memory = await memories.updateMemory(ctx.state.user.id, state.payload.memoryId, {
    memory_date: text
  });

  await clearState(ctx.state.user.id);
  return ctx.reply(memory ? `cool. moved it to ${text}.` : "can't find that one anymore.");
}

async function handleConversation(ctx, state, text) {
  switch (state?.state) {
    case 'onboarding_timezone':
    case 'settings_timezone':
      return saveTimezone(ctx, state, text);

    case 'onboarding_time':
    case 'settings_time':
      return saveReminderTime(ctx, state, text);

    case 'editing_text':
      return editMemoryText(ctx, state, text);

    case 'editing_date':
      return editMemoryDate(ctx, state, text);

    case 'confirm_forget':
      return ctx.reply('use the button if you mean it. otherwise, /cancel.');

    default:
      return null;
  }
}

export async function messageHandler(ctx) {
  const user = ctx.state.user;
  const state = await getState(user.id);
  const text = ctx.message?.text?.trim();
  const conversationReply = await handleConversation(ctx, state, text);

  if (conversationReply) return conversationReply;

  const incoming = extractMemory(ctx.message);
  if (!incoming) {
    if (state?.state === 'awaiting_memory') {
      return ctx.reply('text, photo, or voice note. /cancel if you changed your mind.');
    }
    if (ctx.message?.text?.startsWith('/')) {
      return ctx.reply("uh, don't know that one. try /help.");
    }
    return;
  }

  const memory = await saveIncoming(user, ctx.message);
  if (state?.state === 'awaiting_memory') await clearState(user.id);
  if (memory) return ctx.reply(pick(savedReplies));
}
