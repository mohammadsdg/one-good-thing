import { env } from '../../config/env.js';
import { getOrCreateUser } from '../../services/user.service.js';

export async function authorize(ctx, next) {
  if (ctx.chat?.type !== 'private' || Number(ctx.from?.id) !== env.ALLOWED_TELEGRAM_USER_ID) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('nope.').catch(() => {});
    else if (ctx.chat?.type === 'private') await ctx.reply("this bot's private.").catch(() => {});
    return;
  }
  ctx.state.user = await getOrCreateUser(ctx.from.id);
  return next();
}
