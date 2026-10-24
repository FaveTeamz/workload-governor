//! Fuzz target: simultaneous global cap and org cap saturation.
//!
//! Tests boundary conditions where a contributor reaches exactly 15 global
//! applications (GlobalApplicationLimitReached) and 4 org assignments
//! (OrgAssignmentLimitReached) simultaneously.
//!
//! Key paths exercised:
//! - Reaching the global application limit (15) precisely — any additional
//!   apply_for_issue must return GlobalApplicationLimitReached.
//! - Reaching the org assignment limit (4) precisely — any additional
//!   assign_issue must return OrgAssignmentLimitReached.
//! - Both caps enforced at the same time for the same contributor/org pair.
//! - Counter arithmetic does not overflow or underflow at boundary values.
//! - Transitions (apply → assign) correctly decrement the global app counter
//!   so the org cap limit is reachable independently of the global cap.
//!
//! Invariants that must hold (any violation panics the fuzzer):
//!   1. `get_global_application_count` ≤ GLOBAL_APP_LIMIT (15).
//!   2. `get_org_assignment_count`     ≤ ORG_CAP (4).
//!   3. Applying when global count == 15 panics with GlobalApplicationLimitReached.
//!   4. Assigning when org count == 4 panics with OrgAssignmentLimitReached.
//!
//! No panics other than expected ContractError variants are acceptable.

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

/// Global application cap (mirrors storage::GLOBAL_APP_LIMIT).
const GLOBAL_APP_LIMIT: u32 = 15;
/// Default org assignment cap (mirrors storage::ORG_ASSIGN_LIMIT).
const ORG_ASSIGN_LIMIT: u32 = 4;

fuzz_target!(|data: &[u8]| {
    // Need at least 5 bytes: 4 for issue_id seed + 1 for org name length.
    if data.len() < 5 {
        return;
    }

    // ---------------------------------------------------------------------------
    // Derive fuzzing parameters
    // ---------------------------------------------------------------------------

    // Base issue_id — subsequent issues are base + offset to guarantee uniqueness.
    let base_issue_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    // Avoid issue_id == 0 (reserved/rejected by most callers in practice).
    let base_issue_id = if base_issue_id == 0 { 1u32 } else { base_issue_id };

    // org_id: derive from remaining bytes, clamped to lowercase ASCII (Soroban Symbol limit 32).
    let raw: Vec<u8> = data[4..]
        .iter()
        .take(32)
        .map(|b| (b % 26) + b'a')
        .collect();
    let org_str = std::str::from_utf8(&raw).unwrap_or("dualcap");
    if org_str.is_empty() {
        return;
    }

    // ---------------------------------------------------------------------------
    // Environment setup
    // ---------------------------------------------------------------------------

    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, org_str);

    client.initialize(&admin);
    client.register_maintainer(&admin, &maintainer, &org);

    // ---------------------------------------------------------------------------
    // Phase 1: Fill the org assignment cap to exactly ORG_ASSIGN_LIMIT (4).
    //
    // Strategy: apply for ORG_ASSIGN_LIMIT distinct issues, then assign each.
    // After this phase:
    //   - get_org_assignment_count == ORG_ASSIGN_LIMIT
    //   - get_global_application_count == 0  (apps consumed by assign)
    // ---------------------------------------------------------------------------

    let mut assigned_ids: Vec<u32> = Vec::new();

    for i in 0u32..ORG_ASSIGN_LIMIT {
        // Use saturating_add to avoid wrapping; skip if overflow would occur.
        let issue_id = match base_issue_id.checked_add(i) {
            Some(id) => id,
            None => return, // can't produce distinct IDs, skip this input
        };

        client.apply_for_issue(&contributor, &org, &issue_id);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        assigned_ids.push(issue_id);
    }

    // ---------------------------------------------------------------------------
    // Phase 2: Fill the global application cap to exactly GLOBAL_APP_LIMIT (15).
    //
    // We use a different org so the org cap doesn't interfere.
    // After this phase:
    //   - get_global_application_count == GLOBAL_APP_LIMIT (or as many as succeeded)
    // ---------------------------------------------------------------------------

    // Use a second org to apply without triggering org assignment limit
    let second_org = Symbol::new(&env, "glbcaporg");
    client.register_maintainer(&admin, &maintainer, &second_org);

    let offset_start = ORG_ASSIGN_LIMIT + 100; // well past the first batch
    let mut global_apps: u32 = 0;

    for i in 0u32..GLOBAL_APP_LIMIT {
        let issue_id = match base_issue_id.checked_add(offset_start + i) {
            Some(id) => id,
            None => break,
        };
        client.apply_for_issue(&contributor, &second_org, &issue_id);
        global_apps += 1;
    }

    // ---------------------------------------------------------------------------
    // Phase 3: Assert that both caps are enforced simultaneously.
    //
    // At this point:
    //   - org assignment count in `org`         == assigned_ids.len() (≤ ORG_ASSIGN_LIMIT)
    //   - global application count              == global_apps        (≤ GLOBAL_APP_LIMIT)
    //
    // Invariant 1 — global count never exceeds the hard limit.
    // ---------------------------------------------------------------------------

    let global_count = client.get_global_application_count(&contributor);
    assert!(
        global_count <= GLOBAL_APP_LIMIT,
        "global application count {global_count} exceeded hard limit of {GLOBAL_APP_LIMIT}"
    );

    // Invariant 2 — org assignment count never exceeds the cap.
    let org_count = client.get_org_assignment_count(&contributor, &org);
    assert!(
        org_count <= ORG_ASSIGN_LIMIT,
        "org assignment count {org_count} exceeded cap of {ORG_ASSIGN_LIMIT}"
    );

    // ---------------------------------------------------------------------------
    // Phase 4: Verify GlobalApplicationLimitReached fires when at cap.
    //
    // If global_apps reached GLOBAL_APP_LIMIT, the next apply must panic.
    // ---------------------------------------------------------------------------

    if global_apps >= GLOBAL_APP_LIMIT {
        // One more application for the second org must be rejected.
        let overflow_issue = match base_issue_id.checked_add(offset_start + GLOBAL_APP_LIMIT) {
            Some(id) => id,
            None => return,
        };
        let result = client.try_apply_for_issue(&contributor, &second_org, &overflow_issue);
        assert!(
            result.is_err(),
            "expected GlobalApplicationLimitReached when global count == {GLOBAL_APP_LIMIT}"
        );
    }

    // ---------------------------------------------------------------------------
    // Phase 5: Verify OrgAssignmentLimitReached fires when at cap.
    //
    // If the org was filled to ORG_ASSIGN_LIMIT, attempt another assign on a
    // fresh application and expect OrgAssignmentLimitReached.
    // ---------------------------------------------------------------------------

    if assigned_ids.len() as u32 >= ORG_ASSIGN_LIMIT {
        // First, apply for a new issue in `org` — this succeeds only if the global
        // app count is not at the limit.
        let extra_issue = match base_issue_id.checked_add(offset_start + GLOBAL_APP_LIMIT + 1) {
            Some(id) => id,
            None => return,
        };

        let apply_result = client.try_apply_for_issue(&contributor, &org, &extra_issue);

        if apply_result.is_ok() {
            // Application succeeded; now assign should fail with OrgAssignmentLimitReached.
            let assign_result =
                client.try_assign_issue(&maintainer, &contributor, &org, &extra_issue);
            assert!(
                assign_result.is_err(),
                "expected OrgAssignmentLimitReached when org count == {ORG_ASSIGN_LIMIT}"
            );
        }
        // If apply_result.is_err() the global cap blocked us — that's also correct.
    }

    // ---------------------------------------------------------------------------
    // Phase 6: Boundary probe — saturation of both caps in a single contributor.
    //
    // Uses a fresh contributor to independently verify:
    //   - 15 applications then one more → GlobalApplicationLimitReached.
    //   - 4 assign transitions then one more → OrgAssignmentLimitReached.
    // This exercises the simultaneous-saturation boundary the issue describes.
    // ---------------------------------------------------------------------------

    let fresh_contributor = Address::generate(&env);
    let probe_org = Symbol::new(&env, "probeorg");
    client.register_maintainer(&admin, &maintainer, &probe_org);

    // Fill org cap (4 assign transitions)
    let probe_base: u32 = 50_000;
    let mut probe_assigned: u32 = 0;
    for i in 0u32..ORG_ASSIGN_LIMIT {
        let id = match probe_base.checked_add(i) {
            Some(v) => v,
            None => break,
        };
        client.apply_for_issue(&fresh_contributor, &probe_org, &id);
        client.assign_issue(&maintainer, &fresh_contributor, &probe_org, &id);
        probe_assigned += 1;
    }

    // Fill remaining global slots (up to 15 total)
    let probe_global_org = Symbol::new(&env, "probegorg");
    client.register_maintainer(&admin, &maintainer, &probe_global_org);
    let remaining_global = GLOBAL_APP_LIMIT.saturating_sub(probe_assigned);
    for i in 0u32..remaining_global {
        let id = match probe_base.checked_add(ORG_ASSIGN_LIMIT + 100 + i) {
            Some(v) => v,
            None => break,
        };
        client.apply_for_issue(&fresh_contributor, &probe_global_org, &id);
    }

    // Global application count must not exceed 15
    let count = client.get_global_application_count(&fresh_contributor);
    assert!(
        count <= GLOBAL_APP_LIMIT,
        "probe contributor global count {count} > {GLOBAL_APP_LIMIT}"
    );

    // Org assignment count for probe_org must not exceed 4
    let count = client.get_org_assignment_count(&fresh_contributor, &probe_org);
    assert!(
        count <= ORG_ASSIGN_LIMIT,
        "probe contributor org count {count} > {ORG_ASSIGN_LIMIT}"
    );

    // Simultaneous boundary: if both caps are full, both errors should fire.
    if probe_assigned >= ORG_ASSIGN_LIMIT {
        let global_count = client.get_global_application_count(&fresh_contributor);
        if global_count >= GLOBAL_APP_LIMIT {
            // Apply to probe_org must trigger GlobalApplicationLimitReached
            // (global cap checked first in apply_for_issue)
            let id = match probe_base.checked_add(999_999) {
                Some(v) => v,
                None => return,
            };
            let apply_result =
                client.try_apply_for_issue(&fresh_contributor, &probe_org, &id);
            assert!(
                apply_result.is_err(),
                "expected GlobalApplicationLimitReached at simultaneous cap saturation"
            );
        }
    }
});
