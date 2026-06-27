//! Fuzz target: `assign_issue` with random maintainer, contributor, org_id, issue_id.
//!
//! Exercises the assign path including:
//! - Application-not-found error (no prior apply).
//! - Org assignment limit enforcement.
//! - Counter arithmetic edge cases.

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

    // Optionally apply first (based on data byte pattern)
    if data.len() > 5 && data[5] & 1 == 1 {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
    }

    // Attempt assign — may fail with ApplicationNotFound, OrgAssignmentLimitReached, etc.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
    }));

    // Attempt complete / revoke on whatever state results
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
    }));
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
    }));
});
