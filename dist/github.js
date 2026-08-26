"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubService = void 0;
class GitHubService {
    constructor(token) {
        this.baseUrl = 'https://api.github.com';
        this.token = token || process.env.GITHUB_TOKEN || '';
        if (!this.token) {
            console.warn('[GitHub] No GitHub token provided, public requests only');
        }
    }
    async fetch(path, options = {}) {
        const baseHeaders = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'WorkloadGovernor',
        };
        const headers = new Headers(baseHeaders);
        if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => {
                headers.set(key, value);
            });
        }
        else if (typeof options.headers === 'object' && options.headers !== null) {
            Object.entries(options.headers).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    headers.set(key, value);
                }
            });
        }
        if (this.token) {
            headers.set('Authorization', `token ${this.token}`);
        }
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...options,
            headers,
        });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        return response;
    }
    async fetchIssues(org, since, perPage = 100) {
        const issues = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            console.log(`[GitHub] Fetching issues for ${org} (page ${page})...`);
            const params = new URLSearchParams({
                state: 'open',
                per_page: String(perPage),
                page: String(page),
                sort: 'updated',
                direction: 'asc',
            });
            if (since) {
                params.set('since', since);
            }
            try {
                const response = await this.fetch(`/search/issues?${params.toString()}&q=repo:${org}`);
                const data = (await response.json());
                if (!Array.isArray(data.items)) {
                    console.warn(`[GitHub] Invalid response for ${org}`);
                    break;
                }
                const pageIssues = data.items
                    .filter((item) => !item.pull_request) // Exclude PRs
                    .map((item) => ({
                    id: item.id,
                    number: item.number,
                    title: item.title,
                    body: item.body,
                    labels: (item.labels || []).map((label) => label.name),
                    state: item.state === 'open' ? 'open' : 'closed',
                    created_at: item.created_at,
                    updated_at: item.updated_at,
                }));
                issues.push(...pageIssues);
                // Check if there are more pages
                const linkHeader = response.headers.get('link');
                hasMore =
                    linkHeader !== null &&
                        linkHeader.includes('rel="next"') &&
                        pageIssues.length === perPage;
                page++;
                // Rate limiting backoff
                const remaining = response.headers.get('x-ratelimit-remaining');
                if (remaining && parseInt(remaining, 10) < 10) {
                    const reset = response.headers.get('x-ratelimit-reset');
                    if (reset) {
                        const resetTime = new Date(parseInt(reset, 10) * 1000).toISOString();
                        console.warn(`[GitHub] Rate limit approaching, reset at ${resetTime}`);
                    }
                }
            }
            catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[GitHub] Failed to fetch issues for ${org}:`, errorMsg);
                throw error;
            }
        }
        console.log(`[GitHub] Fetched ${issues.length} issues for ${org}`);
        return issues;
    }
}
exports.GitHubService = GitHubService;
