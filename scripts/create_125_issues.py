#!/usr/bin/env python3
import os
import sys
import json
import time
import urllib.request
import urllib.error

# Ensure scripts directory is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from issues_data import ALL_ISSUES as ISSUES

TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = os.environ.get("GITHUB_REPOSITORY", "FaveTeamz/workload-governor")

if not TOKEN:
    print("ERROR: GITHUB_TOKEN environment variable is missing!", file=sys.stderr)
    sys.exit(1)

print(f"Total issues defined: {len(ISSUES)}")
assert len(ISSUES) == 125, f"Expected exactly 125 issues, found {len(ISSUES)}"

PROGRESS_FILE = "issues_progress.json"

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: could not read {PROGRESS_FILE}: {e}")
            return {}
    return {}

def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)

def create_issue(issue_data, idx, total):
    url = f"https://api.github.com/repos/{REPO}/issues"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "WorkloadGovernor-Issue-Creator"
    }
    payload = json.dumps({
        "title": issue_data["title"],
        "body": issue_data["body"],
        "labels": issue_data["labels"]
    }).encode("utf-8")

    max_retries = 8
    for attempt in range(max_retries):
        req = urllib.request.Request(url, data=payload, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status == 201:
                    data = json.loads(resp.read().decode())
                    return data
        except urllib.error.HTTPError as e:
            error_body = e.read().decode() if e.fp else ""
            print(f"[{idx+1}/{total}] HTTP {e.code} on attempt {attempt+1}: {error_body[:200]}", file=sys.stderr)
            if e.code in (429, 403) and ("rate limit" in error_body.lower() or "secondary rate" in error_body.lower()):
                retry_after = int(e.headers.get("Retry-After", 15))
                backoff = max(retry_after, (attempt + 1) * 10)
                print(f"Secondary rate limit reached. Backing off for {backoff}s...", file=sys.stderr)
                time.sleep(backoff)
            elif e.code >= 500:
                time.sleep(3 * (attempt + 1))
            else:
                print(f"Non-retryable error: {e.code} - {error_body}", file=sys.stderr)
                raise
        except Exception as e:
            print(f"Network error on attempt {attempt+1}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))

    raise RuntimeError(f"Failed to create issue after {max_retries} attempts: {issue_data['title']}")

def generate_catalog(created_issues):
    catalog_path = "docs/ISSUES_CATALOG.md"
    os.makedirs("docs", exist_ok=True)
    
    with open(catalog_path, "w") as f:
        f.write("# WorkloadGovernor — Project Issues Catalog (125 Issues)\n\n")
        f.write("This document provides a comprehensive index of the 125 issues tracking defects, architectural improvements, performance enhancements, security hardening, and test coverage across all subsystems of the WorkloadGovernor repository.\n\n")
        f.write("## Overview by Subsystem\n\n")
        f.write("| Subsystem | Focus Area | Issue Count |\n")
        f.write("|---|---|---|\n")
        f.write("| Smart Contract | Soroban Rust Contract, Storage, Invariants, Events | 11 |\n")
        f.write("| Backend API | Express, Middleware, Rate Limiting, Idempotency | 11 |\n")
        f.write("| Event Indexer | Stellar RPC, Horizon, Ingestion, Reorg Handling | 10 |\n")
        f.write("| Database & Migrations | PostgreSQL, Connection Pooling, Indices, Migrations | 9 |\n")
        f.write("| Frontend Application | React, Next.js / Vite, Wallet Integration, State | 11 |\n")
        f.write("| Design System & UI/UX | Storybook, Accessibility (WCAG), Components, Tokens | 10 |\n")
        f.write("| Testing & QA | Mutation Testing, Fuzzing, E2E Playwright, Unit Tests | 11 |\n")
        f.write("| CI/CD & Workflows | GitHub Actions, Security Permissions, Caching | 10 |\n")
        f.write("| DevOps & Infrastructure | Docker, Helm Chart, Terraform, Kubernetes | 10 |\n")
        f.write("| Security & Governance | Auth, Secret Scanning, Semgrep, Replay Protection | 10 |\n")
        f.write("| Observability & Metrics | OpenTelemetry, Prometheus, Pino, Alerting | 10 |\n")
        f.write("| Documentation & DX | OpenAPI Specs, Sync Validation, ADRs, Devcontainer | 12 |\n")
        f.write("| **Total** | **All Repository Subsystems** | **125** |\n\n")
        f.write("## Complete Issues Register\n\n")
        f.write("| # | Issue Number | Subsystem / Prefix | Title | Labels |\n")
        f.write("|---|---|---|---|---|\n")
        
        for item in created_issues:
            labels_str = ", ".join(f"`{l}`" for l in item["labels"])
            link = f"[#{item['number']}]({item['html_url']})"
            f.write(f"| {item['index']} | {link} | `{item['category']}` | [{item['title']}]({item['html_url']}) | {labels_str} |\n")

    print(f"Generated {catalog_path}")

def main():
    progress = load_progress()
    created_issues = progress.get("created", [])
    already_created_titles = {item["title"] for item in created_issues}

    print(f"Starting submission to {REPO}...")
    print(f"Already created: {len(created_issues)} / {len(ISSUES)}")

    for idx, issue in enumerate(ISSUES):
        if issue["title"] in already_created_titles:
            continue

        print(f"[{idx+1}/{len(ISSUES)}] Creating: {issue['title']}...")
        result = create_issue(issue, idx, len(ISSUES))
        
        issue_record = {
            "index": idx + 1,
            "number": result.get("number"),
            "html_url": result.get("html_url"),
            "title": issue["title"],
            "labels": issue["labels"],
            "category": issue["title"].split(":")[0]
        }
        created_issues.append(issue_record)
        progress["created"] = created_issues
        save_progress(progress)
        print(f"  -> Created #{result.get('number')}: {result.get('html_url')}")
        
        # Pacing between POST requests to respect secondary rate limits
        time.sleep(1.2)

    print(f"\nAll {len(created_issues)} issues successfully created on GitHub!")
    generate_catalog(created_issues)

if __name__ == "__main__":
    main()
