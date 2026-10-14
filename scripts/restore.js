import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { env } from '../src/config/env.js';

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!inputPath || !inputPath.endsWith('.sql.gz') || !fs.existsSync(inputPath)) {
  throw new Error('Usage: npm run restore -- /absolute/path/to/backup.sql.gz');
}

await new Promise((resolve, reject) => {
  const mysql = spawn('mysql', [
    `--host=${env.MYSQL_HOST}`, `--port=${env.MYSQL_PORT}`, `--user=${env.MYSQL_USER}`, env.MYSQL_DATABASE
  ], { env: { ...process.env, MYSQL_PWD: env.MYSQL_PASSWORD }, stdio: ['pipe', 'inherit', 'pipe'] });
  let errorOutput = '';
  mysql.stderr.on('data', (chunk) => { errorOutput += chunk.toString().slice(0, 2000); });
  mysql.on('error', reject);
  const input = fs.createReadStream(inputPath);
  const gunzip = createGunzip();
  input.on('error', reject);
  gunzip.on('error', reject);
  mysql.stdin.on('error', reject);
  input.pipe(gunzip).pipe(mysql.stdin);
  mysql.on('close', (code) => code === 0 ? resolve() : reject(new Error(`mysql exited with code ${code}: ${errorOutput}`)));
});
console.log('Restore completed. Run npm run migrate before starting the bot.');
