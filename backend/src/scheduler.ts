/**
 * scheduler.ts — Scheduled jobs (#311, #312)
 *
 * Jobs:
 *   1. TTL extension  — every 6 hours
 *      Query DB for active applications expiring within 24 hours.
 *      Call extend_application_ttl in batches of max 10 per transaction.
 *      Log how many were extended. Failures per batch are logged without
 *      aborting the rest of the run.
 *
 *   2. GitHub sync    — every 15 minutes
 *      Full-sync all registered org repos via github.ts.
 *      If Horizon endpoint is unreachable, error is logged and scheduler
 *      continues. After 3 consecutive failures, an alert is triggered.
 */

import cron from "node-cron";
import pool from "./db.js";
import logger from "./logger.js";
import { extendApplicationTtlBatch, type ApplicationRef } from "./soroban.js";
import { runFullSync } from "./github.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Soroban TTL constant — must match APP_TTL_LEDGERS in storage.rs (17 280 ledgers ≈ 24 h). */
const APP_TTL_LEDGERS = 17_280;

/** Approximate ledgers per second (5 s/ledger). */
const LEDGERS_PER_SECOND = 0.2;

/** Ledgers remaining threshold: entries with fewer than this many ledgers left get extended. */
const TTL_EXTEND_THRESHOLD_LEDGERS = APP_TTL_LEDGERS; // extend when within 1 full wave (~24 h)

/** Max number of TTL extensions per Soroban transaction. */
const BATCH_SIZE = 10;

/** Maximum consecutive failures before alerting. */
const MAX_CONSECUTIVE_FAILURES = 3;

// ─── Failure tracking ─────────────────────────────────────────────────────────

let consecutiveGitHubSyncFailures = 0;
let consecutiveTtlExtensionFailures = 0;

// ─── TTL extension job ────────────────────────────────────────────────────────

/**
 * Load all active application entries whose TTL expires within 24 hours.
 *
 * The `ttl_expires_at` column is maintained by the API layer when applications
 * are written; it stores the estimated UTC timestamp of expiry.
 */
async function loadExpiringApplications(): Promise<ApplicationRef[]> {
  // We look for entries expiring within the next TTL_EXTEND_THRESHOLD_LEDGERS ledgers.
  // Convert ledgers → seconds using the 5 s/ledger approximation.
  const windowSeconds = Math.ceil(TTL_EXTEND_THRESHOLD_LEDGERS / LEDGERS_PER_SECOND);

  const result = await pool.query<{
    contributor: string;
    org_id: string;
    issue_id: number;
  }>(
    /* sql */ `
    SELECT contributor, org_id, issue_id
    FROM   active_applications
    WHERE  status = 'pending'
      AND  ttl_expires_at <= NOW() + ($1 || ' seconds')::INTERVAL
    ORDER BY ttl_expires_at ASC
    `,
    [windowSeconds],
  );

  return result.rows.map((row) => ({
    contributor: row.contributor,
    orgId:       row.org_id,
    issueId:     row.issue_id,
  }));
}

/**
 * Chunk an array into sub-arrays of at most `size` elements.
 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Run one TTL extension cycle.
 *
 * - Fetches all expiring applications from DB.
 * - Submits them in batches of BATCH_SIZE to the Soroban contract.
 * - Logs a summary at the end.
 * - Per-batch failures are logged and the run continues.
 * - Tracks consecutive failures and alerts after MAX_CONSECUTIVE_FAILURES.
 */
export async function runTtlExtensionJob(): Promise<void> {
  const jobStart = Date.now();
  logger.info("TTL extension job started");

  try {
    let applications: ApplicationRef[];
    try {
      applications = await loadExpiringApplications();
    } catch (err) {
      consecutiveTtlExtensionFailures++;
      logger.error(
        { err, consecutiveFailures: consecutiveTtlExtensionFailures },
        "TTL extension job: failed to load expiring applications"
      );

      if (consecutiveTtlExtensionFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.error(
          { consecutiveFailures: consecutiveTtlExtensionFailures, threshold: MAX_CONSECUTIVE_FAILURES },
          "TTL extension job: ALERT - max consecutive failures reached"
        );
      }
      return;
    }

    // Success: reset consecutive failure counter
    consecutiveTtlExtensionFailures = 0;

    if (applications.length === 0) {
      logger.info("TTL extension job: no expiring applications found");
      return;
    }

    logger.info({ count: applications.length }, "TTL extension job: extending entries");

    const batches = chunk(applications, BATCH_SIZE);
    let extendedCount = 0;
    let failedCount   = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]!;
      try {
        await extendApplicationTtlBatch(batch);
        extendedCount += batch.length;
        logger.debug(
          { batchIndex: i + 1, batchTotal: batches.length, batchSize: batch.length },
          "TTL batch submitted",
        );
      } catch (err) {
        failedCount += batch.length;
        // Log and continue — do NOT abort the entire run
        logger.error(
          { err, batchIndex: i + 1, batchSize: batch.length },
          "TTL extension batch failed — continuing to next batch",
        );
      }
    }

    const durationMs = Date.now() - jobStart;
    logger.info(
      {
        extended:  extendedCount,
        failed:    failedCount,
        durationMs,
      },
      "TTL extension job complete",
    );
  } catch (err) {
    // Catch any unexpected errors and log them without crashing
    consecutiveTtlExtensionFailures++;
    logger.error(
      { err, consecutiveFailures: consecutiveTtlExtensionFailures },
      "TTL extension job: unexpected error"
    );
  }
}

// ─── GitHub sync job ─────────────────────────────────────────────────────────

/**
 * Run one GitHub sync cycle.
 * Delegates to runFullSync() in github.ts.
 * 
 * Error handling:
 * - Errors are caught and logged — the scheduler itself never crashes.
 * - Consecutive failures are tracked; alert triggered after MAX_CONSECUTIVE_FAILURES.
 * - On success, consecutive failure counter is reset.
 */
export async function runGitHubSyncJob(): Promise<void> {
  logger.info("GitHub sync job started");
  const start = Date.now();
  try {
    const results = await runFullSync();
    const totalUpserted = results.reduce((s, r) => s + r.upserted, 0);
    const totalClosed   = results.reduce((s, r) => s + r.closed,   0);
    
    // Success: reset consecutive failure counter
    consecutiveGitHubSyncFailures = 0;
    
    logger.info(
      { repos: results.length, totalUpserted, totalClosed, durationMs: Date.now() - start },
      "GitHub sync job complete",
    );
  } catch (err) {
    consecutiveGitHubSyncFailures++;
    logger.error(
      { err, durationMs: Date.now() - start, consecutiveFailures: consecutiveGitHubSyncFailures },
      "GitHub sync job failed",
    );

    if (consecutiveGitHubSyncFailures >= MAX_CONSECUTIVE_FAILURES) {
      logger.error(
        { consecutiveFailures: consecutiveGitHubSyncFailures, threshold: MAX_CONSECUTIVE_FAILURES },
        "GitHub sync job: ALERT - max consecutive failures reached"
      );
    }
  }
}

// ─── Scheduler setup ─────────────────────────────────────────────────────────

export interface SchedulerHandle {
  stop: () => void;
}

/**
 * Start all scheduled jobs.
 *
 * Returns a handle with a stop() method for graceful shutdown.
 *
 * Schedules:
 *   - TTL extension:  every 6 hours  (cron: "0 *\/6 * * *")
 *   - GitHub sync:    every 15 min   (cron: "0,15,30,45 * * * *")
 */
export function startScheduler(): SchedulerHandle {
  // Run TTL extension immediately on start so we don't wait 6 h on first boot
  runTtlExtensionJob().catch((err) =>
    logger.error({ err }, "Initial TTL extension job failed"),
  );

  // Run GitHub sync immediately on start
  runGitHubSyncJob().catch((err) =>
    logger.error({ err }, "Initial GitHub sync job failed"),
  );

  const ttlTask = cron.schedule(
    "0 */6 * * *",
    () => {
      runTtlExtensionJob().catch((err) =>
        logger.error({ err }, "Scheduled TTL extension job failed"),
      );
    },
    { timezone: "UTC" },
  );

  const syncTask = cron.schedule(
    "0,15,30,45 * * * *",
    () => {
      runGitHubSyncJob().catch((err) =>
        logger.error({ err }, "Scheduled GitHub sync job failed"),
      );
    },
    { timezone: "UTC" },
  );

  logger.info(
    { ttl: "every 6 hours", githubSync: "every 15 minutes" },
    "Scheduler started",
  );

  return {
    stop() {
      ttlTask.stop();
      syncTask.stop();
      logger.info("Scheduler stopped");
    },
  };
}
