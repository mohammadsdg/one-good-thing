# One Good Thing: Beginner's Code Guide

This guide explains what every part of the project does and how the pieces work together. It is meant for someone who is new to Node.js, Telegram bots, MySQL, or all three.

For installation and server-operation instructions, read `README.md`. This file focuses on understanding the code.

## 1. The shortest possible mental model

The project has four main jobs:

1. Receive an update from Telegram, such as a command, button press, text, photo, or voice note.
2. Confirm that the update came from the one allowed private user.
3. read or change data in MySQL.
4. Periodically check MySQL for notifications that should be sent.

Telegram does not call an HTTP endpoint in this project. Telegraf uses **long polling**: the running Node.js process repeatedly asks Telegram whether new updates are available.

MySQL is the permanent source of truth. If Node.js or the VPS restarts, user settings, memories, unfinished conversations, snoozes, and queued notifications remain in the database.

## 2. A few JavaScript ideas used here

### ES modules

`package.json` contains `"type": "module"`. That means files use:

```js
import { something } from './some-file.js';
export function doSomething() {}
```

Local import paths include the `.js` extension. This is required by Node.js ES modules.

### `async` and `await`

Database queries, Telegram API calls, and file operations take time. They return promises. `await` pauses the current function until that promise settles:

```js
const user = await findUserById(id);
```

It does not freeze the whole Node.js process; Node can continue other asynchronous work.

### Objects and destructuring

The code passes named values in objects:

```js
await createMemory({
  userId: user.id,
  contentType: 'text',
  textContent: 'A good coffee'
});
```

This is easier to read than a long list of positional arguments.

### Repository and service layers

A **repository** contains SQL and only handles storing or loading data. A **service** contains application rules and may call several repositories. A Telegram **handler** turns an incoming Telegram update into service/repository calls and a reply.

This separation keeps SQL out of button handlers and Telegram-specific details out of most business logic.

## 3. Complete project map

```text
one-good-thing/
├── .env.example
├── .gitignore
├── data/.gitkeep
├── README.md
├── guide.md
├── schema.sql
├── package.json
├── package-lock.json
├── ecosystem.config.cjs
├── scripts/
│   ├── migrate.js
│   ├── backup.js
│   └── restore.js
├── src/
│   ├── index.js
│   ├── config/env.js
│   ├── utils/
│   │   ├── dates.js
│   │   ├── html.js
│   │   └── logger.js
│   ├── database/
│   │   ├── pool.js
│   │   ├── migrations/001_initial.sql
│   │   └── repositories/
│   │       ├── users.js
│   │       ├── memories.js
│   │       ├── checkins.js
│   │       ├── notifications.js
│   │       └── states.js
│   ├── services/
│   │   ├── user.service.js
│   │   ├── memory.service.js
│   │   ├── checkin.service.js
│   │   ├── notification.service.js
│   │   ├── recap.service.js
│   │   └── export.service.js
│   ├── scheduler/worker.js
│   └── bot/
│       ├── bot.js
│       ├── messages.js
│       ├── render.js
│       ├── middleware/auth.js
│       ├── keyboards/index.js
│       ├── handlers/
│       │   ├── messages.js
│       │   └── callbacks.js
│       └── commands/
│           ├── start.js
│           ├── help.js
│           ├── add.js
│           ├── memory.js
│           ├── today.js
│           ├── month.js
│           ├── calendar.js
│           ├── stats.js
│           ├── settings.js
│           ├── export.js
│           ├── delete.js
│           └── forgetme.js
└── tests/
    ├── setup.js
    ├── core.test.js
    └── mysql.integration.test.js
```

## 4. Root files

### `.env.example`

This is the template for private configuration. Copy it to `.env` and fill in real values. The actual `.env` file is ignored by Git because it contains secrets.

Important values are:

- `BOT_TOKEN`: secret token received from BotFather.
- `ALLOWED_TELEGRAM_USER_ID`: the only Telegram account allowed to use the bot.
- `MYSQL_*`: MySQL connection settings.
- `DEFAULT_TIMEZONE` and `DEFAULT_REMINDER_TIME`: onboarding defaults.
- `MONTHLY_RECAP_TIME` and `ANNIVERSARY_TIME`: daytime delivery times.
- `BACKUP_*`: backup location and retention.
- `NOTIFICATION_POLL_SECONDS`: how often the one scheduler checks for work.
- `CONVERSATION_TTL_MINUTES`: how long ordinary multi-step input remains active.

Never put quotes around values unless the quotes are part of the intended value.

### `.gitignore`

This tells Git not to track secrets, installed packages, generated exports, generated backups, logs, and coverage output.

### `data/.gitkeep`

Keeps the otherwise-empty runtime data directory in the project. Generated backup and export files remain ignored.

### `package.json`

This is the Node.js project manifest. It declares:

- The project uses ES modules.
- Node.js 20 or newer is required.
- Commands such as `npm start`, `npm test`, and `npm run migrate`.
- Runtime dependencies.

The dependencies each have a narrow purpose:

- `telegraf`: Telegram Bot API framework.
- `mysql2`: promise-based MySQL client.
- `node-cron`: starts the one periodic worker.
- `dotenv`: reads `.env`.
- `pino`: structured logs.
- `zod`: validates environment configuration.
- `luxon`: IANA timezone and calendar arithmetic.
- `archiver`: creates the ZIP export.

### `package-lock.json`

This is generated by npm. It pins exact dependency versions so `npm ci` installs the same dependency tree on the VPS and on a development machine. Do not edit it manually.

### `schema.sql`

This is the complete first-install schema. Running:

```bash
mysql -u root -p < schema.sql
```

creates the `one_good_thing` database, selects it, creates every table/index/foreign key, and marks the initial migration as applied. It is safe to run again because it uses `IF NOT EXISTS` and `INSERT IGNORE`.

It deliberately does not contain an application password. Create the limited application user separately and store its password only in `.env`.

### `ecosystem.config.cjs`

This is PM2's process definition. It starts `src/index.js` in fork mode with exactly one instance. One instance matters because two long-polling bot processes conflict and two schedulers increase duplicate-delivery risk.

The file uses `.cjs` because PM2 expects CommonJS configuration even though application source files use ES modules.

### `README.md`

The operator manual: installation, MySQL user creation, configuration, PM2, commands, privacy, backup/restore, testing, and troubleshooting.

### `guide.md`

This file: the codebase tour and beginner explanation.

## 5. Startup and shutdown

### `src/index.js`

This is the application entry point.

On startup it:

1. Imports the configured Telegram bot.
2. Creates the notification worker.
3. Checks that MySQL responds to `SELECT 1`.
4. Registers the command menu with Telegram.
5. Recovers and starts the scheduler.
6. Starts Telegraf long polling.

It also listens for `SIGINT` and `SIGTERM`. PM2 or Linux sends these signals when stopping the app. The shutdown function stops scheduling, stops polling, and closes the MySQL pool.

An `uncaughtException` is logged without memory content, followed by a controlled shutdown. PM2 can then restart the process.

## 6. Configuration and shared utilities

### `src/config/env.js`

This loads `.env` and validates it with Zod. The bot refuses to start if required secrets are missing, a numeric ID is invalid, a time is not `HH:MM`, or a timezone is not a real IANA timezone.

The rest of the code imports the frozen `env` object instead of reading `process.env` directly. This provides one consistent, validated configuration source.

### `src/utils/logger.js`

Creates the Pino logger. Its redaction rules prevent common sensitive fields—tokens, passwords, memory text, and media IDs—from appearing in logs.

Code logs event names, error classes, codes, and operational counts. It does not deliberately log journal content.

### `src/utils/dates.js`

All important date/time helpers live here:

- Validate IANA timezones and `HH:MM` values.
- Convert a UTC instant into the user's local time.
- Determine the user's local calendar date or month.
- Convert a local scheduled time back to UTC for MySQL.
- Format UTC timestamps consistently.
- Move between months for calendar navigation.
- Apply the February 29 anniversary rule.

MySQL stores timestamps in UTC. `memory_date` and `checkin_date` are local calendar dates, because a memory belongs to the day the user experienced it.

### `src/utils/html.js`

Telegram messages sometimes use HTML formatting. `escapeHtml` replaces characters such as `<` and `&` so user content cannot become Telegram markup. `truncate` safely shortens list previews.

## 7. Database layer

### `src/database/pool.js`

Creates a small reusable MySQL connection pool with `mysql2/promise`. A pool avoids creating a brand-new connection for every message. It is configured for:

- `utf8mb4`, which supports full Unicode and emoji.
- UTC timestamp handling.
- big integer strings, avoiding JavaScript precision loss for large IDs.
- connection waiting and keepalive behavior.

Repositories use this pool unless a transaction-specific connection is passed in.

### `src/database/migrations/001_initial.sql`

This contains the first version-controlled schema migration. It creates the same application tables as `schema.sql`, but not the database itself. Future schema changes should be separate, ordered files such as `002_add_something.sql`.

### Database tables

#### `schema_migrations`

One row per applied migration. This prevents `scripts/migrate.js` from applying the same migration twice.

#### `users`

One row for the authorized account. It stores the Telegram ID, timezone, reminder time, feature toggles, onboarding status, and timestamps.

The database could technically hold more users, but application authorization intentionally permits only the configured Telegram ID.

#### `memories`

One row per saved moment. Five moments on one date are five separate rows and IDs. Text is stored in `text_content`; photos and voice notes store Telegram `file_id` references. `memory_date` is the user's local date.

Indexes make date and creation-time browsing efficient. The user foreign key uses `ON DELETE CASCADE`, so account deletion removes memories.

#### `daily_checkins`

One row per user and local date. The unique key prevents two check-in records for the same day. Status is `pending`, `completed`, or `skipped`.

#### `scheduled_notifications`

The durable notification queue. A row contains:

- Notification type.
- UTC delivery time.
- Status and retry count.
- Small JSON payload, such as the local date or memory ID.
- A stable unique deduplication key.

The `(status, scheduled_at)` index lets the worker find due jobs efficiently.

#### `conversation_states`

Stores the current multi-step interaction. Examples include waiting for an onboarding timezone, a new reminder time, or an edited caption. JSON `payload` holds small state details such as a memory ID. Expiration prevents an abandoned prompt from capturing unrelated messages indefinitely.

### `src/database/repositories/users.js`

SQL operations for user rows:

- Find by Telegram ID or internal ID.
- Create the user if it does not exist.
- Update only an allowlist of setting columns.
- List onboarded users for scheduling.
- Delete the account row.

The column allowlist is important because SQL identifiers cannot be safely supplied as ordinary `?` parameters.

### `src/database/repositories/memories.js`

All memory SQL:

- Create and ownership-check a memory.
- List/count by day or month with pagination.
- Find populated calendar dates.
- Select a random memory while avoiding the last ID when possible.
- Update only text/caption or date.
- Delete with both memory ID and user ID in the predicate.
- Calculate noncompetitive statistics.
- Retrieve export rows, recent rows, and anniversary candidates.

### `src/database/repositories/checkins.js`

Creates one check-in per day and changes its status. `ensureCheckin` uses MySQL's unique key to stay idempotent: repeating it still produces one logical check-in.

### `src/database/repositories/notifications.js`

Implements the queue:

- `enqueue` uses `INSERT IGNORE` plus a unique deduplication key.
- `cancelActive` cancels relevant pending/processing jobs.
- `claimDue` opens a transaction, locks a small due batch with `FOR UPDATE SKIP LOCKED`, and marks it processing.
- `markSent` completes a job.
- `markFailed` schedules retry backoff or marks the fifth failure final.
- `recoverProcessing` returns abandoned processing rows to pending after ten minutes.

### `src/database/repositories/states.js`

Reads, writes, expires, and clears persistent conversation state. JSON from MySQL is normalized to a JavaScript object before handlers use it.

## 8. Services: application rules

### `src/services/user.service.js`

Provides the small user-level operations used outside repositories: create with configured defaults and delete an account.

Deleting the user row relies on foreign-key cascades to remove memories, check-ins, notifications, and conversation state in one database operation.

### `src/services/memory.service.js`

`extractMemory` accepts only supported Telegram message shapes:

- Plain text that is not a command.
- The largest photo variant and optional caption.
- A voice file ID and optional caption.

It ignores unsupported media and forwarding-origin metadata. Text/captions are limited to 4,000 characters.

`saveIncoming` uses the user's current local date unless another date is explicitly assigned. After saving, it completes that day's check-in and cancels an active snooze.

`balancedSelection` chooses evenly spaced recap items. It does not score emotions or decide which memory is “best.”

### `src/services/checkin.service.js`

Contains skip and snooze rules. Skipping marks the local day's check-in and cancels daily/snoozed jobs. Snoozing accepts only 30, 60, or 120 minutes, persists exactly one active snooze, and rejects choices that cross local midnight.

### `src/services/recap.service.js`

Loads a month, selects up to five evenly distributed memories, escapes user content, and creates the HTML recap message. Empty months return `null`.

### `src/services/export.service.js`

Loads all memories and builds a temporary ZIP containing:

- `one-good-thing-export/memories.json`
- `one-good-thing-export/memories.csv`
- `one-good-thing-export/settings.json`

The archive has restrictive permissions and a cleanup function. The command always calls cleanup after attempting delivery. Telegram file IDs are included as references; media is not downloaded.

### `src/services/notification.service.js`

This service has two halves.

`planNotifications` examines onboarded users in their local time. When a daily check-in, anniversary, or recap is due, it inserts a queue row with a deterministic key. The selected daily wording is saved in that row and differs from the last successfully sent daily variation, even across restarts. Repeating the planner does not create a duplicate logical notification.

`processDue` claims due jobs and delivers them. Before sending, it reloads the user and checks current settings and check-in status. A changed setting therefore takes effect without restarting. Failures use exponential retry delays up to five attempts.

The Telegram send and the MySQL `sent` update cannot be one atomic transaction. If the process dies in the tiny gap between them, a duplicate message is possible after recovery. This limit is documented rather than hidden.

## 9. Scheduler

### `src/scheduler/worker.js`

Creates one `node-cron` task that ticks every configured number of seconds. Each tick plans notifications and processes a due batch.

The `running` flag prevents overlapping ticks inside one process. Startup recovery handles jobs abandoned by a previous process. PM2 is configured for one application instance, which is the deployment-level protection against competing workers.

There are not thousands of per-user timers. Time-sensitive work is stored as rows in MySQL.

## 10. Telegram layer

### `src/bot/bot.js`

Constructs the Telegraf bot and wires middleware and handlers in order:

1. Authorization middleware.
2. Named command handlers.
3. Callback-query handler for inline buttons.
4. General message handler.
5. Sanitized error handler.

It also exports the command descriptions registered with Telegram at startup.

Handler order matters. Telegraf recognizes a command before the general message handler, so `/settings` is not accidentally saved as journal text.

### `src/bot/messages.js`

Keeps the short, casual message variations in one place. Daily check-ins are chosen randomly while excluding the last successfully sent variation. Saved-memory replies, skip replies, and random-memory introductions also rotate so the chat does not sound mechanical.

### `src/bot/middleware/auth.js`

Runs before every other handler. It requires:

- A private chat.
- A Telegram sender ID exactly equal to `ALLOWED_TELEGRAM_USER_ID`.

Only then does it load/create the user and put it at `ctx.state.user`. Later handlers use that trusted user object.

### `src/bot/keyboards/index.js`

Builds inline keyboards for:

- Welcome and onboarding.
- Check-in skip/snooze choices.
- Settings toggles.
- Memory edit/date/delete actions.
- Destructive confirmations.
- Day/month pagination.
- Month navigation.
- The calendar grid.

Callback strings are short and structured, for example `memory:delete:42`. The callback handler validates these patterns and still checks ownership in SQL.

### `src/bot/render.js`

Shared output functions. `sendMemory` sends the correct Telegram method for text, photo, or voice. `memoryListText` makes safe previews. `sendDatePage` loads and sends one page for a selected day.

### `src/bot/handlers/messages.js`

Handles non-command messages. It first reads persistent conversation state.

If the bot is waiting for a timezone, time, edited text, or edited date, the message is validated and used for that purpose. It is not saved as a new memory.

Otherwise, supported content is saved as a memory. An `/add` state is cleared after one successful save. Ordinary supported messages work even without `/add`.

### `src/bot/handlers/callbacks.js`

Routes every inline-button press. It handles onboarding defaults, check-in skip/snooze, settings changes, memory management, day/month/calendar navigation, recap requests, exports, and confirmed account deletion.

Button data is never trusted as proof of ownership. A memory lookup/update/delete always includes the current authorized internal user ID.

## 11. Command files

Each command file has one focused responsibility:

- `src/bot/commands/start.js`: sends the calm welcome text and onboarding buttons. It does not overwrite existing settings.
- `src/bot/commands/help.js`: lists commands and explains direct-message saving.
- `src/bot/commands/add.js`: persists the `awaiting_memory` state and asks for content.
- `src/bot/commands/memory.js`: returns a random memory and avoids immediate repetition when multiple rows exist.
- `src/bot/commands/today.js`: determines today's user-local date and displays that page.
- `src/bot/commands/month.js`: shows a paginated month, previous/next navigation, a memory button, and recap access.
- `src/bot/commands/calendar.js`: builds an inline calendar and marks dates containing memories with a dot.
- `src/bot/commands/stats.js`: displays totals, unique memory days, current-month count, and first date—never streaks.
- `src/bot/commands/settings.js`: shows current account settings and the settings keyboard.
- `src/bot/commands/export.js`: builds, sends, and then removes the temporary ZIP.
- `src/bot/commands/delete.js`: lists recent memories so the user can select one; actual deletion still requires confirmation.
- `src/bot/commands/forgetme.js`: displays the permanent-deletion warning and confirmation buttons.

`/cancel` is short enough to be defined directly in `bot.js`; it clears persistent interaction state.

## 12. Scripts

### `scripts/migrate.js`

Creates the migration ledger if necessary, reads `.sql` files in filename order, skips completed names, and records each successful migration. It uses a transaction where MySQL supports it, although MySQL DDL can implicitly commit; migrations should therefore be written to be safely repeatable.

For a brand-new server, `schema.sql` is the easiest first step. Continue running `npm run migrate` during deployments so future numbered migrations are applied.

### `scripts/backup.js`

Runs `mysqldump` as a child process, streams its output through gzip, and writes a mode-`0600` archive. The password is passed in the child environment rather than exposed in the process command arguments. Old matching archives are removed according to retention days.

On failure, an incomplete destination is removed and only non-journal error details are logged.

### `scripts/restore.js`

Requires an explicit `.sql.gz` path, decompresses it as a stream, and pipes it to the MySQL client. It does not silently choose a backup. Restores should be tested against a separate database before being trusted for disaster recovery.

## 13. Tests

### `tests/setup.js`

Supplies safe placeholder environment values before test files import application modules. This lets validation run without a real Telegram token. It does not connect to MySQL by itself.

### `tests/core.test.js`

Fast tests for authorization rejection, message-type extraction, command/media exclusion, balanced recap selection, timezone conversion, midnight snooze behavior, and February 29 anniversaries. Telegram is represented by small mock context objects; no live API call is made.

### `tests/mysql.integration.test.js`

An opt-in lifecycle test for a dedicated test database. It covers multiple memories on one date, editing, date browsing, skipping, notification deduplication, deletion, and account cascading.

It runs only when `RUN_MYSQL_INTEGRATION=1`. This guard is intentional: running `npm test` must never destructively probe a production database.

## 14. End-to-end examples

### Saving an ordinary text message

```text
Telegram update
  → bot.js
  → auth.js verifies private user
  → messages.js finds no active special state
  → memory.service.js validates/extracts text
  → memories.js INSERTs one row
  → checkins.js completes today's check-in if pending
  → notifications.js cancels today's active snooze
  → Telegram receives a short reply such as “nice. saved.”
```

### Sending an evening check-in

```text
worker.js tick
  → notification.service.js calculates each user's local time
  → notifications.js INSERT IGNOREs daily:user:date
  → notifications.js atomically claims due rows
  → notification.service.js reloads user and check-in
  → Telegram receives the question and buttons
  → notifications.js marks the queue row sent
```

### Deleting a memory

```text
/delete
  → recent owned memories are shown as buttons
  → user selects one
  → callback handler verifies it belongs to this user
  → confirmation keyboard is shown
  → user confirms
  → DELETE uses both memory ID and user ID
```

### Forgetting the account

```text
/forgetme
  → warning and confirmation
  → user explicitly confirms
  → users.js deletes the owned user row
  → MySQL foreign-key cascades delete related active rows
  → bot explains backup-retention limitation
```

## 15. How to make a safe change

Use this order for most changes:

1. Decide whether the change belongs in Telegram presentation, application rules, or persistence.
2. If data shape changes, add a new numbered migration; do not rewrite a migration already deployed.
3. Keep SQL parameterized and keep user ownership in read/update/delete predicates.
4. Validate new callback formats and user input.
5. Escape user content in HTML-formatted replies.
6. Add or update tests.
7. Run `npm test`, `npm run check`, and `npm audit`.
8. Test with a separate MySQL database and a test bot before production.

## 16. Common extension examples

### Add a simple command

Create a focused file in `src/bot/commands/`, import it in `src/bot/bot.js`, register it with `bot.command`, and add its description to the exported `commands` array. Authorization is already applied globally.

### Add a user setting

You normally need to:

1. Add a new migration column.
2. Add the column to the `updateUser` allowlist.
3. Add a settings button and callback branch.
4. Make the relevant service honor the setting.
5. Include it in exports if it is personal configuration.
6. Add tests and documentation.

### Change notification behavior

Keep the planner idempotent by designing a stable deduplication key. Keep delivery rechecks, because a queued row may be older than the user's current settings. Never create one cron task per user.

### Add a new memory content type

This is a larger change. It requires a database migration for the enum, extraction logic, sending/rendering logic, export behavior, and tests. Consider Telegram file-ID durability and do not claim it is an independent backup.

## 17. Security rules worth preserving

- Keep authorization middleware first.
- Keep the bot private-chat-only.
- Never commit `.env`.
- Never concatenate untrusted values into SQL.
- Always pair a memory ID with the current user ID.
- Never log memory text, captions, file IDs, tokens, passwords, or export bodies.
- Keep destructive actions behind explicit confirmation.
- Do not expose MySQL to the public internet.
- Keep one polling/scheduler process.
- Remember that Telegram bot chats are not end-to-end encrypted.
- Remember that backups outlive active-database deletion until retention removes them.

## 18. What is intentionally not in the project

There is no web server, webhook, dashboard, Docker setup, ORM, Redis queue, AI integration, search index, social feature, streak tracker, or original-media downloader. These omissions are part of the product design: the bot should remain small, private, calm, and maintainable.

When unsure where a behavior comes from, begin at `src/bot/bot.js` for user interactions or `src/scheduler/worker.js` for timed interactions, then follow the imported handler → service → repository chain.
