import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { env } from '../src/config/env.js';
import { logger } from '../src/utils/logger.js';

const directory = path.resolve(env.BACKUP_DIRECTORY);
await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
await fsp.chmod(directory, 0o700);
const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
const destination = path.join(directory, `one-good-thing-${stamp}.sql.gz`);

try {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination, { mode: 0o600 });
    const gzip = createGzip({ level: 9 });
    const dump = spawn('mysqldump', [
      '--single-transaction', '--quick', '--no-tablespaces',
      `--host=${env.MYSQL_HOST}`, `--port=${env.MYSQL_PORT}`, `--user=${env.MYSQL_USER}`,
      env.MYSQL_DATABASE
    ], { env: { ...process.env, MYSQL_PWD: env.MYSQL_PASSWORD }, stdio: ['ignore', 'pipe', 'pipe'] });
    let errorOutput = '';
    dump.stderr.on('data', (chunk) => { errorOutput += chunk.toString().slice(0, 2000); });
    let dumpFinished = false;
    let outputFinished = false;
    const finish = () => { if (dumpFinished && outputFinished) resolve(); };
    dump.on('error', reject);
    gzip.on('error', reject);
    output.on('error', reject);
    output.on('close', () => { outputFinished = true; finish(); });
    dump.stdout.pipe(gzip).pipe(output);
    dump.on('close', (code) => {
      if (code !== 0) reject(new Error(`mysqldump exited with code ${code}: ${errorOutput}`));
      else { dumpFinished = true; finish(); }
    });
  });
  const cutoff = Date.now() - env.BACKUP_RETENTION_DAYS * 86400000;
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^one-good-thing-.*\.sql\.gz$/.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if ((await fsp.stat(file)).mtimeMs < cutoff) await fsp.unlink(file);
  }
  logger.info({ filename: path.basename(destination) }, 'backup completed');
} catch (error) {
  await fsp.unlink(destination).catch(() => {});
  logger.error({ err: { name: error.name, message: error.message } }, 'backup failed');
  process.exitCode = 1;
}
