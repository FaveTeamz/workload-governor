//! Fuzz target: multi-sig admin threshold evaluation.
//!
//! Issue #836 — https://github.com/FaveTeamz/workload-governor/issues/836
//!
//! Exercises the multi-signature admin authentication logic introduced in #603:
//!
//! - `set_admin_threshold(threshold, signers)` must reject:
//!     - `threshold == 0`                        → `InvalidThreshold`
//!     - `threshold > signers.len()`             → `InvalidThreshold`
//! - With a valid threshold, admin operations (e.g. `register_maintainer`)
//!   must require exactly `threshold` out of the ordered signers to have
//!   provided auth.
//! - Duplicate signer addresses in the signer list must NOT individually
//!   count as separate authorisations — the threshold is a positional count
//!   over the ordered list, so duplicates cannot bypass the requirement.
//!
//! ## Invariants asserted after every operation
//!
//! 1. `threshold > signers.len()` ⟹ `set_admin_threshold` panics with
//!    `InvalidThreshold`.
//! 2. `threshold == 0` ⟹ `set_admin_threshold` panics with `InvalidThreshold`.
//! 3. A valid configuration (1 ≤ threshold ≤ signers.len()) must succeed.
//! 4. After a successful `set_admin_threshold`, an admin operation with mocked
//!    auth must succeed (the Soroban test env satisfies all `require_auth` calls
//!    via `mock_all_auths`).
//!
//! ## Input layout
//!
//! ```text
//! byte  [0]     — threshold value (raw byte; tested as-is and modulo signer count)
//! byte  [1]     — number of signers: clamped to [0, 10]
//! byte  [2]     — duplicate flag: bit 0 ⟹ inject the first signer again at position
//!                 `signer_count / 2` to test duplicate-signer detection
//! bytes [3..)   — ignored (reserved for future expansion)
//! ```
//!
//! The target tests both the `threshold > signer_count` rejection path AND, when
//! the threshold is valid, that the admin operation proceeds without panic.

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, Vec as SorobanVec};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

fuzz_target!(|data: &[u8]| {
    // Minimum: threshold byte + signer count byte + duplicate flag byte.
    if data.len() < 3 {
        return;
    }

    let raw_threshold: u32 = data[0] as u32;
    // Number of unique signers: 0 to 10.
    let signer_count: usize = (data[1] as usize) % 11; // 0..=10
    let inject_duplicate: bool = data[2] & 1 == 1;

    // ── Environment setup ───────────────────────────────────────────────────
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Initialize the contract — required before any state-changing call.
    let init_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
    }));
    if init_result.is_err() {
        return;
    }

    // ── Build the signer list ───────────────────────────────────────────────
    // Generate `signer_count` distinct addresses.
    let mut signer_addrs: std::vec::Vec<Address> = (0..signer_count)
        .map(|_| Address::generate(&env))
        .collect();

    // Optionally inject a duplicate: insert signers[0] at position
    // signer_count / 2 + 1 to mimic an adversarial duplicate-signer input.
    if inject_duplicate && signer_count >= 2 {
        let dup = signer_addrs[0].clone();
        let insert_pos = signer_count / 2;
        signer_addrs.insert(insert_pos, dup);
        // signer_addrs.len() is now signer_count + 1
    }

    // Convert to Soroban Vec<Address>.
    let mut signers = SorobanVec::<Address>::new(&env);
    for addr in &signer_addrs {
        signers.push_back(addr.clone());
    }
    let actual_signer_count = signers.len(); // u32

    // ── Test: threshold = 0 must always be rejected ─────────────────────────
    {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.set_admin_threshold(&0_u32, &signers);
        }));
        // threshold == 0 must always panic regardless of signer count.
        assert!(
            result.is_err(),
            "INVARIANT VIOLATED: set_admin_threshold(threshold=0, signers={actual_signer_count}) \
             must fail with InvalidThreshold but succeeded"
        );
    }

    // ── Test: threshold > signer_count must be rejected ──────────────────────
    if actual_signer_count < u32::MAX {
        let over_threshold = actual_signer_count + 1;
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.set_admin_threshold(&over_threshold, &signers);
        }));
        assert!(
            result.is_err(),
            "INVARIANT VIOLATED: set_admin_threshold(threshold={over_threshold}, \
             signers={actual_signer_count}) must fail (threshold > signer_count) but succeeded"
        );
    }

    // ── Test: valid threshold must succeed and enable admin operations ────────
    // A valid threshold is in [1, actual_signer_count]. We derive it from
    // raw_threshold modulo signer_count, ensuring it stays in range.
    if actual_signer_count == 0 {
        // With zero signers every threshold >= 1 is invalid — verify rejection.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.set_admin_threshold(&1_u32, &signers);
        }));
        assert!(
            result.is_err(),
            "INVARIANT VIOLATED: set_admin_threshold(threshold=1, signers=0) \
             must fail (threshold > signer_count) but succeeded"
        );
        return;
    }

    // Map raw_threshold into [1, actual_signer_count].
    let valid_threshold: u32 = (raw_threshold % actual_signer_count) + 1;
    // valid_threshold is now guaranteed to be in [1, actual_signer_count].

    let set_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.set_admin_threshold(&valid_threshold, &signers);
    }));
    assert!(
        set_result.is_ok(),
        "INVARIANT VIOLATED: set_admin_threshold(threshold={valid_threshold}, \
         signers={actual_signer_count}) must succeed but panicked"
    );

    // ── Post-config: admin operation must still work ──────────────────────────
    // Because mock_all_auths() satisfies every require_auth call, the multi-sig
    // check inside require_admin_auth should pass even for threshold > 1.
    // If it panics here, the multi-sig integration is broken.
    let org = Symbol::new(&env, "fuzzorg");
    let maintainer = Address::generate(&env);

    let op_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.register_maintainer(&admin, &maintainer, &org);
    }));
    assert!(
        op_result.is_ok(),
        "INVARIANT VIOLATED: register_maintainer must succeed after valid \
         set_admin_threshold(threshold={valid_threshold}, signers={actual_signer_count}) \
         with mock_all_auths"
    );

    // ── Duplicate-signer invariant ────────────────────────────────────────────
    // When duplicates were injected, verify that the configuration was accepted
    // (the contract stores the signer list verbatim; deduplication is not required
    // at storage time) AND that admin operations succeed (mock_all_auths covers all).
    // This confirms duplicates do not cause panics or counter overflow.
    if inject_duplicate && signer_count >= 2 {
        // Re-run register_maintainer with a fresh org to confirm idempotent
        // multi-sig auth with duplicates present.
        let org2 = Symbol::new(&env, "fuzzorg2");
        let maintainer2 = Address::generate(&env);
        let dup_op_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.register_maintainer(&admin, &maintainer2, &org2);
        }));
        assert!(
            dup_op_result.is_ok(),
            "INVARIANT VIOLATED: register_maintainer must succeed even when the \
             signer list contains duplicate entries (duplicates must not corrupt \
             the threshold counter)"
        );
    }

    // ── Threshold boundary: exactly threshold-1 — NOT tested directly ─────────
    // The Soroban test env's mock_all_auths unconditionally satisfies all
    // require_auth calls, so we cannot selectively withhold auth from individual
    // signers within a fuzz target. The invariant that "fewer than threshold valid
    // signers results in auth failure" is verified by the unit tests in src/test.rs
    // which control auth mocking precisely. This fuzz target focuses on the
    // configuration-time validation and the absence of panics/traps at runtime.
});
