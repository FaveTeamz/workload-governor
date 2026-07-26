"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncService = exports.SyncService = void 0;
const db_1 = require("./db");
const github_1 = require("./github");
class SyncService {
    constructor() {
        this.githubService = new github_1.GitHubService();
    }
    async getLastSyncTime(org) {
        try {
            const result = await db_1.pool.query('SELECT last_sync_at FROM sync_metadata WHERE org = $1', [org]);
            if (result.rows.length === 0) {
                return null;
            }
            return new Date(result.rows[0].last_sync_at);
        }
        catch (error) {
            console.error('[Sync] Failed to get last sync time:', error);
            return null;
        }
    }
    async updateLastSyncTime(org) {
        try {
            await db_1.pool.query(`INSERT INTO sync_metadata (org, last_sync_at) VALUES ($1, NOW())
         ON CONFLICT (org) DO UPDATE SET last_sync_at = NOW()`, [org]);
        }
        catch (error) {
            console.error('[Sync] Failed to update sync time:', error);
            throw error;
        }
    }
    async syncIssuesForOrg(org) {
        const result = {
            org,
            fetched: 0,
            synced: 0,
            errors: [],
        };
        try {
            console.log(`[Sync] Starting sync for org: ${org}`);
            // Get last sync time for incremental sync
            const lastSyncTime = await this.getLastSyncTime(org);
            const since = lastSyncTime?.toISOString();
            console.log(`[Sync] Last sync for ${org} was at:`, lastSyncTime || 'never');
            // Fetch issues from GitHub
            let issues = [];
            try {
                issues = await this.githubService.fetchIssues(org, since);
                result.fetched = issues.length;
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Failed to fetch from GitHub: ${errorMsg}`);
                console.error(`[Sync] GitHub fetch failed for ${org}:`, error);
                return result;
            }
            if (issues.length === 0) {
                console.log(`[Sync] No new issues for ${org}`);
                await this.updateLastSyncTime(org);
                return result;
            }
            // Sync issues to database
            for (const issue of issues) {
                try {
                    await db_1.pool.query(`INSERT INTO issues (
              id, github_id, org, title, body, labels, state, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (github_id) DO UPDATE SET
              title = EXCLUDED.title,
              body = EXCLUDED.body,
              labels = EXCLUDED.labels,
              state = EXCLUDED.state,
              updated_at = NOW()`, [
                        issue.id,
                        issue.id,
                        org,
                        issue.title,
                        issue.body,
                        issue.labels,
                        issue.state,
                        new Date(issue.created_at),
                    ]);
                    result.synced++;
                }
                catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    result.errors.push(`Failed to sync issue #${issue.number}: ${errorMsg}`);
                    console.error(`[Sync] Failed to sync issue ${issue.number} for ${org}:`, error);
                }
            }
            // Update last sync time
            await this.updateLastSyncTime(org);
            console.log(`[Sync] Completed sync for ${org}: ${result.synced}/${result.fetched} synced`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push(`Unexpected error: ${errorMsg}`);
            console.error(`[Sync] Unexpected error syncing ${org}:`, error);
        }
        return result;
    }
    async syncAllOrgs(orgs) {
        console.log(`[Sync] Syncing ${orgs.length} organizations...`);
        const results = [];
        for (const org of orgs) {
            const result = await this.syncIssuesForOrg(org);
            results.push(result);
        }
        console.log(`[Sync] Completed sync for all orgs. Total results: ${results.length}`);
        return results;
    }
}
exports.SyncService = SyncService;
// Create a global sync service instance
exports.syncService = new SyncService();
