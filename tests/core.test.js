import test from 'node:test';
import assert from 'node:assert/strict';
import { DateTime } from 'luxon';
import { extractMemory, balancedSelection } from '../src/services/memory.service.js';
import { anniversarySourceDate, localDate, localScheduleUtc } from '../src/utils/dates.js';
import { snoozeOptions } from '../src/services/checkin.service.js';
import { authorize } from '../src/bot/middleware/auth.js';
import { dailyCheckins, pickDailyVariant } from '../src/bot/messages.js';

test('authorization rejects an unauthorized private user without running the handler', async () => {
  let nextCalled = false;
  let reply;
  await authorize({ chat: { type: 'private' }, from: { id: 7 }, reply: async (text) => { reply = text; } }, async () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(reply, "this bot's private.");
});

test('text, photo, and voice memories are extracted without forwarding metadata', () => {
  assert.deepEqual(extractMemory({ message_id: 1, text: '  coffee  ', forward_origin: { sender_user: { id: 99 } } }), {
    contentType: 'text', textContent: 'coffee', fileId: null
  });
  assert.deepEqual(extractMemory({ photo: [{ file_id: 'small' }, { file_id: 'large' }], caption: 'sunset' }), {
    contentType: 'photo', textContent: 'sunset', fileId: 'large'
  });
  assert.deepEqual(extractMemory({ voice: { file_id: 'voice-id' } }), {
    contentType: 'voice', textContent: null, fileId: 'voice-id'
  });
});

test('commands and unsupported media are never treated as memories', () => {
  assert.equal(extractMemory({ text: '/settings' }), null);
  assert.equal(extractMemory({ video: { file_id: 'video' } }), null);
});

test('balanced monthly recap selection spans the collection without ranking', () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({ id: index + 1 }));
  assert.deepEqual(balancedSelection(rows).map((row) => row.id), [1, 4, 8, 11, 14]);
});

test('timezone conversion honors local calendar dates and daylight-saving offsets', () => {
  const instant = DateTime.fromISO('2026-03-29T00:30:00Z');
  assert.equal(localDate('Europe/London', instant), '2026-03-29');
  assert.equal(localScheduleUtc('2026-07-01', '22:30', 'Europe/London').toISO(), '2026-07-01T21:30:00.000Z');
});

test('snoozes crossing the local calendar boundary are rejected', () => {
  const user = { timezone: 'Asia/Tehran' };
  const options = snoozeOptions(user, DateTime.fromISO('2026-10-14T20:20:00Z'));
  assert.deepEqual(options.map((o) => o.valid), [false, false, false]);
});

test('February 29 anniversaries are considered on February 28 in non-leap years', () => {
  assert.deepEqual(anniversarySourceDate('2025-02-28'), ['2024-02-28', '2024-02-29']);
});

test('daily check-in selection never repeats the last variation', () => {
  for (let last = 0; last < dailyCheckins.length; last += 1) {
    for (let attempt = 0; attempt < 20; attempt += 1) assert.notEqual(pickDailyVariant(last), last);
  }
});
