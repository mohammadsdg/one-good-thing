import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { recoverProcessing } from '../database/repositories/notifications.js';
import { planNotifications, processDue } from '../services/notification.service.js';

export function createWorker(telegram) {
  let running = false;
  let task;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await planNotifications();
      const processed = await processDue(telegram);
      if (processed) logger.info({ processed }, 'notification batch processed');
    } catch (error) {
      logger.error({ err: { name: error.name, message: error.message, code: error.code } }, 'notification worker failed');
    } finally {
      running = false;
    }
  };
  return {
    async start() {
      const recovered = await recoverProcessing();
      if (recovered) logger.warn({ recovered }, 'recovered abandoned notifications');
      task = cron.schedule(`*/${env.NOTIFICATION_POLL_SECONDS} * * * * *`, () => void tick(), { scheduled: true });
      await tick();
    },
    stop() { task?.stop(); }
  };
}
