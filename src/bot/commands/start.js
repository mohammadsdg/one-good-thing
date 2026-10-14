import { welcomeKeyboard } from '../keyboards/index.js';

export async function startCommand(ctx) {
  return ctx.reply(`hey. glad you're here.\n\ni'll check in every night. you tell me if anything good happened. that's pretty much it.\n\ntext, photo, voice note — whatever works. skipping is fine too.`, welcomeKeyboard());
}
