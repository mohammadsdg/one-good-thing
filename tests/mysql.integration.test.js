import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.RUN_MYSQL_INTEGRATION === '1';

test('MySQL integration: memory lifecycle, check-ins, deduplication, and account cascade', { skip: !enabled }, async () => {
  const { pool } = await import('../src/database/pool.js');
  const users = await import('../src/database/repositories/users.js');
  const memories = await import('../src/database/repositories/memories.js');
  const checkins = await import('../src/database/repositories/checkins.js');
  const notifications = await import('../src/database/repositories/notifications.js');
  const telegramId = `8${Date.now()}`;
  const user = await users.ensureUser(telegramId, { timezone: 'Asia/Tehran', reminderTime: '22:30' });

  const first = await memories.createMemory({ userId: user.id, contentType: 'text', textContent: 'coffee', memoryDate: '2026-10-14' });
  const second = await memories.createMemory({ userId: user.id, contentType: 'photo', textContent: 'sunset', fileId: 'file-id', memoryDate: '2026-10-14' });
  assert.notEqual(first.id, second.id, 'multiple memories on one day receive unique IDs');
  assert.equal(await memories.countByDate(user.id, '2026-10-14'), 2);

  await checkins.completeCheckin(user.id, '2026-10-13');
  assert.equal((await checkins.getCheckin(user.id, '2026-10-13')).status, 'completed', 'a manual memory can suppress the later daily prompt');

  await memories.updateMemory(user.id, first.id, { text_content: 'good coffee', memory_date: '2026-10-13' });
  assert.equal((await memories.findMemory(user.id, first.id)).text_content, 'good coffee');
  assert.equal((await memories.listByMonth(user.id, '2026-10', 10, 0)).length, 2);

  await checkins.ensureCheckin(user.id, '2026-10-14');
  await checkins.skipCheckin(user.id, '2026-10-14');
  assert.equal((await checkins.getCheckin(user.id, '2026-10-14')).status, 'skipped');

  const payload = { userId: user.id, type: 'daily', key: `test:${user.id}`, payload: { localDate: '2026-10-14' }, scheduledAt: '2026-10-14 00:00:00' };
  assert.equal(await notifications.enqueue(payload), true);
  assert.equal(await notifications.enqueue(payload), false, 'logical notifications are deduplicated');

  assert.equal(await memories.deleteMemory(user.id, second.id), true);
  assert.equal(await memories.findMemory(user.id, second.id), null);
  await users.deleteUser(user.id);
  assert.equal(await users.findUserById(user.id), null);
  await pool.end();
});
