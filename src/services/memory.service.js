import * as memories from '../database/repositories/memories.js';
import * as checkins from '../database/repositories/checkins.js';
import * as notifications from '../database/repositories/notifications.js';
import { localDate } from '../utils/dates.js';

export const MAX_TEXT_LENGTH = 4000;

export function extractMemory(message) {
  if (!message || message.text?.startsWith('/')) return null;
  if (typeof message.text === 'string') {
    const text = message.text.trim();
    if (!text) return null;
    return { contentType: 'text', textContent: text.slice(0, MAX_TEXT_LENGTH), fileId: null };
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    return {
      contentType: 'photo',
      textContent: message.caption?.trim().slice(0, MAX_TEXT_LENGTH) || null,
      fileId: message.photo.at(-1).file_id
    };
  }
  if (message.voice?.file_id) {
    return {
      contentType: 'voice',
      textContent: message.caption?.trim().slice(0, MAX_TEXT_LENGTH) || null,
      fileId: message.voice.file_id
    };
  }
  return null;
}

export async function saveIncoming(user, message, assignedDate = null) {
  const content = extractMemory(message);
  if (!content) return null;
  const date = assignedDate ?? localDate(user.timezone);
  const memory = await memories.createMemory({
    userId: user.id,
    ...content,
    messageId: message.message_id,
    memoryDate: date
  });
  await checkins.completeCheckin(user.id, date);
  await notifications.cancelActive(user.id, 'snooze', date);
  return memory;
}

export function balancedSelection(items, max = 5) {
  if (items.length <= max) return items;
  const selected = new Map();
  for (let index = 0; index < max; index += 1) {
    const position = Math.round(index * (items.length - 1) / (max - 1));
    selected.set(items[position].id, items[position]);
  }
  return [...selected.values()];
}
