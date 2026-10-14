export async function helpCommand(ctx) {
  return ctx.reply(`here's what i know.\n\n/add — save something\n/memory — pull up an old one\n/today — today's stuff\n/month — browse a month\n/calendar — pick a date\n/stats — see the numbers\n/settings — change things\n/export — download your data\n/delete — remove one\n/forgetme — delete everything\n/cancel — never mind\n\nyou can also just send text, a photo, or a voice note.`);
}
