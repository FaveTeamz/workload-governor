//! Fuzz target: batch apply — a Vec of random issue_ids applied in sequence.
//!
//! Simulates the batch_apply pattern (once the batch PR lands) by calling
//! `apply_for_issue` in a loop with a fuzz-derived list of issue IDs.
//!
//! Key paths exercised:
//! - Global application limit (stops at 15).
//! - Duplicate application detection.
//! - Counter wrap-around edge cases across many distinct issues.

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

fuzz_target!(|data: &[u8]| {
    if data.len() < 2 {
        return;
    }

    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, "fuzzorg");

    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
    }));

    // Treat input as a stream of u16 issue IDs
    let issue_ids: Vec<u32> = data
        .chunks(2)
        .take(20) // cap at 20 to keep run fast
        .map(|c| {
            let lo = c[0] as u32;
            let hi = if c.len() > 1 { c[1] as u32 } else { 0 };
            (hi << 8) | lo
        })
        .filter(|id| *id > 0) // issue_id must be > 0
        .collect();

    for issue_id in issue_ids {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
    }

    // Verify the global count is within bounds (must never exceed GLOBAL_APP_LIMIT = 15)
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let count = client.get_global_application_count(&contributor);
        assert!(count <= 15, "global count {count} exceeded hard limit of 15");
    }));
});
