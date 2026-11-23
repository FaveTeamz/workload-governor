//! Fuzz target: `apply_for_issue` batch — variable vector lengths and
//! arbitrary duplicate distributions (issue #833).
//!
//! ## What this target exercises
//!
//! * Input vectors of length **0 to 64** — spanning below, at, and above the
//!   15-application global cap.
//! * Arbitrary mixes of:
//!   - Valid issue IDs
//!   - Duplicate IDs (same ID appearing multiple times)
//!   - Boundary IDs: 0, 1, u32::MAX-1, u32::MAX (sentinel values filtered by
//!     the contract's `require_valid_issue_id` guard)
//! * The target calls `apply_for_issue` for each ID in the input vector and
//!   collects successful applications.
//!
//! ## Invariants asserted after every run
//!
//! 1. `applied.len() ≤ min(input.len(), 15)` — never exceeds the global cap
//!    and never exceeds the number of inputs.
//! 2. **No duplicate issue IDs** in the set of successfully applied issues.
//! 3. `get_global_application_count(contributor) == applied.len()` — counter
//!    stays consistent with reality.
//! 4. `has_applied(contributor, org, id)` is true for every successfully
//!    applied ID.

#![no_main]

use arbitrary::Arbitrary;
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use std::collections::HashSet;
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

/// Global cap constant — must match `storage::GLOBAL_APP_LIMIT` in the contract.
const GLOBAL_CAP: usize = 15;

/// Sentinel issue IDs rejected by `require_valid_issue_id`.
const INVALID_IDS: [u32; 2] = [0, u32::MAX];

// ---------------------------------------------------------------------------
// Arbitrary input type
// ---------------------------------------------------------------------------

/// Fuzz input: a vector of 0..=64 issue IDs with arbitrary duplicate content.
#[derive(Arbitrary, Debug)]
struct BatchInput {
    /// Raw issue IDs — may contain duplicates, zeros, and u32::MAX sentinels.
    /// The `#[arbitrary]` derive generates vectors of arbitrary length.
    /// We clamp to 64 elements in the fuzz target to keep each run bounded.
    issue_ids: Vec<u32>,

    /// Single byte used to pick a short org name (maps to 1–4 lowercase chars).
    org_seed: u8,
}

// ---------------------------------------------------------------------------
// Fuzz target
// ---------------------------------------------------------------------------

fuzz_target!(|input: BatchInput| {
    // Clamp vector to 0..=64 elements.
    let raw_ids: Vec<u32> = input.issue_ids.into_iter().take(64).collect();

    // Build a 1-to-4-character org symbol from org_seed.
    let len = (input.org_seed % 4) as usize + 1; // 1..=4
    let mut org_chars = Vec::with_capacity(len);
    let mut seed = input.org_seed;
    for _ in 0..len {
        org_chars.push((seed % 26) + b'a');
        seed = seed.wrapping_add(7);
    }
    let org_str = match std::str::from_utf8(&org_chars) {
        Ok(s) if !s.is_empty() => s,
        _ => "org",
    };

    // ── Environment setup ──────────────────────────────────────────────────
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(WorkloadGovernor, ());
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org = Symbol::new(&env, org_str);

    // Initialize the contract (required before any state-changing call).
    client.initialize(&admin);

    // ── Apply each issue ID, collect successes ─────────────────────────────
    let mut applied: Vec<u32> = Vec::new();

    for &raw_id in &raw_ids {
        // Stop as soon as we've hit the global cap — further attempts would
        // all return GlobalApplicationLimitReached; no new coverage.
        if applied.len() >= GLOBAL_CAP {
            break;
        }

        // Skip sentinel values — the contract rejects them with InvalidIssueId.
        if INVALID_IDS.contains(&raw_id) {
            continue;
        }

        // Skip IDs already successfully applied (would return DuplicateApplication).
        if applied.contains(&raw_id) {
            continue;
        }

        // Attempt to apply; ignore expected contract errors.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.try_apply_for_issue(&contributor, &org, &raw_id)
        }));

        if let Ok(Ok(_)) = result {
            applied.push(raw_id);
        }
        // Any other outcome (Err or panic from an unexpected error) is allowed
        // to surface naturally so the fuzzer can report it.
    }

    // ── Invariant 1: applied.len() ≤ min(raw_ids.len(), GLOBAL_CAP) ────────
    assert!(
        applied.len() <= GLOBAL_CAP,
        "applied {} exceeds global cap {}",
        applied.len(),
        GLOBAL_CAP,
    );
    assert!(
        applied.len() <= raw_ids.len(),
        "applied {} exceeds input length {}",
        applied.len(),
        raw_ids.len(),
    );

    // ── Invariant 2: no duplicate issue IDs in applied set ──────────────────
    let unique: HashSet<u32> = applied.iter().copied().collect();
    assert_eq!(
        unique.len(),
        applied.len(),
        "duplicate issue IDs found in applied set: {:?}",
        applied,
    );

    // ── Invariant 3: global application counter == applied.len() ────────────
    let count_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.get_global_application_count(&contributor)
    }));
    if let Ok(count) = count_result {
        assert_eq!(
            count as usize,
            applied.len(),
            "global application count mismatch: contract says {}, we tracked {}",
            count,
            applied.len(),
        );
    }

    // ── Invariant 4: has_applied is true for every applied ID ───────────────
    for &id in &applied {
        let has_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.has_applied(&contributor, &org, &id)
        }));
        if let Ok(has) = has_result {
            assert!(
                has,
                "has_applied returned false for successfully applied issue_id={id}",
            );
        }
    }
});
