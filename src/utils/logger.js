import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: ['BOT_TOKEN', 'MYSQL_PASSWORD', '*.text_content', '*.telegram_file_id', 'err.config.headers.Authorization'],
    censor: '[REDACTED]'
  }
});
