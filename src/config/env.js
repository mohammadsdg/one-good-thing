import 'dotenv/config';
import { z } from 'zod';
import { IANAZone } from 'luxon';

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  BOT_TOKEN: z.string().min(1),
  ALLOWED_TELEGRAM_USER_ID: z.coerce.number().int().positive(),
  MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_USER: z.string().min(1),
  MYSQL_PASSWORD: z.string(),
  MYSQL_DATABASE: z.string().regex(/^[a-zA-Z0-9_]+$/).default('one_good_thing'),
  DEFAULT_TIMEZONE: z.string().refine((v) => IANAZone.isValidZone(v), 'must be an IANA timezone').default('Asia/Tehran'),
  DEFAULT_REMINDER_TIME: z.string().regex(time).default('22:30'),
  MONTHLY_RECAP_TIME: z.string().regex(time).default('10:00'),
  ANNIVERSARY_TIME: z.string().regex(time).default('10:00'),
  BACKUP_DIRECTORY: z.string().default('./data/backups'),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(14),
  LOG_LEVEL: z.string().default('info'),
  NOTIFICATION_POLL_SECONDS: z.coerce.number().int().min(10).max(59).default(30),
  CONVERSATION_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze(parsed.data);
