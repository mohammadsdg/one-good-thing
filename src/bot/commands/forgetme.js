import { forgetKeyboard } from '../keyboards/index.js';
import { setState } from '../../database/repositories/states.js';

export async function forgetmeCommand(ctx) {
  await setState(ctx.state.user.id, 'confirm_forget', {}, 10);
  return ctx.reply(`delete everything?\n\nmemories, settings, all of it. this can't be undone.`, forgetKeyboard());
}
