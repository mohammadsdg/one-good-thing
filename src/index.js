import { bot, commands } from './bot/bot.js';
import { pool } from './database/pool.js';
import { createWorker } from './scheduler/worker.js';
import { logger } from './utils/logger.js';

let stopping = false;
const worker = createWorker(bot.telegram);

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  worker.stop();
  bot.stop(signal);
  await pool.end();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => logger.error({ err: { name: error?.name, message: error?.message } }, 'unhandled rejection'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: { name: error.name, message: error.message } }, 'uncaught exception');
  void shutdown('uncaughtException').finally(() => process.exit(1));
});

try {
  await pool.query('SELECT 1');
  await bot.telegram.setMyCommands(commands);
  await worker.start();
  await bot.launch({ dropPendingUpdates: false });
  logger.info('One Good Thing is running');
} catch (error) {
  logger.fatal({ err: { name: error.name, message: error.message, code: error.code } }, 'startup failed');
  worker.stop();
  await pool.end().catch(() => {});
  process.exitCode = 1;
}
