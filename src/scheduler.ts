import cron, { ScheduledTask } from 'node-cron';
import { syncService } from './sync';

let scheduledTasks: ScheduledTask[] = [];

export function startScheduler(orgs: string[]): void {
  if (orgs.length === 0) {
    console.warn('[Scheduler] No organizations configured, skipping cron setup');
    return;
  }

  console.log('[Scheduler] Starting scheduler for orgs:', orgs);

  // Run sync every 15 minutes (*/15 * * * *)
  const syncTask = cron.schedule('*/15 * * * *', async () => {
    console.log('[Scheduler] Running scheduled sync...');
    try {
      const results = await syncService.syncAllOrgs(orgs);
      const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      console.log(
        `[Scheduler] Scheduled sync completed: ${totalSynced} issues synced, ${totalErrors} errors`,
      );
    } catch (error) {
      console.error('[Scheduler] Scheduled sync failed:', error);
    }
  });

  scheduledTasks.push(syncTask);
  console.log('[Scheduler] Cron job scheduled (every 15 minutes)');
}

export function stopScheduler(): void {
  console.log('[Scheduler] Stopping all scheduled tasks...');
  scheduledTasks.forEach((task) => {
    task.stop();
  });
  scheduledTasks = [];
  console.log('[Scheduler] All scheduled tasks stopped');
}

export function getScheduledTasks(): ScheduledTask[] {
  return scheduledTasks;
}
