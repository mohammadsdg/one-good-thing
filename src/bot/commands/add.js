import { setState } from '../../database/repositories/states.js';
import { env } from '../../config/env.js';

export async function addCommand(ctx) {
  await setState(ctx.state.user.id, 'awaiting_memory', {}, env.CONVERSATION_TTL_MINUTES);
  return ctx.reply("what're we keeping?");
}
