# One Good Thing

One Good Thing is a private Telegram journal for preserving small moments. Once each evening it asks a single question, accepts text, photos, or voice notes, and quietly keeps the answer. There are no streaks, scores, social features, ads, or AI services.

The application uses Node.js (ES modules), Telegraf long polling, MySQL 8, `mysql2/promise`, a database-backed notification queue, `node-cron`, and PM2.

## Features

- Resumable timezone and reminder-time onboarding
- Daily check-ins, skips, and one-at-a-time persisted snoozes
- Multiple text, photo, or voice memories per local day
- Random, daily, monthly, and inline-calendar browsing
- Noncompetitive statistics
- One-year anniversary reminders and balanced monthly recaps
- Ownership-checked editing, date changes, and confirmed deletion
- ZIP export with JSON, CSV, and settings
- Confirmed active-account deletion
- Daily `mysqldump` backups with retention and a restoration script
- Single-worker notification claims, retries, deduplication, and restart recovery

## Requirements

- Debian 12 or a comparable Linux distribution
- Node.js 20 LTS or newer
- MySQL 8.x
- A Telegram bot token from BotFather
- PM2 for production process management

No domain, reverse proxy, webhook, or TLS certificate is required; the bot uses long polling.

## Install MySQL and Node.js

Install MySQL from Debian's packages or Oracle's supported repository. Install a current Node.js LTS release from a trusted distribution source. The included schema creates the database and all tables in one step:

```bash
mysql -u root -p < schema.sql
```

Then create a dedicated, local-only application user. Keep this password synchronized with `.env`:

```sql
CREATE USER 'one_good_thing'@'localhost' IDENTIFIED BY 'use-a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON one_good_thing.* TO 'one_good_thing'@'localhost';
FLUSH PRIVILEGES;
```

Keep MySQL bound to localhost and do not expose port 3306 publicly.

## Configure and start

```bash
git clone <repository-url> one-good-thing
cd one-good-thing
npm ci
cp .env.example .env
chmod 600 .env
```

Fill in `.env`. `ALLOWED_TELEGRAM_USER_ID` must be the numeric ID of the only permitted Telegram account. Times use `HH:MM`; timezones must be IANA names such as `Asia/Tehran` or `Europe/London`.

`schema.sql` records the initial migration, so `npm run migrate` is safe and applies only future migrations. Run it during every deployment, then start once in the foreground:

```bash
npm run migrate
npm start
```

In Telegram, send `/start`, finish onboarding, save a test memory, and verify `/today`. The application registers its command menu on startup.

## PM2 deployment

Install PM2, start exactly one fork-mode instance, and configure startup:

```bash
sudo npm install --global pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`, then run `pm2 save` once more. Verify with:

```bash
pm2 status
pm2 logs one-good-thing
```

Do not enable cluster mode or start a second copy. Two bot polling sessions would conflict, and this private deployment intentionally assumes one active scheduler instance. SIGINT and SIGTERM stop the scheduler and Telegram polling before closing the MySQL pool.

## Commands

| Command | Purpose |
|---|---|
| `/start` | Welcome screen or onboarding entry point |
| `/help` | List commands |
| `/add` | Prompt for a new memory |
| `/memory` | Return a random past memory |
| `/today` | Show today's local memories |
| `/month` | Browse the current month and request past recaps |
| `/calendar` | Browse an inline calendar |
| `/stats` | Show totals without streaks or missed-day counts |
| `/settings` | Change notification and privacy preferences |
| `/export` | Download JSON, CSV, and settings in a ZIP file |
| `/delete` | Select and confirm deletion of a memory |
| `/forgetme` | Confirm deletion of all active-account data |
| `/cancel` | End the current multi-step interaction |

Ordinary private text, photo, and voice messages are saved when no input flow is active. Commands, callbacks, setup answers, unsupported media, and settings input are not saved. Forwarded content is stored as the user supplied it; origin metadata is not persisted.

## Scheduling and reliability

One cron-driven worker periodically does two things:

1. It materializes due daily, anniversary, and recap jobs with stable unique keys.
2. It atomically claims due rows from `scheduled_notifications` using a transaction and `FOR UPDATE SKIP LOCKED`, sends them, and records the outcome.

Transient failures retry with exponential backoff and stop after five attempts. Rows left in `processing` for ten minutes are recovered at startup. Daily deliveries recheck the check-in and the user's current preferences, so skips, completed entries, and disabled notifications suppress delivery. Timezone conversion uses IANA rules, including daylight-saving transitions.

Exactly-once Telegram delivery cannot be guaranteed: a Telegram send and a MySQL status update cannot share one atomic transaction. A crash after Telegram accepts a message but before MySQL commits may cause one duplicate after recovery. Stable deduplication prevents duplicate jobs; the remaining send/update window is an unavoidable external-system boundary.

Use `/settings` after changing a timezone or reminder time. No process restart is needed.

## Recaps and anniversaries

Automatic monthly recaps are sent during daytime on the first local day of the next month. Empty months are skipped. Up to five entries are selected at evenly spaced positions through the month; content is never sentiment-ranked or interpreted.

Anniversaries begin at one year, send at most once per local day, and only run during daytime. In a non-leap year, February 29 memories are considered on February 28. Both features can be disabled independently.

## Privacy and security

- Every update—commands, messages, and callback queries—is checked against `ALLOWED_TELEGRAM_USER_ID` and private-chat status.
- Every memory mutation includes its owning user ID in the SQL predicate.
- Queries are parameterized; callback formats and user input are constrained.
- Logs redact credentials, memory text, and Telegram file IDs. Export content is not logged.
- The bot sends no content to AI providers or other paid services.
- `.env`, backups, and temporary exports must not be committed. Exports are removed immediately after Telegram delivery.
- Use a dedicated MySQL account, local network binding, restrictive filesystem permissions, encrypted VPS disks where available, and restricted administrator access.

Telegram bot chats are **not end-to-end encrypted**. Telegram and its infrastructure can process bot messages. This application avoids additional content processors, but it cannot change Telegram's transport and storage model.

Photo and voice `file_id` values let this bot request media again from Telegram. They are not independent media backups, are bot-specific, and should not be treated as a durable copy of the original file. Exports contain these references, not original media.

`/forgetme` deletes the user row and all related active-database rows through foreign-key cascades. Existing backups may continue to contain prior data until their retention period expires.

## Backups

`npm run backup` invokes `mysqldump`, compresses the stream, writes with mode `0600`, and removes archives older than `BACKUP_RETENTION_DAYS`. The database password is supplied through the child process environment, not a command-line argument. Keep `BACKUP_DIRECTORY` outside any web root and on storage accessible only to the service administrator.

Run it daily with the same Unix account that owns the app. For example, edit that account's crontab with `crontab -e`:

```cron
15 3 * * * cd /srv/one-good-thing && /usr/bin/npm run backup >> /var/log/one-good-thing-backup.log 2>&1
```

Restrict the log and its parent directory. Periodically copy encrypted backups to a separately protected location if the threat model includes VPS loss.

### Restore and verify

Stop the bot, select an archive, and restore it:

```bash
pm2 stop one-good-thing
npm run restore -- /secure/path/one-good-thing-2026-10-14T03-15-00Z.sql.gz
npm run migrate
pm2 start one-good-thing
```

Restoration changes database contents and should be performed only against the intended database. To test restorability safely, create a separate database and limited test user, point a temporary `.env` at it, run the restore, then verify table counts and a sample non-sensitive record. Never test a destructive restore against production data.

Verify backup automation by checking the command exit code, archive permissions (`0600`), gzip integrity (`gzip -t archive.sql.gz`), and a successful isolated restore.

## Testing

Run unit tests and syntax checks:

```bash
npm test
npm run check
```

The MySQL lifecycle test is opt-in so the default suite cannot touch a database. Create a separate test database, migrate it using test credentials, and run:

```bash
NODE_ENV=test RUN_MYSQL_INTEGRATION=1 \
MYSQL_DATABASE=one_good_thing_test \
MYSQL_USER=one_good_thing_test \
MYSQL_PASSWORD='test-password' \
npm test
```

Never point integration-test variables at the production database. Telegram behavior is exercised through extracted pure logic and mocked contexts; no live bot messages are required by the default suite.

## Operational verification

- **Telegram:** `/start` responds only to the configured user and only in a private chat.
- **Scheduler:** temporarily set a reminder one or two minutes ahead, restart PM2, and confirm one check-in arrives. Inspect `scheduled_notifications` for a single `daily:<user>:<date>` key.
- **Restart recovery:** stop the process after a job is queued, start it again, and confirm the job is processed without creating another logical row.
- **Export:** open the ZIP and verify the three documented files; confirm no original media is claimed.
- **Deletion:** use a test account/database, confirm `/forgetme`, and verify related table rows are gone.
- **Backup:** run the backup and isolated restore procedure above.

## Troubleshooting

- **Startup says environment configuration is invalid:** compare `.env` with `.env.example`; use a numeric Telegram ID, valid IANA timezone, and `HH:MM` times.
- **Access denied to MySQL:** verify the host portion of the MySQL user, its grants, the database name, and that MySQL is listening locally.
- **Telegram reports a polling conflict:** another instance is running. Stop duplicate PM2/manual processes and retain one fork-mode instance.
- **No reminder arrives:** complete onboarding, confirm reminders are enabled, check timezone/time in `/settings`, inspect PM2 logs, and query pending/failed notification rows.
- **Media cannot be resent:** Telegram may no longer accept a stored file ID. The application intentionally does not download media automatically; use the original chat copy if available.
- **Backup fails:** confirm `mysqldump` is installed, the directory is writable, credentials have read access, and available disk space is sufficient.

## Project layout

Application code lives in `src/`; SQL migrations are in `src/database/migrations`; deployment and backup utilities are in `scripts/`; tests are in `tests/`. There is no HTTP server or dashboard. Everything user-facing stays inside Telegram.
