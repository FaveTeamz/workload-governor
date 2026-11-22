# Branch Protection Rules — `main`

This document records the required branch protection configuration for `main`.
These rules must be applied in **GitHub → Settings → Branches → Branch protection rules**.
They cannot be set via a file in the repo, but they are captured here for auditability
and to guide repository admins.

---

## Required Settings

| Setting | Value |
|---|---|
| **Branch name pattern** | `main` |
| **Require a pull request before merging** | ✅ Enabled |
| — Require approvals | `1` |
| — Dismiss stale pull request approvals when new commits are pushed | ✅ Enabled |
| — Require review from Code Owners | ✅ Enabled |
| — Restrict who can dismiss pull request reviews | Leave at default (admins only) |
| **Require status checks to pass before merging** | ✅ Enabled |
| — Require branches to be up to date before merging | ✅ Enabled |
| — Required status checks (see table below) | see below |
| **Require conversation resolution before merging** | ✅ Enabled |
| **Require signed commits** | Recommended (✅ if team has GPG signing set up) |
| **Require linear history** | Optional — enable if squash merges are used |
| **Do not allow bypassing the above settings** | ✅ Enabled (applies to admins too) |
| **Allow force pushes** | ❌ Disabled |
| **Allow deletions** | ❌ Disabled |

---

## Required Status Checks

These are the exact job IDs that GitHub Actions reports.
All must pass on every PR before merge is permitted.

| Check name | Workflow file |
|---|---|
| `ci` | `.github/workflows/ci.yml` |
| `frontend-ci` | `.github/workflows/frontend-ci.yml` |
| `backend-coverage` | `.github/workflows/coverage.yml` |
| `frontend-coverage` | `.github/workflows/coverage.yml` |
| `contract-coverage` | `.github/workflows/coverage.yml` |
| `security-audit` | `.github/workflows/dependency-audit.yml` |

> **Note:** Status check names are case-sensitive and must match the `jobs.<id>:` key
> in the workflow YAML exactly, not the human-readable `name:` field.

---

## Applying via GitHub CLI

```bash
# Install gh CLI if not present: https://cli.github.com/
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/FaveTeamz/workload-governor/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "ci",
      "frontend-ci",
      "backend-coverage",
      "frontend-coverage",
      "contract-coverage",
      "security-audit"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

---

## CODEOWNERS

The `CODEOWNERS` file lives at `.github/CODEOWNERS`.
It assigns reviewers by path prefix so that the "Require review from Code Owners"
rule above knows which team to require.

See [`.github/CODEOWNERS`](./CODEOWNERS) for the full mapping.

---

## References

- [GitHub docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub docs: About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
