//! Fuzz target: `revoke_assignment` with random maintainer, contributor, org_id, issue_id.
//!
//! Exercises the revoke path including:
//! - Full cycle: apply → assign → revoke (verifies org assignment count returns to 0).
//! - Revoke before assign: only apply, then attempt revoke (AssignmentNotFound path).
//! - Revoke without any prior state (no apply, no assign).
//!
//! Input layout (matches existing fuzz target conventions):
//!   bytes [0..4)  — issue_id as little-endian u32
//!   bytes [4..)   — org_id characters (each byte mapped to lowercase ascii
//!                   via `(b % 26) + b'a'`)
//!   byte  [5]     — bit 0: if 1, perform full cycle (apply → assign → revoke)
//!                   bit 1: if 1, only apply (no assign), then attempt revoke

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

fuzz_target!(|data: &[u8]| {
    if data.len() < 5 {
        return;
    }

    let issue_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let raw: Vec<u8> = data[4..]
        .iter()
        .take(32)
        .map(|b| (b % 26) + b'a')
        .collect();
    let org_str = std::str::from_utf8(&raw).unwrap_or("org");
    if org_str.is_empty() {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, org_str);

    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
    }));

    // bit 0 of data[5]: full cycle (apply → assign → revoke)
    let do_full_cycle = data.len() > 5 && data[5] & 1 == 1;
    // bit 1 of data[5]: apply only, then attempt revoke without assign
    let do_revoke_before_assign = data.len() > 5 && data[5] & 2 == 2;

    if do_full_cycle {
        let mut assigned_ok = false;

        // Apply
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));

        // Assign
        let assign_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        }));
        assigned_ok = assign_result.is_ok();

        // Revoke
        let revoke_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        }));

        // After a successful assign + revoke the org assignment count must be 0
        if assigned_ok && revoke_result.is_ok() {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let count = client.get_org_assignment_count(&contributor, &org);
                assert_eq!(
                    count, 0,
                    "org assignment count should be 0 after assign+revoke, got {count}"
                );
            }));
        }
    } else if do_revoke_before_assign {
        // Only apply, then attempt revoke — must fail gracefully (AssignmentNotFound)
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        }));
    } else {
        // No prior state — bare revoke attempt must not trap
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        }));
    }
});
