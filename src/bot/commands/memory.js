import * as memories from '../../database/repositories/memories.js';
import { sendMemory } from '../render.js';
import { memoryIntros, pick } from '../messages.js';

const lastShown = new Map();
export async function memoryCommand(ctx) {
  const userId = ctx.state.user.id;
  const memory = await memories.randomMemory(userId, lastShown.get(String(userId)));
  if (!memory) return ctx.reply('nothing here yet. give it time.');
  lastShown.set(String(userId), memory.id);
  return sendMemory(ctx, memory, pick(memoryIntros));
}
