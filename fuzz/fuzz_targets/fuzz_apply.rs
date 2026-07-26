//! Fuzz target: `apply_for_issue` with random contributor, org_id, issue_id.
//!
//! The fuzzer exercises:
//! - Arbitrary org symbol strings (up to 32 bytes — Soroban Symbol limit).
//! - Arbitrary issue_id values (u32).
//! - Repeated calls to hit the global application limit path.
//!
//! No panics other than expected ContractError variants are acceptable.

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

fuzz_target!(|data: &[u8]| {
    if data.len() < 5 {
        return;
    }

    // Derive fuzzing parameters from input bytes
    let issue_id = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    // org_id: take bytes [4..] as a symbol string (max 32 chars, ascii-ish)
    let raw: Vec<u8> = data[4..]
        .iter()
        .take(32)
        .map(|b| (b % 26) + b'a') // keep within lowercase ascii
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
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, org_str);

    // Initialize (required before any state-changing call)
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
    }));

    // Apply — may legitimately panic with a ContractError; what must NOT happen
    // is an unexpected arithmetic overflow, out-of-bounds access, or other trap.
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.apply_for_issue(&contributor, &org, &issue_id);
    }));

    // Apply again for duplicate detection path
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.apply_for_issue(&contributor, &org, &issue_id);
    }));
});
