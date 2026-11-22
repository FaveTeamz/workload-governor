---
name: Mainnet Deployment
about: Checklist for deploying or upgrading the WorkloadGovernor contract on Stellar mainnet
labels: deployment, mainnet
---

## Deployment: v<!-- VERSION -->

> **Required:** Complete all items in [docs/runbooks/mainnet-deployment-checklist.md](../../docs/runbooks/mainnet-deployment-checklist.md) before merging this PR.
> At least **2 team members** must sign off in the table below.

---

## Pre-Deployment Gates

- [ ] Mutation score ≥ 90% (`cargo test --features testutils` + `node scripts/mutation-report.js`)
- [ ] All unit and property-based tests passing (`cargo test --features testutils`)
- [ ] All E2E smoke tests passing on testnet (`./tests/smoke/testnet-smoke.sh`)
- [ ] Binary size < 20 KB after optimize (`wc -c < …workload_governor.optimized.wasm`)
- [ ] Admin key backup confirmed (restore drill completed)
- [ ] `CHANGELOG.md` updated with new version entry
- [ ] Security checklist ([docs/security-checklist.md](../../docs/security-checklist.md)) reviewed
- [ ] No `FIXME` or `TODO` in `src/lib.rs`

## Deployment

- [ ] WASM built and optimized
- [ ] WASM uploaded to mainnet — hash: `<!-- WASM_HASH -->`
- [ ] `upgrade` invoked successfully (output: `null`)
- [ ] Contract initialized / already initialized confirmed
- [ ] `config/contracts.json` updated with new mainnet contract ID (if changed)
- [ ] Backend `CONTRACT_ID` env var updated and service redeployed

## Post-Deployment Verification

- [ ] Mainnet smoke test passed (`has_applied` returns valid JSON)
- [ ] Event emission verified on block explorer
- [ ] Backend health endpoint returns `{ "status": "ok" }`
- [ ] 30-minute monitoring window complete (error rate < 0.1%, P99 < 500 ms)
- [ ] Git tag pushed: `mainnet-v<!-- VERSION -->`

## Rollback Plan

Previous WASM hash: `<!-- PREVIOUS_WASM_HASH -->`

If a rollback is needed, follow [Rollback Procedure](../../docs/runbooks/mainnet-deployment-checklist.md#rollback-procedure).

## Sign-off

Both reviewers must sign off (initials or GitHub username) before the deployment window opens.

| Reviewer | Role | Date (UTC) | Signature |
|---|---|---|---|
| | | | |
| | | | |
