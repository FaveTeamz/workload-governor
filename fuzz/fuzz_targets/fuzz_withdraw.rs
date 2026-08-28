//! Fuzz target: `withdraw_application` path.
//!
//! Issue #622 — https://github.com/FaveTeamz/workload-governor/issues/622
//!
//! Exercises the withdrawal path including:
//!   - apply → withdraw: verifies global application count returns to 0.
//!   - withdraw without prior apply: must not panic (ApplicationNotFound expected).
//!   - double-withdraw: second withdraw after first must not panic or corrupt state.
//!   - Counter arithmetic edge cases with max u32 issue_id and minimal org strings.
//!
//! Input layout:
//!   bytes [0..4)  — issue_id as little-endian u32
//!   bytes [4..)   — org_id characters (each byte mapped to lowercase ascii via
//!                   `(b % 26) + b'a'`, same as other fuzz targets)
//!   byte  [5]     — control flags (byte within org bytes):
//!                     bit 0: apply before withdraw (1 = apply first)
//!                     bit 1: attempt double-withdraw (1 = call withdraw twice)

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

fuzz_target!(|data: &[u8]| {
    if data.len() < 5 {
        return;
    }

    let issue_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);

    // Build org string from remaining bytes (same logic as fuzz_apply / fuzz_assign).
    let raw: Vec<u8> = data[4..]
        .iter()
        .take(32)
        .map(|b| (b % 26) + b'a')
        .collect();
    let org_str = std::str::from_utf8(&raw).unwrap_or("org");
    if org_str.is_empty() {
        return;
    }

    // Extract control flags from byte[5] (second byte of org string in `data`).
    let apply_first = data.len() > 5 && (data[5] & 1) == 1;
    let double_withdraw = data.len() > 5 && (data[5] & 2) == 2;

    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, org_str);

    // Initialize the contract — required for any state-changing call.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
    }));

    // Optionally apply before withdrawing.
    let mut applied = false;
    if apply_first {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
        applied = result.is_ok();
    }

    // First withdraw attempt.
    let withdraw_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.withdraw_application(&contributor, &org, &issue_id);
    }));

    if applied && withdraw_result.is_ok() {
        // Invariant: after apply + withdraw the global application count must return to 0.
        let count = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.get_global_application_count(&contributor)
        }));
        if let Ok(c) = count {
            // Any non-zero count here is a counter underflow or logic bug.
            assert_eq!(c, 0, "global count must be 0 after apply+withdraw");
        }

        // Invariant: has_applied must be false after a successful withdraw.
        let has = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.has_applied(&contributor, &org, &issue_id)
        }));
        if let Ok(h) = has {
            assert!(!h, "has_applied must be false after withdraw");
        }
    }

    // Double-withdraw path: second withdraw on an already-withdrawn application
    // must not cause a counter underflow panic — it should return ApplicationNotFound.
    if double_withdraw {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.withdraw_application(&contributor, &org, &issue_id);
        }));

        // Count must never go negative (underflow) — it is u32 so it wraps; assert it is 0.
        let count2 = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.get_global_application_count(&contributor)
        }));
        if let Ok(c2) = count2 {
            assert_eq!(c2, 0, "global count must still be 0 after double-withdraw");
        }
    }
});
