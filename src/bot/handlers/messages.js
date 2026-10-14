import { DateTime } from 'luxon';
import { env } from '../../config/env.js';
import { clearState, getState, setState } from '../../database/repositories/states.js';
import { updateUser } from '../../database/repositories/users.js';
import * as memories from '../../database/repositories/memories.js';
import { isTime, isTimezone } from '../../utils/dates.js';
import { extractMemory, saveIncoming } from '../../services/memory.service.js';
import { pick, savedReplies } from '../messages.js';

const onboardingTtlMinutes = 60 * 24 * 30;

const validDate = (value) => {
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  return parsed.isValid && parsed.toISODate() === value;
};

export async function messageHandler(ctx) {
  const user = ctx.state.user;
  const state = await getState(user.id);
  const text = ctx.message?.text?.trim();

  if (state?.state === 'onboarding_timezone' || state?.state === 'settings_timezone') {
    if (!isTimezone(text)) return ctx.reply("that timezone doesn't look right. try something like Asia/Tehran.");
    await updateUser(user.id, { timezone: text });
    if (state.state === 'onboarding_timezone') {
      await setState(user.id, 'onboarding_time', {}, onboardingTtlMinutes);
      return ctx.reply(`what time should i show up? send it like HH:MM. ${env.DEFAULT_REMINDER_TIME} works too.`);
    }
    await clearState(user.id);
    return ctx.reply(`done. timezone's ${text} now.`);
  }

  if (state?.state === 'onboarding_time' || state?.state === 'settings_time') {
    if (!isTime(text)) return ctx.reply("that time's a little weird. try HH:MM, like 22:30.");
    const updated = await updateUser(user.id, { reminder_time: `${text}:00`, onboarding_completed: state.state === 'onboarding_time' ? 1 : user.onboarding_completed });
    await clearState(user.id);
    if (state.state === 'onboarding_time') return ctx.reply(`we're good. i'll check in around ${DateTime.fromFormat(text, 'HH:mm').toFormat('h:mm a')}.`);
    return ctx.reply(`done. i'll show up around ${String(updated.reminder_time).slice(0, 5)}.`);
  }

  if (state?.state === 'editing_text') {
    if (!text || text.startsWith('/')) return ctx.reply('send the new text or caption. /cancel works too.');
    const memory = await memories.updateMemory(user.id, state.payload.memoryId, { text_content: text.slice(0, 4000) });
    await clearState(user.id);
    return ctx.reply(memory ? 'updated.' : "can't find that one anymore.");
  }

  if (state?.state === 'editing_date') {
    if (!validDate(text)) return ctx.reply('send the date like YYYY-MM-DD. or /cancel.');
    const memory = await memories.updateMemory(user.id, state.payload.memoryId, { memory_date: text });
    await clearState(user.id);
    return ctx.reply(memory ? `cool. moved it to ${text}.` : "can't find that one anymore.");
  }

  if (state?.state === 'confirm_forget') {
    return ctx.reply('use the button if you mean it. otherwise, /cancel.');
  }

  const candidate = extractMemory(ctx.message);
  if (!candidate) {
    if (state?.state === 'awaiting_memory') return ctx.reply('text, photo, or voice note. /cancel if you changed your mind.');
    if (ctx.message?.text?.startsWith('/')) return ctx.reply("uh, don't know that one. try /help.");
    return;
  }
  const memory = await saveIncoming(user, ctx.message);
  if (state?.state === 'awaiting_memory') await clearState(user.id);
  if (memory) {
    return ctx.reply(pick(savedReplies));
  }
}
