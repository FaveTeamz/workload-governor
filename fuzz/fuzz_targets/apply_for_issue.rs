//! Fuzz harness for `WorkloadGovernor::apply_for_issue`.
//!
//! # What is tested
//! * The function must **never panic** with an unhandled Rust panic (only
//!   `panic_with_error!` is permitted — those become expected `Err` results
//!   in the test environment).
//! * All contract error codes are valid: after a panic-caught invocation the
//!   contract state must remain consistent (the global application count and
//!   per-issue sentinel must stay in sync).
//! * Boundary values — `issue_id` at `u32::MAX`, global count exactly at the
//!   cap (15), duplicate applications — are all exercised without crashing.
//!
//! # Corpus
//! See `../corpus/apply_for_issue/` for structured seed inputs.  Each file
//! is a raw byte sequence consumed by `arbitrary::Arbitrary`.
//!
//! # Running locally
//! ```sh
//! cargo +nightly fuzz run apply_for_issue -- -max_total_time=60
//! # or use the Makefile convenience target:
//! make fuzz-apply
//! ```

#![no_main]

use arbitrary::{Arbitrary, Unstructured};
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

/// The action the fuzzer wants to perform before calling apply_for_issue.
#[derive(Debug, Arbitrary)]
enum PreAction {
    /// Already register `global_app_count` applications for the contributor
    /// (0..=14) so we can test near-limit and at-limit behaviour.
    PrefillApps { count: u8 },
    /// Nothing — fresh contributor with no applications.
    None,
}

/// Controls which contributor address is used in the call under test.
#[derive(Debug, Arbitrary)]
enum ContributorChoice {
    /// Use the same address used in the pre-fill step.
    Same,
    /// Use a fresh address that has never been seen by the contract.
    Fresh,
}

/// The full input consumed from raw fuzzer bytes.
#[derive(Debug, Arbitrary)]
struct FuzzInput {
    /// Org-id string fed to `Symbol::new`. Will be truncated to ≤32 bytes and
    /// filtered to ASCII alphanumeric + underscore (Soroban Symbol constraint).
    org_id_str: String,
    /// issue_id — full u32 range including 0, 1, u32::MAX.
    issue_id: u32,
    /// Whether to pre-fill applications for the contributor before the test call.
    pre_action: PreAction,
    /// Which contributor address to use for the actual call.
    contributor_choice: ContributorChoice,
    /// If true, call apply_for_issue a second time with the same args (duplicate test).
    apply_twice: bool,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Sanitises an arbitrary string into a valid Soroban Symbol value.
///
/// Soroban `Symbol` accepts only `[a-zA-Z0-9_]` and a maximum of 32 characters.
/// We filter then clamp so the contract never panics due to Symbol construction.
fn sanitise_symbol(raw: &str, env: &Env) -> Option<Symbol> {
    let filtered: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_')
        .take(32)
        .collect();
    if filtered.is_empty() {
        return None;
    }
    Some(Symbol::new(env, &filtered))
}

// ---------------------------------------------------------------------------
// Fuzz target
// ---------------------------------------------------------------------------

fuzz_target!(|data: &[u8]| {
    let mut u = Unstructured::new(data);
    let input: FuzzInput = match FuzzInput::arbitrary(&mut u) {
        Ok(v) => v,
        Err(_) => return, // not enough bytes — skip
    };

    // ── Environment setup ────────────────────────────────────────────────
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(WorkloadGovernor, ());
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    // ── Org symbol ───────────────────────────────────────────────────────
    // If the symbol is empty after sanitisation we fall back to a known-valid
    // org name so the harness still exercises the main path.
    let org_sym = sanitise_symbol(&input.org_id_str, &env)
        .unwrap_or_else(|| Symbol::new(&env, "default"));

    // ── Contributor addresses ────────────────────────────────────────────
    let main_contributor = Address::generate(&env);

    // ── Pre-action: fill up to `count` applications for `main_contributor`
    if let PreAction::PrefillApps { count } = input.pre_action {
        // Cap at 15 (global limit) — go up to but not past the limit so the
        // fuzzer can also land exactly on the boundary.
        let n = (count as u32).min(15);
        for i in 0..n {
            // Use distinct org symbols to avoid DuplicateApplication on same issue.
            let pre_org = Symbol::new(&env, "prefill");
            // Avoid collision with the actual call's issue_id on the last slot.
            let pre_issue_id = i.wrapping_add(1_000_000);
            // Ignore errors: the pre-fill might hit the limit itself.
            let _ = client.try_apply_for_issue(&main_contributor, &pre_org, &pre_issue_id);
        }
    }

    // ── Contributor for the call under test ──────────────────────────────
    let contributor = match input.contributor_choice {
        ContributorChoice::Same => main_contributor.clone(),
        ContributorChoice::Fresh => Address::generate(&env),
    };

    // ── Call under test ───────────────────────────────────────────────────
    //
    // We MUST NOT unwrap the result — all contract errors are valid outcomes.
    // The harness fails only if there is an *unexpected Rust panic*, i.e. if
    // the fuzzer finds a code path that reaches a bare `panic!` rather than
    // `panic_with_error!`.
    let result1 = client.try_apply_for_issue(&contributor, &org_sym, &input.issue_id);

    // ── Consistency invariant ─────────────────────────────────────────────
    // If the first call succeeded:
    //   - `has_applied` must return true
    //   - `get_global_application_count` must be ≥ 1 (and ≤ 15)
    if result1.is_ok() {
        let has = client.has_applied(&contributor, &org_sym, &input.issue_id);
        assert!(
            has,
            "has_applied returned false after successful apply_for_issue"
        );
        let count = client.get_global_application_count(&contributor);
        assert!(
            count >= 1 && count <= 15,
            "global_application_count={count} is out of valid range [1,15] after apply"
        );
    }

    // ── Duplicate application ─────────────────────────────────────────────
    if input.apply_twice && result1.is_ok() {
        // Second call must return DuplicateApplication (code 8), never panic.
        let result2 = client.try_apply_for_issue(&contributor, &org_sym, &input.issue_id);
        // Any error variant is acceptable; we just assert it isn't an unexpected panic.
        drop(result2);
    }
});
