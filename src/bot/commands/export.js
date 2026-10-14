import { createExport } from '../../services/export.service.js';

export async function exportCommand(ctx) {
  const pending = await ctx.reply('packing it all up. one sec.');
  const artifact = await createExport(ctx.state.user);
  try {
    await ctx.replyWithDocument({ source: artifact.archivePath, filename: 'one-good-thing-export.zip' }, {
      caption: 'here you go. media references are included, but not the original files.'
    });
  } finally {
    await artifact.cleanup();
    await ctx.telegram.deleteMessage(ctx.chat.id, pending.message_id).catch(() => {});
  }
}
