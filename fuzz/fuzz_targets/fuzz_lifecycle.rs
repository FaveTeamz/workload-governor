//! Fuzz target: full lifecycle — apply → assign → complete / revoke.
//!
//! Unlike `fuzz_apply`, `fuzz_assign`, and `fuzz_revoke`, which each exercise a
//! single operation in isolation, this target chains **all five operations** in
//! random sequence and verifies global invariants after every step:
//!
//! 1. `apply_for_issue`
//! 2. `withdraw_application`
//! 3. `assign_issue`
//! 4. `complete_assignment`
//! 5. `revoke_assignment`
//!
//! ## Invariants checked after every operation
//!
//! * **Global cap**: `get_global_application_count(contributor) ≤ 15`
//! * **Org cap**: `get_org_assignment_count(contributor, org) ≤ get_org_cap(org)`
//! * **Mutual exclusion**: a contributor cannot simultaneously have `has_applied` AND
//!   `is_assigned` true for the same `(org, issue_id)` triple.
//!
//! ## Input layout
//!
//! ```text
//! bytes [0..4)  — issue_id as little-endian u32
//! bytes [4..)   — org_id characters (each byte mapped to lowercase ascii
//!                 via `(b % 26) + b'a'`, same convention as all other fuzz targets)
//! byte  [5]     — op-sequence control flags (within the org bytes slice):
//!                   bit 0: if 1, call apply_for_issue
//!                   bit 1: if 1, call withdraw_application after apply
//!                   bit 2: if 1, call assign_issue (requires a prior apply)
//!                   bit 3: if 1, call complete_assignment (after assign)
//!                   bit 4: if 1, call revoke_assignment instead of complete (after assign)
//! ```
//!
//! Each bit is an independent hint to the fuzzer; the target handles combinations
//! gracefully by catching expected `ContractError` panics and only asserting
//! invariants when the preceding operation actually succeeded.

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

fuzz_target!(|data: &[u8]| {
    // Minimum viable input: 4 bytes for issue_id + at least 1 byte for org.
    if data.len() < 5 {
        return;
    }

    // ── Parse issue_id ──────────────────────────────────────────────────────
    let issue_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);

    // ── Parse org string ────────────────────────────────────────────────────
    // Map each byte to lowercase ascii, same as every other fuzz target.
    let raw: Vec<u8> = data[4..]
        .iter()
        .take(32)
        .map(|b| (b % 26) + b'a')
        .collect();
    let org_str = std::str::from_utf8(&raw).unwrap_or("org");
    if org_str.is_empty() {
        return;
    }

    // ── Parse op-sequence flags from byte[5] ───────────────────────────────
    // byte[5] is the second byte of the org slice in `data` (index 5 overall).
    let flags: u8 = if data.len() > 5 { data[5] } else { 0 };
    let do_apply    = flags & (1 << 0) != 0;
    let do_withdraw = flags & (1 << 1) != 0;
    let do_assign   = flags & (1 << 2) != 0;
    let do_complete = flags & (1 << 3) != 0;
    let do_revoke   = flags & (1 << 4) != 0;

    // ── Environment setup ───────────────────────────────────────────────────
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, org_str);

    // Initialize and register maintainer (required for assign / complete / revoke).
    let init_ok = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
    }))
    .is_ok();

    if !init_ok {
        return;
    }

    // Helper: check all three invariants; panic (test failure) if any is violated.
    let check_invariants = |label: &str| {
        // Invariant 1 — global application count ≤ global cap
        let global_count = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.get_global_application_count(&contributor)
        }));
        if let Ok(gc) = global_count {
            let global_cap = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.get_org_cap(&org) // we reuse org cap as proxy; global cap is 15
            }));
            // Global cap is a contract constant (15); check against it directly.
            assert!(
                gc <= 15,
                "[{label}] INVARIANT VIOLATED: global_count={gc} > 15"
            );
        }

        // Invariant 2 — org assignment count ≤ org cap
        let org_count = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.get_org_assignment_count(&contributor, &org)
        }));
        let org_cap_val = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.get_org_cap(&org)
        }));
        if let (Ok(oc), Ok(cap)) = (org_count, org_cap_val) {
            assert!(
                oc <= cap,
                "[{label}] INVARIANT VIOLATED: org_count={oc} > org_cap={cap}"
            );
        }

        // Invariant 3 — applied and assigned are mutually exclusive
        let applied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.has_applied(&contributor, &org, &issue_id)
        }));
        let assigned = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.is_assigned(&contributor, &org, &issue_id)
        }));
        if let (Ok(app), Ok(asgn)) = (applied, assigned) {
            assert!(
                !(app && asgn),
                "[{label}] INVARIANT VIOLATED: has_applied=true AND is_assigned=true simultaneously \
                 for issue_id={issue_id}"
            );
        }
    };

    // ── Step 1: apply ───────────────────────────────────────────────────────
    let mut applied_ok = false;
    if do_apply {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
        applied_ok = result.is_ok();
        check_invariants("after apply");
    }

    // ── Step 2: withdraw (optional — takes the apply→withdraw path) ─────────
    let mut still_applied = applied_ok;
    if do_withdraw && applied_ok {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.withdraw_application(&contributor, &org, &issue_id);
        }));
        if result.is_ok() {
            still_applied = false;
            // Extra: global count must return to 0 after withdraw.
            let count = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.get_global_application_count(&contributor)
            }));
            if let Ok(c) = count {
                assert_eq!(
                    c, 0,
                    "[after withdraw] global count must be 0 after apply+withdraw, got {c}"
                );
            }
            // Extra: has_applied must be false.
            let has = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.has_applied(&contributor, &org, &issue_id)
            }));
            if let Ok(h) = has {
                assert!(!h, "[after withdraw] has_applied must be false after withdraw");
            }
        }
        check_invariants("after withdraw");
    }

    // ── Step 3: assign ──────────────────────────────────────────────────────
    // assign_issue requires a live application; only attempt it when we know one
    // exists so we exercise both the success path and the graceful-error path.
    let mut assigned_ok = false;
    if do_assign {
        // Re-apply if we withdrew, so the fuzzer can still reach the assign path.
        if !still_applied {
            let reapply = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.apply_for_issue(&contributor, &org, &issue_id);
            }));
            still_applied = reapply.is_ok();
        }

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        }));
        assigned_ok = result.is_ok();
        check_invariants("after assign");

        if assigned_ok {
            // Extra: has_applied must now be false (application consumed by assign).
            let has = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.has_applied(&contributor, &org, &issue_id)
            }));
            if let Ok(h) = has {
                assert!(
                    !h,
                    "[after assign] has_applied must be false after successful assign"
                );
            }
            // Extra: is_assigned must be true.
            let asgn = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.is_assigned(&contributor, &org, &issue_id)
            }));
            if let Ok(a) = asgn {
                assert!(
                    a,
                    "[after assign] is_assigned must be true after successful assign"
                );
            }
        }
    }

    // ── Step 4a: complete ───────────────────────────────────────────────────
    if do_complete && assigned_ok {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
        }));
        if result.is_ok() {
            // After complete, org assignment count must have decreased.
            let oc = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.get_org_assignment_count(&contributor, &org)
            }));
            if let Ok(c) = oc {
                assert_eq!(
                    c, 0,
                    "[after complete] org_count must be 0 after single assign+complete, got {c}"
                );
            }
            // is_assigned must be false.
            let asgn = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.is_assigned(&contributor, &org, &issue_id)
            }));
            if let Ok(a) = asgn {
                assert!(
                    !a,
                    "[after complete] is_assigned must be false after complete_assignment"
                );
            }
        }
        check_invariants("after complete");
    }

    // ── Step 4b: revoke (alternative terminal step) ─────────────────────────
    // Only attempt revoke if: the revoke flag is set, assignment succeeded, and
    // we did NOT already complete it (complete removes the sentinel; revoke would
    // then return AssignmentNotFound which is fine but we want the success path).
    if do_revoke && assigned_ok && !do_complete {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        }));
        if result.is_ok() {
            // After revoke, org assignment count must be 0.
            let oc = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.get_org_assignment_count(&contributor, &org)
            }));
            if let Ok(c) = oc {
                assert_eq!(
                    c, 0,
                    "[after revoke] org_count must be 0 after single assign+revoke, got {c}"
                );
            }
            // is_assigned must be false.
            let asgn = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.is_assigned(&contributor, &org, &issue_id)
            }));
            if let Ok(a) = asgn {
                assert!(
                    !a,
                    "[after revoke] is_assigned must be false after revoke_assignment"
                );
            }
        }
        check_invariants("after revoke");
    }

    // ── Final invariant check ───────────────────────────────────────────────
    // Run once more at the end so any cross-step state corruption is detected
    // regardless of which branch was exercised.
    check_invariants("final");
});
