# one good thing

a small private Telegram bot.

once a day, it asks if anything good happened. you can send some text, a photo, or a voice note. it keeps it. later, you can look back.

that's basically the whole thing.

no streaks. no feed. no motivational speeches. no AI trying to explain your sandwich back to you.

## what it does

- checks in once a day
- saves text, photos, and voice notes
- lets you skip without making it weird
- brings back old memories sometimes
- has a calendar and monthly view
- makes simple monthly recaps
- lets you edit, delete, or export your stuff
- only talks to one configured Telegram account

everything happens in Telegram. there's no website.

## what it's made with

- Node.js
- Telegraf
- MySQL 8
- `mysql2/promise`
- `node-cron`
- PM2

it uses Telegram long polling, so you don't need a domain, nginx, webhooks, or an SSL certificate.

## before you start

you'll need Node.js 20 or newer, MySQL 8, a bot token from BotFather, your numeric Telegram user ID, and PM2 if this is going on a VPS.

this was built with a Debian VPS in mind, but there's nothing especially magical about Debian here.

## set up the database

the schema file creates the database and every table:

```bash
mysql -u root -p < schema.sql
```

then give the app its own local MySQL user:

```sql
CREATE USER 'one_good_thing'@'localhost'
  IDENTIFIED BY 'put-a-long-random-password-here';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON one_good_thing.* TO 'one_good_thing'@'localhost';

FLUSH PRIVILEGES;
```

keep MySQL on localhost. it doesn't need to be open to the internet.

## install it

```bash
git clone <repository-url> one-good-thing
cd one-good-thing
npm ci
cp .env.example .env
chmod 600 .env
```

open `.env` and fill in the bot token, Telegram ID, and MySQL login. the example file has the rest.

then:

```bash
npm run migrate
npm start
```

send `/start` to the bot. if it answers, lovely.

## PM2

```bash
sudo npm install --global pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` prints one more command. run that too, then run `pm2 save` again.

there should only be one running instance. two copies will fight over Telegram polling, which is less fun than it sounds.

use these when you need them:

```bash
pm2 status
pm2 logs one-good-thing
pm2 restart one-good-thing
```

## commands

| command | what it does |
|---|---|
| `/start` | opens the welcome screen |
| `/help` | shows the commands |
| `/add` | saves something |
| `/memory` | pulls up an old memory |
| `/today` | shows today's memories |
| `/month` | browses a month |
| `/calendar` | browses by date |
| `/stats` | shows a few basic numbers |
| `/settings` | changes reminder settings |
| `/export` | downloads your data |
| `/delete` | deletes one memory |
| `/forgetme` | deletes the account data |
| `/cancel` | cancels whatever you were doing |

you don't have to use `/add`. if no setup or editing flow is active, just send the bot a message, photo, or voice note.

## reminders

the wording rotates so it doesn't send the exact same line every night.

reminders are rows in MySQL, not a pile of timers sitting in memory. snoozes and pending messages survive a restart. failed sends retry with a bit of backoff.

one small reality check: Telegram sending and MySQL updating can't be one atomic transaction. if the app dies in the tiny gap between them, a reminder might show up twice. the queue prevents the usual duplicates, but that's the limit of talking to two separate systems.

## recaps and old memories

monthly recaps go out during the day on the first day of the next month. empty months are left alone.

the recap picks up to five memories from different parts of the month. it doesn't rank them or try to decide which one mattered most.

anniversary messages start at one year and send at most once a day. February 29 memories show up on February 28 in non-leap years.

both features can be turned off in `/settings`.

## privacy, for real

the bot checks every command, button, and message against `ALLOWED_TELEGRAM_USER_ID`. group chats aren't accepted.

memory text, captions, Telegram file IDs, passwords, and tokens aren't intentionally written to logs.

still, Telegram bot chats are **not end-to-end encrypted**. Telegram handles the messages before this app sees them. that's part of using a bot.

photos and voice notes are stored as Telegram `file_id` references. those references can resend the media, but they aren't a separate backup of the original file.

the app doesn't send memories to an AI provider or another outside service.

## exports

`/export` sends a ZIP with:

```text
one-good-thing-export/
├── memories.json
├── memories.csv
└── settings.json
```

it contains media references, not the original files. the temporary ZIP is removed after delivery.

## deleting everything

`/forgetme` asks for confirmation, then removes the account from the active database.

old backups may still contain the data until their retention window ends. the bot says so instead of pretending backups evaporate instantly.

## backups

make one manually with:

```bash
npm run backup
```

the script runs `mysqldump`, compresses the result, uses private file permissions, and removes old backups according to `BACKUP_RETENTION_DAYS`.

to run it every night, add something like this with `crontab -e`:

```cron
15 3 * * * cd /srv/one-good-thing && /usr/bin/npm run backup >> /var/log/one-good-thing-backup.log 2>&1
```

change the path to wherever the project lives.

### restoring one

```bash
pm2 stop one-good-thing
npm run restore -- /secure/path/to/one-good-thing-backup.sql.gz
npm run migrate
pm2 start one-good-thing
```

test restores against a separate database once in a while. a backup you've never restored is mostly a hopeful theory.

## tests

```bash
npm test
npm run check
```

the normal tests don't touch MySQL. the integration test is opt-in:

```bash
NODE_ENV=test \
RUN_MYSQL_INTEGRATION=1 \
MYSQL_DATABASE=one_good_thing_test \
MYSQL_USER=one_good_thing_test \
MYSQL_PASSWORD='test-password' \
npm test
```

don't point that at the real database. truly no upside there.

## if something isn't working

**the app won't start:** check `.env`. usually it's a missing token, bad Telegram ID, invalid timezone, or MySQL login.

**Telegram says polling conflict:** another copy is running. stop it and keep one instance.

**reminders aren't showing up:** finish onboarding, check `/settings`, then look at `pm2 logs one-good-thing`.

**a photo or voice note won't load:** Telegram may no longer accept the stored file ID. the bot intentionally doesn't download every media file.

**backups are failing:** make sure `mysqldump` exists, the directory is writable, and the disk isn't full.

## where things live

- `src/bot/` — Telegram commands, buttons, and messages
- `src/services/` — the actual behavior
- `src/database/` — MySQL pool, migrations, and queries
- `src/scheduler/` — the notification worker
- `scripts/` — migrations, backup, and restore
- `assets/telegram-profile.png` — the bot's profile picture
- `tests/` — tests, unsurprisingly
- `guide.md` — the longer beginner-friendly tour of every file

that's it. it asks a small question, keeps the answer, and stays out of the way.
