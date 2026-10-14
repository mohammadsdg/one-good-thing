import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import archiver from 'archiver';
import * as memories from '../database/repositories/memories.js';

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export async function createExport(user) {
  const rows = await memories.listAll(user.id);
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'one-good-thing-'));
  const archivePath = path.join(directory, 'one-good-thing-export.zip');
  const json = rows.map((row) => ({
    id: row.id,
    date: row.memory_date,
    content_type: row.content_type,
    text: row.text_content,
    telegram_file_id: row.telegram_file_id,
    created_at_utc: row.created_at,
    updated_at_utc: row.updated_at
  }));
  const headings = ['id', 'date', 'content_type', 'text', 'telegram_file_id', 'created_at_utc', 'updated_at_utc'];
  const csv = [headings.join(','), ...json.map((row) => headings.map((key) => csvCell(row[key])).join(','))].join('\n');
  const settings = {
    timezone: user.timezone,
    reminder_time: user.reminder_time,
    reminders_enabled: Boolean(user.reminders_enabled),
    anniversaries_enabled: Boolean(user.anniversaries_enabled),
    monthly_recap_enabled: Boolean(user.monthly_recap_enabled),
    account_created_at_utc: user.created_at,
    note: 'Telegram file IDs are references, not independent backups of original media.'
  };
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath, { mode: 0o600 });
    const zip = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    zip.on('error', reject);
    zip.pipe(output);
    zip.append(JSON.stringify(json, null, 2), { name: 'one-good-thing-export/memories.json' });
    zip.append(csv, { name: 'one-good-thing-export/memories.csv' });
    zip.append(JSON.stringify(settings, null, 2), { name: 'one-good-thing-export/settings.json' });
    void zip.finalize();
  });
  return { archivePath, cleanup: () => fsp.rm(directory, { recursive: true, force: true }) };
}
