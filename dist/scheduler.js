"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
exports.getScheduledTasks = getScheduledTasks;
const node_cron_1 = __importDefault(require("node-cron"));
const sync_1 = require("./sync");
let scheduledTasks = [];
function startScheduler(orgs) {
    if (orgs.length === 0) {
        console.warn('[Scheduler] No organizations configured, skipping cron setup');
        return;
    }
    console.log('[Scheduler] Starting scheduler for orgs:', orgs);
    // Run sync every 15 minutes (*/15 * * * *)
    const syncTask = node_cron_1.default.schedule('*/15 * * * *', async () => {
        console.log('[Scheduler] Running scheduled sync...');
        try {
            const results = await sync_1.syncService.syncAllOrgs(orgs);
            const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
            const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
            console.log(`[Scheduler] Scheduled sync completed: ${totalSynced} issues synced, ${totalErrors} errors`);
        }
        catch (error) {
            console.error('[Scheduler] Scheduled sync failed:', error);
        }
    });
    scheduledTasks.push(syncTask);
    console.log('[Scheduler] Cron job scheduled (every 15 minutes)');
}
function stopScheduler() {
    console.log('[Scheduler] Stopping all scheduled tasks...');
    scheduledTasks.forEach((task) => {
        task.stop();
    });
    scheduledTasks = [];
    console.log('[Scheduler] All scheduled tasks stopped');
}
function getScheduledTasks() {
    return scheduledTasks;
}
