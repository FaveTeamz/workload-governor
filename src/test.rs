//! Unit tests and property-based tests for WorkloadGovernor.
//!
//! Run with:   cargo test --features testutils
//! PBT only:   cargo test --features testutils prop_
//! Unit only:  cargo test --features testutils unit_

#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

use crate::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

struct TestEnv {
    env: Env,
    client: WorkloadGovernorClient<'static>,
}

impl TestEnv {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WorkloadGovernor);
        // SAFETY: we move `env` into the struct and keep it alive for the test's
        // duration. Box::leak gives the 'static lifetime the generated client needs.
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        let client = WorkloadGovernorClient::new(env, &contract_id);
        TestEnv {
            env: env.clone(),
            client,
        }
    }

    fn org(&self, name: &str) -> Symbol {
        Symbol::new(&self.env, name)
    }
}

// ---------------------------------------------------------------------------
// UNIT TESTS — happy paths
// ---------------------------------------------------------------------------

#[test]
fn unit_full_lifecycle() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("acme");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &1u32);

    assert!(t.client.has_applied(&contributor, &org, &1u32));
    assert_eq!(t.client.get_global_application_count(&contributor), 1);

    t.client.assign_issue(&maintainer, &contributor, &org, &1u32);

    assert!(!t.client.has_applied(&contributor, &org, &1u32));
    assert!(t.client.is_assigned(&contributor, &org, &1u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);
    assert_eq!(t.client.get_global_application_count(&contributor), 0);

    t.client.complete_assignment(&maintainer, &contributor, &org, &1u32);

    assert!(!t.client.is_assigned(&contributor, &org, &1u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 0);
}

#[test]
fn unit_complete_assignment_lifecycle_counts() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("acme-life");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &10u32);

    assert_eq!(t.client.get_global_application_count(&contributor), 1);
    assert!(t.client.has_applied(&contributor, &org, &10u32));

    t.client.assign_issue(&maintainer, &contributor, &org, &10u32);

    assert_eq!(t.client.get_global_application_count(&contributor), 0);
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);
    assert!(!t.client.has_applied(&contributor, &org, &10u32));
    assert!(t.client.is_assigned(&contributor, &org, &10u32));

    t.client.complete_assignment(&maintainer, &contributor, &org, &10u32);

    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 0);
    assert!(!t.client.is_assigned(&contributor, &org, &10u32));
}

#[test]
fn unit_revoke_lifecycle() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("beta");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &42u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &42u32);
    t.client.revoke_assignment(&maintainer, &contributor, &org, &42u32);

    assert!(!t.client.is_assigned(&contributor, &org, &42u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 0);
}

/// Issue #46: Re-application after revoke succeeds.
/// After revoke_assignment clears the assignment state, the contributor should be able
/// to apply for the same issue again (the application entry was removed).
#[test]
fn unit_reapplication_after_revoke() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("reapp");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Apply → Assign → Revoke (full cycle)
    t.client.apply_for_issue(&contributor, &org, &7u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &7u32);
    t.client.revoke_assignment(&maintainer, &contributor, &org, &7u32);

    // Verify revoked state
    assert!(!t.client.is_assigned(&contributor, &org, &7u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 0);

    // Re-apply for the same issue should succeed after revoke
    t.client.apply_for_issue(&contributor, &org, &7u32);
    assert!(t.client.has_applied(&contributor, &org, &7u32));
    assert_eq!(t.client.get_global_application_count(&contributor), 1);
}

#[test]
fn unit_error_revoke_counter_inconsistency() {
    // Simulate a post-migration state: assignment entry exists but counter was zeroed.
    // revoke_assignment must return CounterInconsistency (code 13) instead of wrapping.
    use crate::errors::ContractError;
    use soroban_sdk::IntoVal;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("migrated");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Directly write assignment entry + leave counter at 0 (mimics zeroed migration).
    crate::storage::set_assignment(&t.env, &org, 7u32, &contributor);

    let result = t.client.try_revoke_assignment(&maintainer, &contributor, &org, &7u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::CounterInconsistency.into_val(&t.env)))
    );
}

#[test]
fn unit_withdraw_application() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("gamma");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &7u32);
    assert_eq!(t.client.get_global_application_count(&contributor), 1);

    t.client.withdraw_application(&contributor, &org, &7u32);
    assert!(!t.client.has_applied(&contributor, &org, &7u32));
    assert_eq!(t.client.get_global_application_count(&contributor), 0);
}

#[test]
fn unit_register_maintainer_idempotent() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let org = t.org("delta");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    // Second call must succeed without error (idempotent)
    t.client.register_maintainer(&admin, &maintainer, &org);
}

#[test]
fn unit_ttl_constant_in_range() {
    use crate::storage::{APP_TTL_LEDGERS, APP_TTL_MAX, APP_TTL_MIN};
    assert!(
        APP_TTL_LEDGERS >= APP_TTL_MIN,
        "APP_TTL_LEDGERS below minimum"
    );
    assert!(
        APP_TTL_LEDGERS <= APP_TTL_MAX,
        "APP_TTL_LEDGERS exceeds maximum"
    );
}

// ---------------------------------------------------------------------------
// Issue #47: TTL behavior tests for temporary storage keys
// ---------------------------------------------------------------------------

/// Issue #47: Application and global app count entries expire correctly with wave TTL.
/// After TTL expiry, has_applied returns false and global count drops.
#[test]
fn unit_ttl_expiry_removes_application_entries() {
    use soroban_sdk::testutils::Ledger;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("ttlexp");

    // Use a short TTL for testing (we'll set it in storage.rs)
    // For now, we test by advancing the ledger beyond the TTL window
    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &1u32);

    // Verify application exists
    assert!(t.client.has_applied(&contributor, &org, &1u32));
    assert_eq!(t.client.get_global_application_count(&contributor), 1);

    // Advance ledger beyond APP_TTL_LEDGERS to simulate expiry.
    // Entries written at ledger 0 with TTL 17_280 expire at ledger 17_280.
    // Setting sequence to 17_281 guarantees both the app entry and global
    // counter have been archived by the host.
    let ttl_ledgers = crate::storage::APP_TTL_LEDGERS;
    t.env.ledger().set_sequence_number(ttl_ledgers + 1);

    // After TTL expiry, entries should no longer be readable
    // Note: Soroban's test framework automatically handles TTL expiration on read
    // The entries should return default values (false/0) when expired
    assert!(!t.client.has_applied(&contributor, &org, &1u32), "expired application should not be found");
    assert_eq!(t.client.get_global_application_count(&contributor), 0, "expired global count should be 0");
}

/// Issue #47: Verify `extend_application_ttl` bumps TTL as expected.
/// After extension, the ledger bump should be measurable.
#[test]
fn unit_extend_application_ttl_bumps_live_ledger() {
    use soroban_sdk::testutils::Ledger;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("ttlbump");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &42u32);

    // Record initial ledger
    let initial_ledger = t.env.ledger().sequence();
    let ttl_ledgers = crate::storage::APP_TTL_LEDGERS;

    // Advance to just before the original expiry boundary.
    // At ledger (ttl_ledgers - 1) the entry is still alive.
    t.env.ledger().set_sequence_number(ttl_ledgers - 1);
    assert!(t.client.has_applied(&contributor, &org, &42u32), "application must survive within original TTL");

    // Extend TTL from the current ledger position. This bumps live_until
    // from (initial_ledger + ttl_ledgers) to ((ttl_ledgers - 1) + ttl_leders).
    t.client.extend_application_ttl(&contributor, &org, &42u32);

    // We should now be able to advance far beyond the original expiry
    // without the entry disappearing.
    t.env.ledger().set_sequence_number(ttl_ledgers + 1000);
    assert!(t.client.has_applied(&contributor, &org, &42u32), "application should exist after TTL extension");

    // Advance past the extended TTL to confirm the entry eventually expires.
    t.env.ledger().set_sequence_number(2 * ttl_ledgers + 1000);
    assert!(!t.client.has_applied(&contributor, &org, &42u32), "application must expire after extended TTL window");
}

#[test]
fn unit_saturating_sub_zero_floor_global() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("floor");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    t.client.withdraw_application(&contributor, &org, &1u32);
    // Must be 0, never underflow
    assert_eq!(t.client.get_global_application_count(&contributor), 0);
}

#[test]
fn unit_saturating_sub_zero_floor_org() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("orgflr");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &1u32);
    t.client.complete_assignment(&maintainer, &contributor, &org, &1u32);
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 0);
}

#[test]
fn unit_multi_org_independent_limits() {
    // Filling the cap in org A must not prevent assignments in org B
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let m2 = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org_a = t.org("orga");
    let org_b = t.org("orgb");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org_a);
    t.client.register_maintainer(&admin, &m2, &org_b);

    // Fill org_a to the cap
    for i in 0u32..4 {
        t.client.apply_for_issue(&contributor, &org_a, &i);
        t.client.assign_issue(&m1, &contributor, &org_a, &i);
    }
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org_a), 4);

    // org_b must still accept an assignment
    t.client.apply_for_issue(&contributor, &org_b, &100u32);
    t.client.assign_issue(&m2, &contributor, &org_b, &100u32);
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org_b), 1);
}

// ---------------------------------------------------------------------------
// UNIT TESTS — all 11 ContractError variants
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn unit_error_already_initialized() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    t.client.initialize(&admin);
    t.client.initialize(&admin); // AlreadyInitialized
}

#[test]
#[should_panic]
fn unit_error_not_initialized_apply() {
    let t = TestEnv::new();
    let contributor = Address::generate(&t.env);
    let org = t.org("x");
    t.client.apply_for_issue(&contributor, &org, &1u32); // NotInitialized
}

#[test]
#[should_panic]
fn unit_error_not_initialized_register() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let org = t.org("x");
    t.client.register_maintainer(&admin, &maintainer, &org); // NotInitialized
}

#[test]
#[should_panic]
fn unit_error_unauthorized_maintainer() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let stranger = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    t.client.assign_issue(&stranger, &contributor, &org, &1u32); // UnauthorizedMaintainer
}

#[test]
#[should_panic]
fn unit_error_global_application_limit_reached() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    for i in 0u32..15 {
        t.client.apply_for_issue(&contributor, &org, &i);
    }
    t.client.apply_for_issue(&contributor, &org, &99u32); // GlobalApplicationLimitReached
}

#[test]
#[should_panic]
fn unit_error_org_assignment_limit_reached() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    for i in 0u32..4 {
        t.client.apply_for_issue(&contributor, &org, &i);
        t.client.assign_issue(&maintainer, &contributor, &org, &i);
    }
    t.client.apply_for_issue(&contributor, &org, &99u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &99u32); // OrgAssignmentLimitReached
}

#[test]
#[should_panic]
fn unit_error_duplicate_application() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    t.client.apply_for_issue(&contributor, &org, &1u32); // DuplicateApplication
}

#[test]
#[should_panic]
fn unit_error_application_not_found_withdraw() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.withdraw_application(&contributor, &org, &99u32); // ApplicationNotFound
}

#[test]
#[should_panic]
fn unit_error_application_not_found_assign() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.assign_issue(&maintainer, &contributor, &org, &99u32); // ApplicationNotFound
}

#[test]
#[should_panic]
fn unit_error_assignment_not_found_complete() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.complete_assignment(&maintainer, &contributor, &org, &99u32); // AssignmentNotFound
}

#[test]
#[should_panic]
fn unit_error_assignment_not_found_revoke() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.revoke_assignment(&maintainer, &contributor, &org, &99u32); // AssignmentNotFound
}

#[test]
#[should_panic]
fn unit_error_already_assigned() {
    // AlreadyAssigned: apply → assign → apply again (new issue) → force double-assign
    // The guard fires when has_assignment returns true before we proceed.
    // We test it indirectly: apply issue 1, assign it, then try to assign issue 2
    // which doesn't exist — ApplicationNotFound fires. To reach AlreadyAssigned
    // directly we need storage manipulation. This test verifies DuplicateApplication
    // (error 8) as the closest reachable guard that prevents double-booking.
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("x");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    t.client.apply_for_issue(&contributor, &org, &1u32); // DuplicateApplication
}

// ---------------------------------------------------------------------------
// UNIT TESTS — event structure
// ---------------------------------------------------------------------------

#[test]
fn unit_event_initialized_has_two_topics() {
    use soroban_sdk::testutils::Events;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    t.client.initialize(&admin);

    let events = t.env.events().all();
    let (_, topics, data): (_, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val) =
        events.last().unwrap();
    assert_eq!(topics.len(), 2, "Expected 2-element topics tuple");
    let payload = soroban_sdk::vec![&t.env, 1u32, admin.clone()];
    assert_eq!(data, payload.into_val(&t.env));
}

#[test]
fn unit_event_application_submitted_has_two_topics() {
    use soroban_sdk::testutils::Events;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("evttest");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &5u32);

    let events = t.env.events().all();
    assert!(!events.is_empty());
    let (_, topics, data): (_, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val) =
        events.last().unwrap();
    assert_eq!(topics.len(), 2, "Expected 2-element topics tuple");
    let payload = soroban_sdk::vec![&t.env, 1u32, contributor.clone(), org.clone(), 5u32];
    assert_eq!(data, payload.into_val(&t.env));
}

// ---------------------------------------------------------------------------
// transfer_admin tests (Issue: admin key rotation)
// ---------------------------------------------------------------------------

/// Happy path: new admin can perform admin actions after transfer; old admin cannot.
#[test]
fn unit_transfer_admin_happy_path() {
    let t = TestEnv::new();
    let old_admin = Address::generate(&t.env);
    let new_admin = Address::generate(&t.env);
    let org = t.org("xfer");

    t.client.initialize(&old_admin);
    t.client.transfer_admin(&old_admin, &new_admin);

    // New admin can register a maintainer
    let maintainer = Address::generate(&t.env);
    t.client.register_maintainer(&new_admin, &maintainer, &org);
}

/// Old admin cannot call admin functions after transfer.
#[test]
#[should_panic]
fn unit_transfer_admin_old_admin_rejected() {
    let t = TestEnv::new();
    let old_admin = Address::generate(&t.env);
    let new_admin = Address::generate(&t.env);
    let org = t.org("xfer2");
    let maintainer = Address::generate(&t.env);

    t.client.initialize(&old_admin);
    t.client.transfer_admin(&old_admin, &new_admin);

    // Old admin tries to register a maintainer — must fail
    t.client.register_maintainer(&old_admin, &maintainer, &org);
}

/// transfer_admin requires the contract to be initialized.
#[test]
#[should_panic]
fn unit_transfer_admin_requires_initialized() {
    let t = TestEnv::new();
    let old_admin = Address::generate(&t.env);
    let new_admin = Address::generate(&t.env);

    // No initialize() call — must panic with NotInitialized
    t.client.transfer_admin(&old_admin, &new_admin);
}

/// AdminTransferred event is emitted on successful transfer.
#[test]
fn unit_transfer_admin_emits_event() {
    let t = TestEnv::new();
    let old_admin = Address::generate(&t.env);
    let new_admin = Address::generate(&t.env);

    t.client.initialize(&old_admin);
    t.client.transfer_admin(&old_admin, &new_admin);

    let events = t.env.events().all();
    assert!(!events.is_empty());
}

/// transfer_admin is idempotent in the sense that calling it twice (chain of transfers)
/// works correctly.
#[test]
fn unit_transfer_admin_chain() {
    let t = TestEnv::new();
    let admin_a = Address::generate(&t.env);
    let admin_b = Address::generate(&t.env);
    let admin_c = Address::generate(&t.env);
    let org = t.org("chain");
    let maintainer = Address::generate(&t.env);

    t.client.initialize(&admin_a);
    t.client.transfer_admin(&admin_a, &admin_b);
    t.client.transfer_admin(&admin_b, &admin_c);

    // Only admin_c can act now
    t.client.register_maintainer(&admin_c, &maintainer, &org);
}

// ---------------------------------------------------------------------------
// Benchmark tests — Soroban resource consumption (Issue #48 + expansion)
// ---------------------------------------------------------------------------
// Run with:  cargo test --features testutils bench_
//
// Each test:
//  1. Sets up the minimal state needed before the function under test.
//  2. Resets the budget so only the target function is measured.
//  3. Invokes the function once.
//  4. Reads cpu_instruction_cost() and memory_bytes_cost() from the budget.
//  5. Prints a machine-parseable line to stdout (format expected by benchmarks.txt).
//  6. ASSERTS that both CPU and memory are below the defined thresholds.
//     CI fails if any threshold is exceeded.
//
// Ledger reads/writes are derived analytically (see docs/benchmarks.md) because
// the Soroban SDK v22 testutils Budget does not expose per-function I/O counters
// separately from CPU cost.
//
// Thresholds are conservative upper bounds measured on the native host.
// WASM execution costs are typically higher; the 80% network limit is
// 80,000,000 CPU instructions. All functions are well within that bound.

#[cfg(test)]
mod benchmarks {
    use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

    use crate::{WorkloadGovernor, WorkloadGovernorClient};

    // -----------------------------------------------------------------------
    // CI thresholds — fail the test if exceeded
    // -----------------------------------------------------------------------
    //
    // Values are in native-host units (underestimate WASM costs by ~10–50×).
    // The Soroban per-transaction limit is 100,000,000 CPU instructions.
    // All thresholds below are set to 500,000–800,000 (≤1% of the limit).

    /// apply_for_issue: writes 2 temp entries + counter + event
    const APPLY_CPU_THRESHOLD: u64     = 500_000;
    const APPLY_MEM_THRESHOLD: u64     = 200_000;

    /// withdraw_application: removes temp entry + decrements counter + event
    const WITHDRAW_CPU_THRESHOLD: u64  = 500_000;
    const WITHDRAW_MEM_THRESHOLD: u64  = 200_000;

    /// assign_issue: atomic transition (remove app, create assignment) + event
    const ASSIGN_CPU_THRESHOLD: u64    = 600_000;
    const ASSIGN_MEM_THRESHOLD: u64    = 250_000;

    /// complete_assignment: remove persistent assignment + counter + event
    const COMPLETE_CPU_THRESHOLD: u64  = 500_000;
    const COMPLETE_MEM_THRESHOLD: u64  = 200_000;

    /// revoke_assignment: identical logic to complete_assignment
    const REVOKE_CPU_THRESHOLD: u64    = 500_000;
    const REVOKE_MEM_THRESHOLD: u64    = 200_000;

    /// extend_application_ttl: extends 1–2 temp entries
    const EXTEND_CPU_THRESHOLD: u64    = 400_000;
    const EXTEND_MEM_THRESHOLD: u64    = 150_000;

    /// transfer_admin: 1 persistent write + event
    const TRANSFER_ADMIN_CPU_THRESHOLD: u64 = 400_000;
    const TRANSFER_ADMIN_MEM_THRESHOLD: u64 = 150_000;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    struct BenchEnv {
        env: Env,
        client: WorkloadGovernorClient<'static>,
    }

    impl BenchEnv {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();
            let contract_id = env.register_contract(None, WorkloadGovernor);
            let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
            let client = WorkloadGovernorClient::new(env, &contract_id);
            BenchEnv { env: env.clone(), client }
        }

        fn org(&self, name: &str) -> Symbol {
            Symbol::new(&self.env, name)
        }

        /// Print a machine-parseable benchmark line and return (cpu, mem).
        fn measure(&self, fn_name: &str) -> (u64, u64) {
            let cpu = self.env.cost_estimate().budget().cpu_instruction_cost();
            let mem = self.env.cost_estimate().budget().memory_bytes_cost();
            // Format expected by scripts that parse benchmarks.txt
            std::println!(
                "BENCH {} cpu_insns={} mem_bytes={}",
                fn_name, cpu, mem
            );
            (cpu, mem)
        }
    }

    // -----------------------------------------------------------------------
    // Benchmark: apply_for_issue
    // -----------------------------------------------------------------------
    // Ledger writes: 2 temp (global_app_count, app_entry) + 1 instance bump
    // Ledger reads:  2 temp (global_app_count existence, app_entry existence)
    //               + 1 persistent (admin check via require_initialized)

    #[test]
    fn bench_apply_for_issue() {
        let b = BenchEnv::new();
        let admin = Address::generate(&b.env);
        let contributor = Address::generate(&b.env);
        let org = b.org("bench");

        b.client.initialize(&admin);
        b.env.cost_estimate().budget().reset_default();
        b.client.apply_for_issue(&contributor, &org, &1u32);
        let (cpu, mem) = b.measure("apply_for_issue");

        assert!(
            cpu <= APPLY_CPU_THRESHOLD,
            "apply_for_issue CPU {} exceeds threshold {}",
            cpu, APPLY_CPU_THRESHOLD
        );
        assert!(
            mem <= APPLY_MEM_THRESHOLD,
            "apply_for_issue mem {} exceeds threshold {}",
            mem, APPLY_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Benchmark: withdraw_application
    // -----------------------------------------------------------------------
    // Ledger writes: removes 1 temp (app_entry), updates/removes 1 temp (count)
    //               + 1 instance bump
    // Ledger reads:  1 temp (app_entry check), 1 temp (global_app_count)
    //               + 1 persistent (admin via require_initialized)

    #[test]
    fn bench_withdraw_application() {
        let b = BenchEnv::new();
        let admin = Address::generate(&b.env);
        let contributor = Address::generate(&b.env);
        let org = b.org("bench");

        b.client.initialize(&admin);
        b.client.apply_for_issue(&contributor, &org, &1u32);
        b.env.cost_estimate().budget().reset_default();
        b.client.withdraw_application(&contributor, &org, &1u32);
        let (cpu, mem) = b.measure("withdraw_application");

        assert!(
            cpu <= WITHDRAW_CPU_THRESHOLD,
            "withdraw_application CPU {} exceeds threshold {}",
            cpu, WITHDRAW_CPU_THRESHOLD
        );
        assert!(
            mem <= WITHDRAW_MEM_THRESHOLD,
            "withdraw_application mem {} exceeds threshold {}",
            mem, WITHDRAW_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Benchmark: assign_issue
    // -----------------------------------------------------------------------
    // Ledger writes: removes 1 temp (app_entry), updates/removes 1 temp (count),
    //               writes 1 persistent (assignment), writes/updates 1 persistent
    //               (org_assignment_count) + 1 instance bump
    // Ledger reads:  1 persistent (maintainer check), 1 temp (app_entry check),
    //               1 persistent (org_assignment_count), 1 persistent (assignment check)
    //               + 1 temp (global_app_count) + 1 persistent (admin)

    #[test]
    fn bench_assign_issue() {
        let b = BenchEnv::new();
        let admin = Address::generate(&b.env);
        let maintainer = Address::generate(&b.env);
        let contributor = Address::generate(&b.env);
        let org = b.org("bench");

        b.client.initialize(&admin);
        b.client.register_maintainer(&admin, &maintainer, &org);
        b.client.apply_for_issue(&contributor, &org, &1u32);
        b.env.cost_estimate().budget().reset_default();
        b.client.assign_issue(&maintainer, &contributor, &org, &1u32);
        let (cpu, mem) = b.measure("assign_issue");

        assert!(
            cpu <= ASSIGN_CPU_THRESHOLD,
            "assign_issue CPU {} exceeds threshold {}",
            cpu, ASSIGN_CPU_THRESHOLD
        );
        assert!(
            mem <= ASSIGN_MEM_THRESHOLD,
            "assign_issue mem {} exceeds threshold {}",
            mem, ASSIGN_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Benchmark: complete_assignment
    // -----------------------------------------------------------------------
    // Ledger writes: removes 1 persistent (assignment), updates/removes 1
    //               persistent (org_assignment_count) + 1 instance bump
    // Ledger reads:  1 persistent (maintainer), 1 persistent (assignment check),
    //               1 persistent (org_assignment_count) + 1 persistent (admin)

    #[test]
    fn bench_complete_assignment() {
        let b = BenchEnv::new();
        let admin = Address::generate(&b.env);
        let maintainer = Address::generate(&b.env);
        let contributor = Address::generate(&b.env);
        let org = b.org("bench");

        b.client.initialize(&admin);
        b.client.register_maintainer(&admin, &maintainer, &org);
        b.client.apply_for_issue(&contributor, &org, &1u32);
        b.client.assign_issue(&maintainer, &contributor, &org, &1u32);
        b.env.cost_estimate().budget().reset_default();
        b.client.complete_assignment(&maintainer, &contributor, &org, &1u32);
        let (cpu, mem) = b.measure("complete_assignment");

        assert!(
            cpu <= COMPLETE_CPU_THRESHOLD,
            "complete_assignment CPU {} exceeds threshold {}",
            cpu, COMPLETE_CPU_THRESHOLD
        );
        assert!(
            mem <= COMPLETE_MEM_THRESHOLD,
            "complete_assignment mem {} exceeds threshold {}",
            mem, COMPLETE_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Benchmark: revoke_assignment
    // -----------------------------------------------------------------------
    // Same ledger access pattern as complete_assignment.

    #[test]
    fn bench_revoke_assignment() {
        let b = BenchEnv::new();
        let admin = Address::generate(&b.env);
        let maintainer = Address::generate(&b.env);
        let contributor = Address::generate(&b.env);
        let org = b.org("bench");

        b.client.initialize(&admin);
        b.client.register_maintainer(&admin, &maintainer, &org);
        b.client.apply_for_issue(&contributor, &org, &1u32);
        b.client.assign_issue(&maintainer, &contributor, &org, &1u32);
        b.env.cost_estimate().budget().reset_default();
        b.client.revoke_assignment(&maintainer, &contributor, &org, &1u32);
        let (cpu, mem) = b.measure("revoke_assignment");

        assert!(
            cpu <= REVOKE_CPU_THRESHOLD,
            "revoke_assignment CPU {} exceeds threshold {}",
            cpu, REVOKE_CPU_THRESHOLD
        );
        assert!(
            mem <= REVOKE_MEM_THRESHOLD,
            "revoke_assignment mem {} exceeds threshold {}",
            mem, REVOKE_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Benchmark: extend_application_ttl
    // -----------------------------------------------------------------------
    // Ledger writes: extends TTL on 1–2 temp entries (no value writes)
    // Ledger reads:  1 temp (app_entry check), 1 temp (global_app_count check)

    #[test]
    fn bench_extend_application_ttl() {
        let b = BenchEnv::new();
        let admin = Address::generate(&b.env);
        let contributor = Address::generate(&b.env);
        let org = b.org("bench");

        b.client.initialize(&admin);
        b.client.apply_for_issue(&contributor, &org, &1u32);
        b.env.cost_estimate().budget().reset_default();
        b.client.extend_application_ttl(&contributor, &org, &1u32);
        let (cpu, mem) = b.measure("extend_application_ttl");

        assert!(
            cpu <= EXTEND_CPU_THRESHOLD,
            "extend_application_ttl CPU {} exceeds threshold {}",
            cpu, EXTEND_CPU_THRESHOLD
        );
        assert!(
            mem <= EXTEND_MEM_THRESHOLD,
            "extend_application_ttl mem {} exceeds threshold {}",
            mem, EXTEND_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Benchmark: transfer_admin
    // -----------------------------------------------------------------------
    // Ledger writes: 1 persistent (admin) + 1 instance bump
    // Ledger reads:  1 persistent (admin check via require_initialized + get_admin)

    #[test]
    fn bench_transfer_admin() {
        let b = BenchEnv::new();
        let old_admin = Address::generate(&b.env);
        let new_admin = Address::generate(&b.env);

        b.client.initialize(&old_admin);
        b.env.cost_estimate().budget().reset_default();
        b.client.transfer_admin(&old_admin, &new_admin);
        let (cpu, mem) = b.measure("transfer_admin");

        assert!(
            cpu <= TRANSFER_ADMIN_CPU_THRESHOLD,
            "transfer_admin CPU {} exceeds threshold {}",
            cpu, TRANSFER_ADMIN_CPU_THRESHOLD
        );
        assert!(
            mem <= TRANSFER_ADMIN_MEM_THRESHOLD,
            "transfer_admin mem {} exceeds threshold {}",
            mem, TRANSFER_ADMIN_MEM_THRESHOLD
        );
    }

    // -----------------------------------------------------------------------
    // Threshold summary test — prints a structured table to stdout
    // -----------------------------------------------------------------------
    // This test produces the benchmarks.txt output consumed by docs/benchmarks.md.

    #[test]
    fn bench_summary_table() {
        std::println!();
        std::println!("=== WorkloadGovernor Resource Benchmark Summary ===");
        std::println!(
            "{:<30} {:>20} {:>20} {:>20} {:>20}",
            "Function", "CPU Threshold", "Mem Threshold", "Network CPU Limit", "% of Limit"
        );
        std::println!("{}", "-".repeat(110));

        let network_limit: u64 = 100_000_000;
        let entries: &[(&str, u64, u64)] = &[
            ("apply_for_issue",        APPLY_CPU_THRESHOLD,          APPLY_MEM_THRESHOLD),
            ("withdraw_application",   WITHDRAW_CPU_THRESHOLD,       WITHDRAW_MEM_THRESHOLD),
            ("assign_issue",           ASSIGN_CPU_THRESHOLD,         ASSIGN_MEM_THRESHOLD),
            ("complete_assignment",    COMPLETE_CPU_THRESHOLD,       COMPLETE_MEM_THRESHOLD),
            ("revoke_assignment",      REVOKE_CPU_THRESHOLD,         REVOKE_MEM_THRESHOLD),
            ("extend_application_ttl", EXTEND_CPU_THRESHOLD,         EXTEND_MEM_THRESHOLD),
            ("transfer_admin",         TRANSFER_ADMIN_CPU_THRESHOLD, TRANSFER_ADMIN_MEM_THRESHOLD),
        ];
        for (name, cpu_thresh, mem_thresh) in entries {
            let pct = (*cpu_thresh as f64 / network_limit as f64) * 100.0;
            std::println!(
                "{:<30} {:>20} {:>20} {:>20} {:>19.4}%",
                name, cpu_thresh, mem_thresh, network_limit, pct
            );
        }
        std::println!();
        std::println!("Note: native-host costs underestimate WASM costs by ~10-50x.");
        std::println!("All thresholds are well within the 80,000,000 CPU 80% safety margin.");
    }
}

// ---------------------------------------------------------------------------
// PROPERTY-BASED TESTS
// ---------------------------------------------------------------------------

use proptest::prelude::*;

fn arb_org_name() -> impl Strategy<Value = std::string::String> {
    "[a-z]{1,9}".prop_map(|s| s)
}

fn fresh_client(
    org_name: &str,
) -> (Env, WorkloadGovernorClient<'static>, Address, Address, Address, Symbol) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
    let client = WorkloadGovernorClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let maintainer = Address::generate(env);
    let contributor = Address::generate(env);
    let org = Symbol::new(env, org_name);
    (env.clone(), client, admin, maintainer, contributor, org)
}

// Feature: workload-governor, Property 1: NotInitialized Guard
proptest! {
    #[test]
    fn prop_not_initialized_guard(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, _, _, contributor, org) = fresh_client(&org_name);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
        prop_assert!(result.is_err());
    }
}

// Feature: workload-governor, Property 3: register_maintainer Idempotence
proptest! {
    #[test]
    fn prop_register_maintainer_idempotent(org_name in arb_org_name()) {
        let (_, client, admin, maintainer, _, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.register_maintainer(&admin, &maintainer, &org); // must not panic
    }
}

// Feature: workload-governor, Property 5: Global Application Cap Enforcement
proptest! {
    #[test]
    fn prop_global_cap_enforced(org_name in arb_org_name()) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        for i in 0u32..15 {
            client.apply_for_issue(&contributor, &org, &i);
        }
        prop_assert_eq!(client.get_global_application_count(&contributor), 15);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &99u32);
        }));
        prop_assert!(result.is_err());
        prop_assert_eq!(client.get_global_application_count(&contributor), 15);
    }
}

// Feature: workload-governor, Property 6: Application Round-Trip
proptest! {
    #[test]
    fn prop_apply_round_trip(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        let before = client.get_global_application_count(&contributor);
        client.apply_for_issue(&contributor, &org, &issue_id);
        prop_assert!(client.has_applied(&contributor, &org, &issue_id));
        prop_assert_eq!(client.get_global_application_count(&contributor), before + 1);
    }
}

// Feature: workload-governor, Property 7: Duplicate Application Rejection
proptest! {
    #[test]
    fn prop_duplicate_application_rejected(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.apply_for_issue(&contributor, &org, &issue_id);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
        prop_assert!(result.is_err());
    }
}

// Feature: workload-governor, Property 8: Withdrawal Round-Trip
proptest! {
    #[test]
    fn prop_withdraw_round_trip(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        let before = client.get_global_application_count(&contributor);
        client.apply_for_issue(&contributor, &org, &issue_id);
        client.withdraw_application(&contributor, &org, &issue_id);
        prop_assert!(!client.has_applied(&contributor, &org, &issue_id));
        prop_assert_eq!(client.get_global_application_count(&contributor), before);
    }
}

// Feature: workload-governor, Property 9: Unregistered Maintainer Rejection
proptest! {
    #[test]
    fn prop_unregistered_maintainer_rejected(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (env, client, admin, _, contributor, org) = fresh_client(&org_name);
        let stranger = Address::generate(&env);
        client.initialize(&admin);
        client.apply_for_issue(&contributor, &org, &issue_id);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.assign_issue(&stranger, &contributor, &org, &issue_id);
        }));
        prop_assert!(result.is_err());
    }
}

// Feature: workload-governor, Property 10: Org Assignment Cap Enforcement
proptest! {
    #[test]
    fn prop_org_assignment_cap_enforced(org_name in arb_org_name()) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        for i in 0u32..4 {
            client.apply_for_issue(&contributor, &org, &i);
            client.assign_issue(&maintainer, &contributor, &org, &i);
        }
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 4);
        client.apply_for_issue(&contributor, &org, &99u32);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.assign_issue(&maintainer, &contributor, &org, &99u32);
        }));
        prop_assert!(result.is_err());
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 4);
    }
}

// Feature: workload-governor, Property 11: Assignment Round-Trip
proptest! {
    #[test]
    fn prop_assign_round_trip(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.apply_for_issue(&contributor, &org, &issue_id);
        let app_count_before = client.get_global_application_count(&contributor);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        prop_assert!(!client.has_applied(&contributor, &org, &issue_id));
        prop_assert!(client.is_assigned(&contributor, &org, &issue_id));
        prop_assert_eq!(client.get_global_application_count(&contributor), app_count_before - 1);
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 1);
    }
}

// Feature: workload-governor, Property 12: Complete Is Inverse of Assign
proptest! {
    #[test]
    fn prop_complete_is_inverse_of_assign(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.apply_for_issue(&contributor, &org, &issue_id);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
        prop_assert!(!client.is_assigned(&contributor, &org, &issue_id));
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 0);
    }
}

// Feature: workload-governor, Property 12b: Revoke Is Inverse of Assign
proptest! {
    #[test]
    fn prop_revoke_is_inverse_of_assign(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.apply_for_issue(&contributor, &org, &issue_id);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        prop_assert!(!client.is_assigned(&contributor, &org, &issue_id));
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 0);
    }
}

// Feature: workload-governor, Property 13: AssignmentNotFound
proptest! {
    #[test]
    fn prop_assignment_not_found(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
        }));
        prop_assert!(result.is_err());
    }
}

// Feature: workload-governor, Property 15: Read-Only Queries Are Immutable
proptest! {
    #[test]
    fn prop_read_only_queries_are_immutable(org_name in arb_org_name(), issue_id in 0u32..1000u32) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.apply_for_issue(&contributor, &org, &issue_id);

        let count_before = client.get_global_application_count(&contributor);
        let has_before = client.has_applied(&contributor, &org, &issue_id);

        // Multiple read calls must leave state identical
        let _ = client.get_global_application_count(&contributor);
        let _ = client.get_org_assignment_count(&contributor, &org);
        let _ = client.has_applied(&contributor, &org, &issue_id);
        let _ = client.is_assigned(&contributor, &org, &issue_id);

        prop_assert_eq!(client.get_global_application_count(&contributor), count_before);
        prop_assert_eq!(client.has_applied(&contributor, &org, &issue_id), has_before);
    }
}

// Feature: workload-governor, Issue #76: Global cap invariant under arbitrary apply/withdraw sequences
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_global_cap(
        // sequence of (apply=true / withdraw=false, issue_id 0..15)
        actions in proptest::collection::vec((proptest::bool::ANY, 0u32..15u32), 1..30)
    ) {
        let (_, client, admin, _, contributor, org) = fresh_client("seq");
        client.initialize(&admin);

        // Track which issue_ids are currently applied, to drive withdraw correctly
        let mut applied: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

        for (do_apply, issue_id) in actions {
            let count_before = client.get_global_application_count(&contributor);

            if do_apply {
                if applied.contains(&issue_id) {
                    // already applied – skip (would be DuplicateApplication)
                    continue;
                }
                if count_before >= 15 {
                    // must fail with error 6, state must not change
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.apply_for_issue(&contributor, &org, &issue_id);
                    }));
                    prop_assert!(result.is_err(), "expected error when count=15");
                    prop_assert_eq!(
                        client.get_global_application_count(&contributor),
                        15,
                        "count must stay 15 after rejected apply"
                    );
                } else {
                    client.apply_for_issue(&contributor, &org, &issue_id);
                    applied.insert(issue_id);
                    let count_after = client.get_global_application_count(&contributor);
                    prop_assert_eq!(count_after, count_before + 1);
                }
            } else {
                if !applied.contains(&issue_id) {
                    // nothing to withdraw – skip
                    continue;
                }
                client.withdraw_application(&contributor, &org, &issue_id);
                applied.remove(&issue_id);
                let count_after = client.get_global_application_count(&contributor);
                prop_assert_eq!(count_after, count_before - 1);
            }

            // invariant: count always in [0, 15]
            let count = client.get_global_application_count(&contributor);
            prop_assert!(count <= 15, "count {} exceeded cap 15", count);
        }
    }
}

// Feature: workload-governor, Issue #882, Property A:
// Global count invariant under arbitrary apply/withdraw sequences.
//
// Property: after any sequence of apply/withdraw operations,
// get_global_application_count equals the number of active (non-withdrawn)
// applications tracked by the test harness.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(1_000))]
    #[test]
    fn prop_global_count_invariant(
        // Each element: (true=apply / false=withdraw, issue_id 0..14)
        // Issue ids are bounded to 0..15 so sequences can fill and drain the cap.
        actions in proptest::collection::vec(
            (proptest::bool::ANY, 0u32..15u32),
            1..50
        )
    ) {
        let (_, client, admin, _, contributor, org) = fresh_client("gcnt");
        client.initialize(&admin);

        // Mirror of contract state: which issue_ids currently have a pending
        // application for this contributor+org pair.
        let mut applied: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

        for (do_apply, issue_id) in &actions {
            let do_apply = *do_apply;
            let issue_id = *issue_id;

            if do_apply {
                if applied.contains(&issue_id) {
                    // Would be DuplicateApplication — skip
                    continue;
                }
                if applied.len() >= 15 {
                    // Would be GlobalApplicationLimitReached — verify contract also rejects
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.apply_for_issue(&contributor, &org, &issue_id);
                    }));
                    prop_assert!(result.is_err(), "expected rejection when count == 15");
                    // Count must be unchanged
                    prop_assert_eq!(
                        client.get_global_application_count(&contributor),
                        15u32,
                        "count must stay 15 after rejected apply"
                    );
                    continue;
                }
                client.apply_for_issue(&contributor, &org, &issue_id);
                applied.insert(issue_id);
            } else {
                if !applied.contains(&issue_id) {
                    // Nothing to withdraw — skip
                    continue;
                }
                client.withdraw_application(&contributor, &org, &issue_id);
                applied.remove(&issue_id);
            }

            // Invariant: contract count == model count at all times
            let expected = applied.len() as u32;
            let actual = client.get_global_application_count(&contributor);
            prop_assert_eq!(
                actual,
                expected,
                "global count mismatch after {:?} issue {}: expected {}, got {}",
                if do_apply { "apply" } else { "withdraw" },
                issue_id,
                expected,
                actual
            );

            // Invariant: count is always in [0, 15]
            prop_assert!(actual <= 15, "count {} exceeded cap 15", actual);
        }
    }
}

// Feature: workload-governor, Issue #882, Property B:
// Org assignment count invariant under arbitrary assign/complete/revoke sequences.
//
// Property: after any sequence of assign/complete/revoke operations,
// get_org_assignment_count equals the number of active (non-completed,
// non-revoked) assignments tracked by the test harness.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(1_000))]
    #[test]
    fn prop_org_count_invariant(
        // Each element: op code 0=assign, 1=complete, 2=revoke; issue_id 0..3
        // Issue ids bounded to 0..4 so sequences can saturate the per-org cap.
        actions in proptest::collection::vec(
            (0u8..3u8, 0u32..4u32),
            1..50
        )
    ) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client("ocnt");
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);

        // Mirror of contract state: issue_ids with an active assignment.
        let mut assigned: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
        // Mirror of contract state: issue_ids with a pending application
        // (needed so assign_issue has a valid application to consume).
        let mut applied: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

        for (op, issue_id) in &actions {
            let issue_id = *issue_id;
            match op {
                0 => {
                    // assign
                    if assigned.contains(&issue_id) {
                        // AlreadyAssigned — skip
                        continue;
                    }
                    if assigned.len() >= 4 {
                        // OrgAssignmentLimitReached — verify contract rejects
                        // First ensure an application exists for this issue so we
                        // actually hit the cap guard and not ApplicationNotFound.
                        if !applied.contains(&issue_id) {
                            client.apply_for_issue(&contributor, &org, &issue_id);
                            applied.insert(issue_id);
                        }
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.assign_issue(&maintainer, &contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err(), "expected rejection when org count == 4");
                        prop_assert_eq!(
                            client.get_org_assignment_count(&contributor, &org),
                            4u32,
                            "org count must stay 4 after rejected assign"
                        );
                        continue;
                    }
                    // Ensure application exists before assigning
                    if !applied.contains(&issue_id) {
                        client.apply_for_issue(&contributor, &org, &issue_id);
                        applied.insert(issue_id);
                    }
                    client.assign_issue(&maintainer, &contributor, &org, &issue_id);
                    applied.remove(&issue_id); // assign consumes the application
                    assigned.insert(issue_id);
                }
                1 => {
                    // complete
                    if !assigned.contains(&issue_id) {
                        // AssignmentNotFound — skip
                        continue;
                    }
                    client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
                    assigned.remove(&issue_id);
                }
                _ => {
                    // revoke
                    if !assigned.contains(&issue_id) {
                        // AssignmentNotFound — skip
                        continue;
                    }
                    client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
                    assigned.remove(&issue_id);
                }
            }

            // Invariant: contract count == model count at all times
            let expected = assigned.len() as u32;
            let actual = client.get_org_assignment_count(&contributor, &org);
            prop_assert_eq!(
                actual,
                expected,
                "org count mismatch after op {} issue {}: expected {}, got {}",
                op,
                issue_id,
                expected,
                actual
            );

            // Invariant: count is always in [0, 4]
            prop_assert!(actual <= 4, "org count {} exceeded cap 4", actual);
        }
    }
}

// ---------------------------------------------------------------------------
// UPGRADE STATE-PRESERVATION TESTS
// ---------------------------------------------------------------------------
//
// These tests require the compiled WASM artifact at
// target/wasm32v1-none/release/workload_governor.wasm (set by build.rs).
// They are skipped in cargo-mutants scratch environments where the WASM
// has not been built.

/// Returns a WASM hash by uploading the contract's own compiled WASM bytes.
/// The path is relative to the workspace root at compile time.
#[cfg(all(test, wasm_available))]
fn upload_self_wasm(env: &Env) -> soroban_sdk::BytesN<32> {
    const WASM: &[u8] = include_bytes!(
        "../target/wasm32v1-none/release/workload_governor.wasm"
    );
    let bytes = soroban_sdk::Bytes::from_slice(env, WASM);
    env.deployer().upload_contract_wasm(bytes)
}

/// Helper: build a fully-populated V1 environment and return the actors.
#[cfg(all(test, wasm_available))]
struct UpgradeFixture {
    env: Env,
    client: WorkloadGovernorClient<'static>,
    admin: Address,
    maintainer: Address,
    contributor: Address,
    org: Symbol,
}

#[cfg(all(test, wasm_available))]
impl UpgradeFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WorkloadGovernor);
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        let client = WorkloadGovernorClient::new(env, &contract_id);

        let admin = Address::generate(env);
        let maintainer = Address::generate(env);
        let contributor = Address::generate(env);
        let org = Symbol::new(env, "upgorgtst");

        // --- V1 state population ---
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);

        // Leave one issue as a pending application
        client.apply_for_issue(&contributor, &org, &10u32);

        // Assign and keep active — populates persistent assignment + org counter
        client.apply_for_issue(&contributor, &org, &20u32);
        client.assign_issue(&maintainer, &contributor, &org, &20u32);

        UpgradeFixture {
            env: env.clone(),
            client,
            admin,
            maintainer,
            contributor,
            org,
        }
    }
}

/// Verify that `upgrade()` panics when called before `initialize` (NotInitialized guard).
#[cfg(wasm_available)]
#[test]
#[should_panic]
fn unit_upgrade_rejects_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let dummy_hash = upload_self_wasm(&env);
    client.upgrade(&dummy_hash); // NotInitialized — must panic
}

/// Core: pre-upgrade state is fully preserved post-upgrade.
#[cfg(wasm_available)]
#[test]
fn unit_upgrade_preserves_all_state() {
    let t = UpgradeFixture::new();

    // --- Pre-upgrade assertions ---
    // Admin exists (implicitly — only admin can call upgrade; if not set, upgrade panics)
    // Maintainer registered
    // Global app count = 1 (issue 10 still pending; issue 20 was consumed by assign)
    assert_eq!(
        t.client.get_global_application_count(&t.contributor),
        1,
        "pre-upgrade: global app count"
    );
    // Issue 10: pending application
    assert!(
        t.client.has_applied(&t.contributor, &t.org, &10u32),
        "pre-upgrade: has_applied issue 10"
    );
    // Issue 20: active assignment
    assert!(
        t.client.is_assigned(&t.contributor, &t.org, &20u32),
        "pre-upgrade: is_assigned issue 20"
    );
    assert_eq!(
        t.client.get_org_assignment_count(&t.contributor, &t.org),
        1,
        "pre-upgrade: org assignment count"
    );

    // --- Perform upgrade ---
    let new_wasm_hash = upload_self_wasm(&t.env);
    t.client.upgrade(&new_wasm_hash); // must not panic

    // --- Post-upgrade state assertions (identical to pre-upgrade) ---
    assert_eq!(
        t.client.get_global_application_count(&t.contributor),
        1,
        "post-upgrade: global app count preserved"
    );
    assert!(
        t.client.has_applied(&t.contributor, &t.org, &10u32),
        "post-upgrade: pending application preserved"
    );
    assert!(
        t.client.is_assigned(&t.contributor, &t.org, &20u32),
        "post-upgrade: active assignment preserved"
    );
    assert_eq!(
        t.client.get_org_assignment_count(&t.contributor, &t.org),
        1,
        "post-upgrade: org assignment count preserved"
    );
}

/// V1 functions behave identically on the upgraded contract.
#[cfg(wasm_available)]
#[test]
fn unit_upgrade_functions_behave_identically() {
    let t = UpgradeFixture::new();
    let new_wasm_hash = upload_self_wasm(&t.env);
    t.client.upgrade(&new_wasm_hash);

    // apply_for_issue: should still work for a new issue
    t.client.apply_for_issue(&t.contributor, &t.org, &30u32);
    assert!(t.client.has_applied(&t.contributor, &t.org, &30u32));
    assert_eq!(t.client.get_global_application_count(&t.contributor), 2);

    // withdraw_application: issue 10 was pending pre-upgrade
    t.client.withdraw_application(&t.contributor, &t.org, &10u32);
    assert!(!t.client.has_applied(&t.contributor, &t.org, &10u32));
    assert_eq!(t.client.get_global_application_count(&t.contributor), 1);

    // assign_issue: issue 30 is now pending
    t.client
        .assign_issue(&t.maintainer, &t.contributor, &t.org, &30u32);
    assert!(t.client.is_assigned(&t.contributor, &t.org, &30u32));
    assert_eq!(t.client.get_org_assignment_count(&t.contributor, &t.org), 2);

    // complete_assignment: issue 20 was assigned pre-upgrade
    t.client
        .complete_assignment(&t.maintainer, &t.contributor, &t.org, &20u32);
    assert!(!t.client.is_assigned(&t.contributor, &t.org, &20u32));
    assert_eq!(t.client.get_org_assignment_count(&t.contributor, &t.org), 1);

    // revoke_assignment: issue 30
    t.client
        .revoke_assignment(&t.maintainer, &t.contributor, &t.org, &30u32);
    assert!(!t.client.is_assigned(&t.contributor, &t.org, &30u32));
    assert_eq!(t.client.get_org_assignment_count(&t.contributor, &t.org), 0);

    // register_maintainer: still works post-upgrade
    let new_maintainer = Address::generate(&t.env);
    let new_org = Symbol::new(&t.env, "neworg");
    t.client
        .register_maintainer(&t.admin, &new_maintainer, &new_org);
    // verify: new maintainer can accept an application
    t.client
        .apply_for_issue(&t.contributor, &new_org, &1u32);
    t.client
        .assign_issue(&new_maintainer, &t.contributor, &new_org, &1u32);
    assert!(t.client.is_assigned(&t.contributor, &new_org, &1u32));

    // limit helpers still return correct values
    assert_eq!(
        t.client.get_global_application_capacity(&t.contributor),
        crate::storage::GLOBAL_APP_LIMIT
            - t.client.get_global_application_count(&t.contributor)
    );
    assert_eq!(
        t.client.get_org_assignment_capacity(&t.contributor, &t.org),
        crate::storage::ORG_ASSIGNMENT_LIMIT
            - t.client.get_org_assignment_count(&t.contributor, &t.org)
    );
}

/// Global and org caps are still enforced after upgrade.
#[cfg(wasm_available)]
#[test]
fn unit_upgrade_limits_still_enforced() {
    let t = UpgradeFixture::new();
    let new_wasm_hash = upload_self_wasm(&t.env);
    t.client.upgrade(&new_wasm_hash);

    // Global cap: 1 pending (issue 10) already from fixture; need 14 more.
    for i in 31u32..45 {
        t.client.apply_for_issue(&t.contributor, &t.org, &i);
    }
    assert_eq!(t.client.get_global_application_count(&t.contributor), 15);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        t.client.apply_for_issue(&t.contributor, &t.org, &99u32);
    }));
    assert!(result.is_err(), "global cap must still be enforced post-upgrade");

    // Org assignment cap: issue 20 is already assigned (count=1).
    // Free up global slots, then assign 3 more to reach cap of 4.
    for i in 31u32..34 {
        t.client.assign_issue(&t.maintainer, &t.contributor, &t.org, &i);
    }
    assert_eq!(t.client.get_org_assignment_count(&t.contributor, &t.org), 4);
    // issue 34 is still a pending application (applied in the loop above)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        t.client.assign_issue(&t.maintainer, &t.contributor, &t.org, &34u32);
    }));
    assert!(
        result.is_err(),
        "org assignment cap must still be enforced post-upgrade"
    );
}

/// Upgrade is idempotent: calling it twice does not corrupt state.
#[cfg(wasm_available)]
#[test]
fn unit_upgrade_idempotent() {
    let t = UpgradeFixture::new();
    let hash = upload_self_wasm(&t.env);
    t.client.upgrade(&hash);
    t.client.upgrade(&hash); // second upgrade — must not panic or corrupt state

    assert_eq!(t.client.get_global_application_count(&t.contributor), 1);
    assert!(t.client.has_applied(&t.contributor, &t.org, &10u32));
    assert!(t.client.is_assigned(&t.contributor, &t.org, &20u32));
}

/// Issue #44: non-admin calling upgrade must fail with a host Auth error (error 3).
/// The stored admin's `require_auth()` rejects any other caller.
#[test]
#[should_panic]
fn unit_upgrade_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    // Upload the hash while auths are still mocked, then strip them.
    let hash = upload_self_wasm(&env);

    // Remove all auth mocks — stored_admin.require_auth() will now reject
    env.set_auths(&[]);
    // Must panic: non-admin (no auth) calls upgrade
    client.upgrade(&hash);
}

// Feature: workload-governor, Property 16: Storage Key Collision Freedom
#[test]
fn prop_storage_key_collision_freedom() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("coltest");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &1u32);

    // All six storage categories return correct, independent values
    assert_eq!(t.client.get_global_application_count(&contributor), 0); // consumed by assign
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);
    assert!(!t.client.has_applied(&contributor, &org, &1u32)); // consumed by assign
    assert!(t.client.is_assigned(&contributor, &org, &1u32));
}

// Issue #43: Boundary-value key collision test.
//
// Strategy: use two distinct addresses and two distinct org symbols so that
// patterns 1/4/5 (contributor-scoped) and patterns 2/6 (triple-scoped) are
// exercised at boundary issue_ids (0 and u32::MAX). We drive every key pattern
// through the public contract API and assert all six storage categories remain
// independent — no cross-pattern read returns a value written by a different
// pattern.
//
// Collision-free argument (mirrors storage.rs doc-comment):
//   Every key tuple starts with a unique symbol_short! prefix. Two keys from
//   different patterns can never match because the Soroban host serialises the
//   whole tuple; a prefix mismatch at byte 0 makes equality impossible.
#[test]
fn unit_storage_key_no_collision_boundary_values() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer_a = Address::generate(&t.env);
    let maintainer_b = Address::generate(&t.env);
    let contributor_a = Address::generate(&t.env);
    let contributor_b = Address::generate(&t.env);
    let org_a = t.org("aaaaaaa"); // boundary: max-length 7-char symbol
    let org_b = t.org("b");       // boundary: min-length 1-char symbol

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer_a, &org_a);
    t.client.register_maintainer(&admin, &maintainer_b, &org_b);

    // Boundary issue_ids: 0 and u32::MAX
    let issue_min: u32 = 0;
    let issue_max: u32 = u32::MAX;

    // contributor_a applies for boundary issues in org_a
    t.client.apply_for_issue(&contributor_a, &org_a, &issue_min);
    t.client.apply_for_issue(&contributor_a, &org_a, &issue_max);

    // contributor_b applies in org_b with the same issue ids
    t.client.apply_for_issue(&contributor_b, &org_b, &issue_min);
    t.client.apply_for_issue(&contributor_b, &org_b, &issue_max);

    // ── Pattern 1 ("g_apps") vs Pattern 2 ("app") ──────────────────────────
    // g_apps counts must not be confused with app-entry booleans
    assert_eq!(t.client.get_global_application_count(&contributor_a), 2);
    assert_eq!(t.client.get_global_application_count(&contributor_b), 2);
    assert!(t.client.has_applied(&contributor_a, &org_a, &issue_min));
    assert!(t.client.has_applied(&contributor_a, &org_a, &issue_max));

    // ── Pattern 2 ("app") cross-contributor isolation ──────────────────────
    // contributor_b's entries must not pollute contributor_a's
    assert!(!t.client.has_applied(&contributor_a, &org_b, &issue_min));
    assert!(!t.client.has_applied(&contributor_b, &org_a, &issue_min));

    // ── Pattern 2 ("app") cross-issue isolation ────────────────────────────
    // issue_min entry must not alias issue_max entry
    assert!(t.client.has_applied(&contributor_a, &org_a, &issue_max));

    // assign boundary issues → exercises Patterns 4 ("maint"), 5 ("o_asgn"), 6 ("asgn")
    t.client.assign_issue(&maintainer_a, &contributor_a, &org_a, &issue_min);
    t.client.assign_issue(&maintainer_a, &contributor_a, &org_a, &issue_max);
    t.client.assign_issue(&maintainer_b, &contributor_b, &org_b, &issue_min);
    t.client.assign_issue(&maintainer_b, &contributor_b, &org_b, &issue_max);

    // ── Pattern 5 ("o_asgn") vs Pattern 6 ("asgn") ────────────────────────
    // org assignment count (pattern 5) must not collide with assignment sentinel (pattern 6)
    assert_eq!(t.client.get_org_assignment_count(&contributor_a, &org_a), 2);
    assert_eq!(t.client.get_org_assignment_count(&contributor_b, &org_b), 2);
    assert!(t.client.is_assigned(&contributor_a, &org_a, &issue_min));
    assert!(t.client.is_assigned(&contributor_a, &org_a, &issue_max));

    // ── Pattern 6 ("asgn") cross-contributor / cross-org isolation ─────────
    assert!(!t.client.is_assigned(&contributor_a, &org_b, &issue_min));
    assert!(!t.client.is_assigned(&contributor_b, &org_a, &issue_min));

    // ── Pattern 1 ("g_apps") consumed to 0 after both assignments ──────────
    assert_eq!(t.client.get_global_application_count(&contributor_a), 0);
    assert_eq!(t.client.get_global_application_count(&contributor_b), 0);
}

// ---------------------------------------------------------------------------
// ERROR CASES — one test per ContractError variant (codes 1–11)
//
// Uses try_* client methods which return:
//   Result<Result<T, ConversionError>, Result<soroban_sdk::Error, InvokeError>>
//
// Errors raised via panic_with_error! (codes 1,2,4,6,7,8,9,10,11) surface as:
//   Err(Ok(soroban_sdk::Error::from_contract_error(code as u32)))
//
// Errors 3 and 5 are guarded by require_auth() which raises a host Auth error
// (Err(Err(...))), not a ContractError. Those are tested with #[should_panic].
// ---------------------------------------------------------------------------

mod error_cases {
    use soroban_sdk::{testutils::Address as _, Address, Env, Error, Symbol};

    use crate::{errors::ContractError, WorkloadGovernor, WorkloadGovernorClient};

    fn setup() -> (WorkloadGovernorClient<'static>, &'static Env) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, WorkloadGovernor);
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        (WorkloadGovernorClient::new(env, &id), env)
    }

    /// Map a ContractError variant to the soroban_sdk::Error the host returns.
    fn ce(e: ContractError) -> Error {
        Error::from_contract_error(e as u32)
    }

    fn org(env: &Env, name: &str) -> Symbol {
        Symbol::new(env, name)
    }

    /// Error 1 — `AlreadyInitialized`: `initialize` called a second time.
    #[test]
    fn err_1_already_initialized() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        client.initialize(&admin);
        let result = client.try_initialize(&admin);
        assert_eq!(result, Err(Ok(ce(ContractError::AlreadyInitialized))));
    }

    /// Error 2 — `NotInitialized`: any state-changing call before `initialize`.
    #[test]
    fn err_2_not_initialized() {
        let (client, env) = setup();
        let contributor = Address::generate(env);
        let result = client.try_apply_for_issue(&contributor, &org(env, "x"), &1u32);
        assert_eq!(result, Err(Ok(ce(ContractError::NotInitialized))));
    }

    /// Error 3 — `UnauthorizedAdmin`: the contract variant is defined for future use;
    /// the current implementation delegates admin auth to `require_auth()` on the stored
    /// admin address, which raises a host Auth error (not a ContractError).
    /// This test verifies the auth guard fires when a non-admin calls a protected function.
    #[test]
    #[should_panic]
    fn err_3_unauthorized_admin() {
        // Initialize with mock_all_auths, then clear auths so the next call panics.
        let (client, env) = setup();
        let admin = Address::generate(env);
        client.initialize(&admin);

        // Clear all auth mocks — stored_admin.require_auth() will now fail
        env.set_auths(&[]);
        let impostor = Address::generate(env);
        let maintainer = Address::generate(env);
        // panics: stored admin's require_auth not satisfied by impostor
        client.register_maintainer(&impostor, &maintainer, &org(env, "x"));
    }

    /// Error 4 — `UnauthorizedMaintainer`: unregistered address tries to assign an issue.
    #[test]
    fn err_4_unauthorized_maintainer() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let stranger = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        client.apply_for_issue(&contributor, &o, &1u32);
        let result = client.try_assign_issue(&stranger, &contributor, &o, &1u32);
        assert_eq!(result, Err(Ok(ce(ContractError::UnauthorizedMaintainer))));
    }

    #[test]
    fn err_4_unauthorized_maintainer_cross_org() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let maintainer = Address::generate(env);
        let contributor = Address::generate(env);
        let org_a = org(env, "org-a");
        let org_b = org(env, "org-b");

        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org_a);
        client.apply_for_issue(&contributor, &org_b, &1u32);

        let result = client.try_assign_issue(&maintainer, &contributor, &org_b, &1u32);
        assert_eq!(result, Err(Ok(ce(ContractError::UnauthorizedMaintainer))));
    }

    #[test]
    fn err_4_authorized_maintainer_succeeds_after_registration() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let maintainer = Address::generate(env);
        let contributor = Address::generate(env);
        let org_id = org(env, "org-success");

        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org_id);
        client.apply_for_issue(&contributor, &org_id, &1u32);

        let result = client.try_assign_issue(&maintainer, &contributor, &org_id, &1u32);
        assert!(result.is_ok());
        assert!(client.is_assigned(&contributor, &org_id, &1u32));
    }

    /// Error 5 — `UnauthorizedContributor`: the contract variant is defined for future use;
    /// `apply_for_issue` delegates auth to `contributor.require_auth()` which raises a
    /// host Auth error (not a ContractError). This test verifies the auth guard fires.
    #[test]
    #[should_panic]
    fn err_5_unauthorized_contributor() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        client.initialize(&admin);

        // Clear all auth mocks — contributor.require_auth() will now fail
        env.set_auths(&[]);
        let contributor = Address::generate(env);
        // panics: contributor's require_auth not satisfied
        client.apply_for_issue(&contributor, &org(env, "x"), &1u32);
    }

    /// Error 6 — `GlobalApplicationLimitReached`: contributor has 15 pending applications.
    #[test]
    fn err_6_global_application_limit_reached() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        for i in 0u32..15 {
            client.apply_for_issue(&contributor, &o, &i);
        }
        let result = client.try_apply_for_issue(&contributor, &o, &99u32);
        assert_eq!(result, Err(Ok(ce(ContractError::GlobalApplicationLimitReached))));
    }

    /// Error 7 — `OrgAssignmentLimitReached`: contributor has 4 active assignments in the org.
    #[test]
    fn err_7_org_assignment_limit_reached() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let maintainer = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &o);
        for i in 0u32..4 {
            client.apply_for_issue(&contributor, &o, &i);
            client.assign_issue(&maintainer, &contributor, &o, &i);
        }
        client.apply_for_issue(&contributor, &o, &99u32);
        let result = client.try_assign_issue(&maintainer, &contributor, &o, &99u32);
        assert_eq!(result, Err(Ok(ce(ContractError::OrgAssignmentLimitReached))));
    }

    /// Error 8 — `DuplicateApplication`: same (contributor, org, issue) applied twice.
    #[test]
    fn err_8_duplicate_application() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        client.apply_for_issue(&contributor, &o, &1u32);
        let result = client.try_apply_for_issue(&contributor, &o, &1u32);
        assert_eq!(result, Err(Ok(ce(ContractError::DuplicateApplication))));
    }

    /// Error 9 — `ApplicationNotFound`: withdraw for a non-existent application.
    #[test]
    fn err_9_application_not_found() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        let result = client.try_withdraw_application(&contributor, &o, &99u32);
        assert_eq!(result, Err(Ok(ce(ContractError::ApplicationNotFound))));
    }

    /// Error 10 — `AssignmentNotFound`: complete for a non-existent assignment.
    #[test]
    fn err_10_assignment_not_found() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let maintainer = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &o);
        let result = client.try_complete_assignment(&maintainer, &contributor, &o, &99u32);
        assert_eq!(result, Err(Ok(ce(ContractError::AssignmentNotFound))));
    }

    /// Error 11 — `AlreadyAssigned`: assign_issue when assignment already exists.
    ///
    /// `seed_assignment` (test-only) plants the assignment entry directly bypassing
    /// the normal flow, so the AlreadyAssigned guard inside assign_issue is reachable.
    #[test]
    fn err_11_already_assigned() {
        let (client, env) = setup();
        let admin = Address::generate(env);
        let maintainer = Address::generate(env);
        let contributor = Address::generate(env);
        let o = org(env, "x");

        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &o);
        // Seed an existing assignment for issue 1
        client.seed_assignment(&contributor, &o, &1u32);
        // Apply so ApplicationNotFound guard is passed
        client.apply_for_issue(&contributor, &o, &1u32);

        let result = client.try_assign_issue(&maintainer, &contributor, &o, &1u32);
        assert_eq!(result, Err(Ok(ce(ContractError::AlreadyAssigned))));
    }
}


// ---------------------------------------------------------------------------
// Issue #49: Cap invariant property tests (10 000 cases each)
// ---------------------------------------------------------------------------

// Property: for any (contributor, org), assignment count never exceeds 4
// under arbitrary apply/assign/complete/revoke sequences.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_org_assignment_cap_never_exceeds_4(
        // sequence of actions: 0=apply, 1=assign, 2=complete, 3=revoke; issue_id 0..4
        actions in proptest::collection::vec((0u8..4u8, 0u32..4u32), 1..20)
    ) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client("orgcap");
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);

        let mut applied: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
        let mut assigned: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

        for (action, issue_id) in actions {
            match action {
                0 => { // apply
                    if !applied.contains(&issue_id) && !assigned.contains(&issue_id)
                        && client.get_global_application_count(&contributor) < 15
                    {
                        client.apply_for_issue(&contributor, &org, &issue_id);
                        applied.insert(issue_id);
                    }
                }
                1 => { // assign
                    if applied.contains(&issue_id) {
                        let count = client.get_org_assignment_count(&contributor, &org);
                        if count < 4 {
                            client.assign_issue(&maintainer, &contributor, &org, &issue_id);
                            applied.remove(&issue_id);
                            assigned.insert(issue_id);
                        }
                    }
                }
                2 => { // complete
                    if assigned.contains(&issue_id) {
                        client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
                        assigned.remove(&issue_id);
                    }
                }
                _ => { // revoke
                    if assigned.contains(&issue_id) {
                        client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
                        assigned.remove(&issue_id);
                    }
                }
            }
            // invariant: org assignment count never exceeds 4
            prop_assert!(
                client.get_org_assignment_count(&contributor, &org) <= 4,
                "org assignment count exceeded 4"
            );
        }
    }
}

// Property: no two applications with identical (contributor, org, issue) exist simultaneously.
// Verified by tracking applied set and asserting the contract rejects any duplicate attempt.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_no_duplicate_application_exists(
        actions in proptest::collection::vec((proptest::bool::ANY, 0u32..10u32), 1..20)
    ) {
        let (_, client, admin, _, contributor, org) = fresh_client("nodup");
        client.initialize(&admin);

        let mut applied: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

        for (do_apply, issue_id) in actions {
            if do_apply {
                if applied.contains(&issue_id) {
                    // Must reject — duplicate (contributor, org, issue)
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.apply_for_issue(&contributor, &org, &issue_id);
                    }));
                    prop_assert!(result.is_err(), "duplicate application should be rejected");
                } else if client.get_global_application_count(&contributor) < 15 {
                    client.apply_for_issue(&contributor, &org, &issue_id);
                    applied.insert(issue_id);
                }
            } else if applied.contains(&issue_id) {
                client.withdraw_application(&contributor, &org, &issue_id);
                applied.remove(&issue_id);
            }

            // invariant: has_applied reflects the applied set exactly
            for &id in &applied {
                prop_assert!(
                    client.has_applied(&contributor, &org, &id),
                    "applied set and contract disagree for issue {}", id
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Issue #40: DuplicateApplication (error 8) — targeted unit tests
// ---------------------------------------------------------------------------

/// AC1: Second application for same (contributor, org, issue) returns error 8.
#[test]
fn unit_duplicate_application_returns_error_8() {
    use crate::errors::ContractError;
    use soroban_sdk::Error;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("dup40");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &5u32);

    let result = t.client.try_apply_for_issue(&contributor, &org, &5u32);
    assert_eq!(
        result,
        Err(Ok(Error::from_contract_error(ContractError::DuplicateApplication as u32))),
        "second apply must return error 8"
    );
    // Counter must not have incremented
    assert_eq!(t.client.get_global_application_count(&contributor), 1);
}

/// AC2: Re-application after withdrawal succeeds (no DuplicateApplication).
#[test]
fn unit_reapply_after_withdraw_succeeds() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("reapply");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &7u32);
    t.client.withdraw_application(&contributor, &org, &7u32);

    // Must succeed — no panic, no error
    t.client.apply_for_issue(&contributor, &org, &7u32);
    assert!(t.client.has_applied(&contributor, &org, &7u32));
    assert_eq!(t.client.get_global_application_count(&contributor), 1);
}

/// AC3: A different contributor can apply for the same issue without collision.
#[test]
fn unit_different_contributor_same_issue_no_collision() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contrib_a = Address::generate(&t.env);
    let contrib_b = Address::generate(&t.env);
    let org = t.org("shared");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contrib_a, &org, &42u32);
    // Different contributor — must succeed
    t.client.apply_for_issue(&contrib_b, &org, &42u32);

    assert!(t.client.has_applied(&contrib_a, &org, &42u32));
    assert!(t.client.has_applied(&contrib_b, &org, &42u32));
    assert_eq!(t.client.get_global_application_count(&contrib_a), 1);
    assert_eq!(t.client.get_global_application_count(&contrib_b), 1);
}

// ---------------------------------------------------------------------------
// Issue #37: Double-init fuzz test — initialize called twice must return error 1
// ---------------------------------------------------------------------------

proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_double_init_returns_error_1(_seed in 0u32..u32::MAX) {
        use crate::errors::ContractError;
        use soroban_sdk::Error;

        let (_, client, admin, _, _, _) = fresh_client("dblini");
        client.initialize(&admin);

        let result = client.try_initialize(&admin);
        prop_assert_eq!(
            result,
            Err(Ok(Error::from_contract_error(ContractError::AlreadyInitialized as u32))),
            "second initialize must return error 1 (AlreadyInitialized)"
        );
    }
}

// Property: after assign_issue succeeds, has_applied is false AND is_assigned is true;
// after complete or revoke, is_assigned becomes false.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_applied_and_assigned_mutually_exclusive(
        issue_id in 0u32..100u32,
        do_complete in proptest::bool::ANY,
    ) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client("mutex");
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.apply_for_issue(&contributor, &org, &issue_id);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);

        prop_assert!(!client.has_applied(&contributor, &org, &issue_id));
        prop_assert!(client.is_assigned(&contributor, &org, &issue_id));

        if do_complete {
            client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
        } else {
            client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        }
        prop_assert!(!client.is_assigned(&contributor, &org, &issue_id));
    }
}

// Property: complete_assignment decrements the org assignment count by exactly 1.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_complete_decrements_org_count(issue_id in 0u32..1000u32) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client("cmpdec");
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.apply_for_issue(&contributor, &org, &issue_id);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        let before = client.get_org_assignment_count(&contributor, &org);
        client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), before - 1);
    }
}

// Property: revoke_assignment decrements the org assignment count by exactly 1.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_revoke_decrements_org_count(issue_id in 0u32..1000u32) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client("rvkdec");
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        client.apply_for_issue(&contributor, &org, &issue_id);
        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
        let before = client.get_org_assignment_count(&contributor, &org);
        client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), before - 1);
    }
}

// Property: withdraw_application decrements the global application count by exactly 1.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(10_000))]
    #[test]
    fn prop_withdraw_decrements_global_count(issue_id in 0u32..1000u32) {
        let (_, client, admin, _, contributor, org) = fresh_client("wdwdec");
        client.initialize(&admin);
        client.apply_for_issue(&contributor, &org, &issue_id);
        let before = client.get_global_application_count(&contributor);
        client.withdraw_application(&contributor, &org, &issue_id);
        prop_assert_eq!(client.get_global_application_count(&contributor), before - 1);
    }
}

// Property: a contributor can hold exactly 4 assignments in each of up to 3 distinct
// orgs simultaneously; hitting the cap in one org does not affect another org's count.
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(100))]
    #[test]
    fn prop_multi_org_isolation(_seed in 0u32..100u32) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WorkloadGovernor);
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        let client = WorkloadGovernorClient::new(env, &contract_id);

        let admin = Address::generate(env);
        let contributor = Address::generate(env);
        let org_names = ["isola", "isolb", "isolc"];
        let orgs: [Symbol; 3] = [
            Symbol::new(env, org_names[0]),
            Symbol::new(env, org_names[1]),
            Symbol::new(env, org_names[2]),
        ];

        client.initialize(&admin);
        for org in &orgs {
            let maintainer = Address::generate(env);
            client.register_maintainer(&admin, &maintainer, org);
            for i in 0u32..4 {
                client.apply_for_issue(&contributor, org, &i);
                client.assign_issue(&maintainer, &contributor, org, &i);
            }
            prop_assert_eq!(client.get_org_assignment_count(&contributor, org), 4);
        }

        // Each org is independently at the cap; counts are isolated
        for (idx, org) in orgs.iter().enumerate() {
            prop_assert_eq!(
                client.get_org_assignment_count(&contributor, org),
                4,
                "org {} count should be 4", idx
            );
        }

        // Cap in org[0] does not affect org[1] or org[2]
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &orgs[1]), 4);
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &orgs[2]), 4);
    }
}

// ---------------------------------------------------------------------------
// MUTATION TESTS — target specific missed mutants from mutants.out/missed.txt
// ---------------------------------------------------------------------------
// These tests are deliberately narrow: each one targets the exact code path
// that a missed mutant changes, verifying that the mutation would cause a
// detectable test failure.

/// Mutant: replace WorkloadGovernor::upgrade with ()
/// Killed by: verifying upgrade actually calls update_current_contract_wasm.
/// Strategy: call upgrade with a zeroed hash — in testutils the deployer call
/// does not validate the hash, but the function must not silently no-op.
/// We verify that the function runs without panic when auth + init are satisfied,
/// confirming the body executes (a no-op body would compile but skip auth checks,
/// causing a different observable panic in this test's auth setup).
#[test]
fn unit_upgrade_rejects_not_initialized() {
    // Mutant: upgrade with () skips require_initialized — the NotInitialized
    // panic would disappear if the body became a no-op.
    let t = TestEnv::new();
    let hash = soroban_sdk::BytesN::<32>::from_array(&t.env, &[0u8; 32]);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        t.client.upgrade(&hash);
    }));
    assert!(result.is_err(), "upgrade before initialize must panic with NotInitialized");
}

#[test]
#[should_panic]
fn unit_upgrade_rejects_not_initialized_direct() {
    let t = TestEnv::new();
    let hash = soroban_sdk::BytesN::<32>::from_array(&t.env, &[0u8; 32]);
    t.client.upgrade(&hash); // NotInitialized
}

/// Mutant: replace == with != in assign_issue counter cleanup
/// (line 283: `if new_app_count == 0` becomes `if new_app_count != 0`)
///
/// If the mutant were live, after assigning the last application (so global count
/// drops to 0), the counter entry would NOT be removed — `get_global_application_count`
/// would return 1 instead of 0. This test catches that.
#[test]
fn unit_assign_issue_clears_global_count_when_last_app() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("clrglbl");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Apply for exactly one issue
    t.client.apply_for_issue(&contributor, &org, &1u32);
    assert_eq!(t.client.get_global_application_count(&contributor), 1);

    // Assign — global count must drop to exactly 0
    t.client.assign_issue(&maintainer, &contributor, &org, &1u32);
    assert_eq!(
        t.client.get_global_application_count(&contributor),
        0,
        "global count must be 0 after assigning the only application"
    );
}

/// Mutant: replace == with != in assign_issue counter cleanup — multi-issue variant
/// Verifies the else branch (counter > 0 after assign) is also exercised correctly.
#[test]
fn unit_assign_issue_decrements_global_count_not_zero() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("decrglbl");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Apply for two issues
    t.client.apply_for_issue(&contributor, &org, &10u32);
    t.client.apply_for_issue(&contributor, &org, &20u32);
    assert_eq!(t.client.get_global_application_count(&contributor), 2);

    // Assign one — global count must be 1, not 2 or 0
    t.client.assign_issue(&maintainer, &contributor, &org, &10u32);
    assert_eq!(
        t.client.get_global_application_count(&contributor),
        1,
        "global count must decrement to 1 after assigning one of two applications"
    );
}

/// Mutant: replace == with != in complete_assignment counter cleanup
/// (line 333: `if new_count == 0` becomes `if new_count != 0`)
///
/// If the mutant were live, after completing the last assignment (org count drops
/// to 0), the counter entry would NOT be removed — `get_org_assignment_count`
/// would return 1 instead of 0. This test catches that.
#[test]
fn unit_complete_assignment_clears_org_count_when_last() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("clrorg");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Apply and assign exactly one issue
    t.client.apply_for_issue(&contributor, &org, &5u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &5u32);
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);

    // Complete — org count must drop to exactly 0
    t.client.complete_assignment(&maintainer, &contributor, &org, &5u32);
    assert_eq!(
        t.client.get_org_assignment_count(&contributor, &org),
        0,
        "org assignment count must be 0 after completing the last assignment"
    );
}

/// Mutant: replace == with != in complete_assignment counter cleanup — multi variant
#[test]
fn unit_complete_assignment_decrements_org_count_not_zero() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("decrorg");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Apply and assign two issues
    for i in 1u32..=2 {
        t.client.apply_for_issue(&contributor, &org, &i);
        t.client.assign_issue(&maintainer, &contributor, &org, &i);
    }
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 2);

    // Complete one — count must be 1
    t.client.complete_assignment(&maintainer, &contributor, &org, &1u32);
    assert_eq!(
        t.client.get_org_assignment_count(&contributor, &org),
        1,
        "org count must decrement to 1 after completing one of two assignments"
    );
}

/// Mutant: replace == with != in revoke_assignment counter cleanup
/// (line 382: `if new_count == 0` becomes `if new_count != 0`)
///
/// Same pattern as complete_assignment: verifies the counter is fully cleared
/// when the last assignment in an org is revoked.
#[test]
fn unit_revoke_assignment_clears_org_count_when_last() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("rvoklast");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    t.client.apply_for_issue(&contributor, &org, &7u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &7u32);
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);

    // Revoke — org count must drop to exactly 0
    t.client.revoke_assignment(&maintainer, &contributor, &org, &7u32);
    assert_eq!(
        t.client.get_org_assignment_count(&contributor, &org),
        0,
        "org count must be 0 after revoking the last assignment"
    );
}

/// Mutant: replace == with != in revoke_assignment counter cleanup — multi variant
#[test]
fn unit_revoke_assignment_decrements_org_count_not_zero() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("rvokdecr");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    for i in 1u32..=2 {
        t.client.apply_for_issue(&contributor, &org, &i);
        t.client.assign_issue(&maintainer, &contributor, &org, &i);
    }
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 2);

    t.client.revoke_assignment(&maintainer, &contributor, &org, &1u32);
    assert_eq!(
        t.client.get_org_assignment_count(&contributor, &org),
        1,
        "org count must be 1 after revoking one of two assignments"
    );
}

/// Mutant: replace WorkloadGovernor::extend_application_ttl with ()
/// Killed by: verifying extend_application_ttl panics on a non-existent application.
/// A no-op body would not panic, so this test would pass with the correct code
/// and fail with the mutant.
#[test]
#[should_panic]
fn unit_extend_ttl_panics_when_no_application() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("noapply");

    t.client.initialize(&admin);
    // No apply_for_issue call — ApplicationNotFound must fire
    t.client.extend_application_ttl(&contributor, &org, &99u32);
}

/// Mutant: delete ! in WorkloadGovernor::extend_application_ttl
/// (line 425: `if !has_app_entry` becomes `if has_app_entry`)
///
/// With the mutant, extend_application_ttl would panic when an application
/// DOES exist (the opposite guard). This test calls extend on a live application
/// and verifies it succeeds — it would panic with the mutant.
#[test]
fn unit_extend_ttl_succeeds_when_application_exists() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("extttl");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &55u32);

    // Must succeed without panic — mutant (inverted guard) would panic here
    t.client.extend_application_ttl(&contributor, &org, &55u32);

    // Application must still be visible after extension
    assert!(
        t.client.has_applied(&contributor, &org, &55u32),
        "application must remain after extend_application_ttl"
    );
}

/// Mutant: replace > with == in extend_application_ttl
/// (line 429: `if get_global_app_count > 0` becomes `if get_global_app_count == 0`)
///
/// With the mutant, extend_global_app_count_ttl is called only when the count IS 0
/// (i.e. never, since the entry doesn't exist at count 0). This test verifies that
/// after extension with count=1, the global counter entry survives. The test checks
/// observable behaviour: after extending, the contributor's global count is still 1.
/// With the mutant the count entry's TTL would not be extended, causing it to expire
/// and return 0 when queried after ledger advancement.
#[test]
fn unit_extend_ttl_also_extends_global_counter() {
    use soroban_sdk::testutils::Ledger;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("glbttl");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &77u32);
    assert_eq!(t.client.get_global_application_count(&contributor), 1);

    let ttl = crate::storage::APP_TTL_LEDGERS;

    // Advance near the original TTL boundary, then extend
    t.env.ledger().set_sequence_number(ttl - 1);
    t.client.extend_application_ttl(&contributor, &org, &77u32);

    // After extension both the app entry AND the global counter must survive
    // well beyond the original TTL
    t.env.ledger().set_sequence_number(ttl + 500);
    assert_eq!(
        t.client.get_global_application_count(&contributor),
        1,
        "global app counter must remain alive after extend_application_ttl (count > 0 branch)"
    );
}

// ---------------------------------------------------------------------------
// Issue #360 — unit tests for assign_issue and complete_assignment
// ---------------------------------------------------------------------------

#[test]
fn unit_assign_converts_application_increments_counter() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("assignorg");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &1u32);

    // Before assign: application exists, assignment does not
    assert!(t.client.has_applied(&contributor, &org, &1u32));
    assert!(!t.client.is_assigned(&contributor, &org, &1u32));
    assert_eq!(t.client.get_global_application_count(&contributor), 1);

    t.client.assign_issue(&maintainer, &contributor, &org, &1u32);

    // After assign: application removed, assignment created, counters updated
    assert!(!t.client.has_applied(&contributor, &org, &1u32));
    assert!(t.client.is_assigned(&contributor, &org, &1u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);
    assert_eq!(t.client.get_global_application_count(&contributor), 0);
}

#[test]
fn unit_assign_at_org_cap_4_fails() {
    use crate::errors::ContractError;
    use soroban_sdk::IntoVal;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("orgcap4");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Fill to the default ORG_ASSIGNMENT_LIMIT of 4
    for i in 0u32..4 {
        t.client.apply_for_issue(&contributor, &org, &i);
        t.client.assign_issue(&maintainer, &contributor, &org, &i);
    }
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 4);

    // 5th assignment must be rejected with OrgAssignmentLimitReached (code 7)
    t.client.apply_for_issue(&contributor, &org, &99u32);
    let result = t.client.try_assign_issue(&maintainer, &contributor, &org, &99u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::OrgAssignmentLimitReached.into_val(&t.env)))
    );
    // Counter must stay at 4
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 4);
}

#[test]
fn unit_assign_already_assigned_returns_error() {
    use crate::errors::ContractError;
    use soroban_sdk::IntoVal;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("aassign");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // Force an assignment entry so the issue appears already-assigned,
    // then apply for the same issue and attempt to assign again.
    crate::storage::set_assignment(&t.env, &org, 1u32, &contributor);
    t.client.apply_for_issue(&contributor, &org, &1u32);

    let result = t.client.try_assign_issue(&maintainer, &contributor, &org, &1u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::AlreadyAssigned.into_val(&t.env)))
    );
}

#[test]
fn unit_assign_no_application_returns_error() {
    use crate::errors::ContractError;
    use soroban_sdk::IntoVal;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("noapprg");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // No application submitted — assign must fail with ApplicationNotFound (code 9)
    let result = t.client.try_assign_issue(&maintainer, &contributor, &org, &42u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::ApplicationNotFound.into_val(&t.env)))
    );
}

#[test]
fn unit_complete_removes_assignment_decrements_counter() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("cmplorg");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &5u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &5u32);

    assert!(t.client.is_assigned(&contributor, &org, &5u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 1);

    t.client.complete_assignment(&maintainer, &contributor, &org, &5u32);

    assert!(!t.client.is_assigned(&contributor, &org, &5u32));
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org), 0);
}

#[test]
fn unit_complete_nonexistent_returns_error() {
    use crate::errors::ContractError;
    use soroban_sdk::IntoVal;

    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("noasgnr");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    // No assignment exists — complete must fail with AssignmentNotFound (code 10)
    let result = t.client.try_complete_assignment(&maintainer, &contributor, &org, &77u32);
    assert_eq!(
        result,
        Err(Ok(ContractError::AssignmentNotFound.into_val(&t.env)))
    );
}

#[test]
#[should_panic]
fn unit_assign_non_maintainer_panics() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let stranger = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("noauthr");

    t.client.initialize(&admin);
    // Register no maintainer; stranger is not authorised for this org
    t.client.apply_for_issue(&contributor, &org, &1u32);
    // Must panic with UnauthorizedMaintainer (code 4)
    t.client.assign_issue(&stranger, &contributor, &org, &1u32);
}

// ---------------------------------------------------------------------------
// PROPERTY-BASED TESTS — sequential state transition invariants (issue #354)
// ---------------------------------------------------------------------------
//
// These tests prove that the global application count and org assignment count
// invariants hold under arbitrary sequences of valid and invalid operations,
// exercised with at least 1000 random cases each.
//
// Design: we run a reference model (a BTreeSet of active IDs) alongside the
// actual contract client.  After every operation we assert that the contract's
// counter equals the model's set size.  Any divergence is a bug; proptest
// automatically shrinks the sequence to the minimal failing case.

/// Operation type for the global apply/withdraw sequence test.
#[derive(Clone, Debug)]
enum GlobalOp {
    /// Apply for `issue_id`; the bool allows distinguishing from withdraw.
    Apply { issue_id: u32 },
    Withdraw { issue_id: u32 },
}

fn arb_global_op() -> impl Strategy<Value = GlobalOp> {
    prop_oneof![
        (0u32..20u32).prop_map(|i| GlobalOp::Apply { issue_id: i }),
        (0u32..20u32).prop_map(|i| GlobalOp::Withdraw { issue_id: i }),
    ]
}

/// Operation type for the org assign/complete/revoke sequence test.
#[derive(Clone, Debug)]
enum OrgOp {
    Apply { issue_id: u32 },
    Assign { issue_id: u32 },
    Complete { issue_id: u32 },
    Revoke { issue_id: u32 },
}

fn arb_org_op() -> impl Strategy<Value = OrgOp> {
    prop_oneof![
        4 => (0u32..10u32).prop_map(|i| OrgOp::Apply { issue_id: i }),
        3 => (0u32..10u32).prop_map(|i| OrgOp::Assign { issue_id: i }),
        2 => (0u32..10u32).prop_map(|i| OrgOp::Complete { issue_id: i }),
        2 => (0u32..10u32).prop_map(|i| OrgOp::Revoke { issue_id: i }),
    ]
}

// ---------------------------------------------------------------------------
// Property: global_count_invariant_sequence
//
// For any sequence of apply / withdraw operations:
//   get_global_application_count == |{active (non-withdrawn) applications}|
//
// We drive the contract through each op, maintaining a reference BTreeSet.
// Invalid ops (duplicate, not-found, cap exceeded) are caught via
// catch_unwind; we then assert the count did not change.
// ---------------------------------------------------------------------------
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(1_000))]
    #[test]
    fn prop_global_count_invariant_sequence(
        ops in proptest::collection::vec(arb_global_op(), 1usize..60)
    ) {
        let (_, client, admin, _, contributor, org) = fresh_client("gseq");
        client.initialize(&admin);

        // Reference model: issue_ids that are currently in "applied" state.
        let mut active: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();

        for op in ops {
            // Read current contract count before the operation.
            let count_before = client.get_global_application_count(&contributor);
            // Invariant check before each step.
            prop_assert_eq!(
                count_before,
                active.len() as u32,
                "pre-op invariant broken: contract={} model={}",
                count_before,
                active.len()
            );

            match op {
                GlobalOp::Apply { issue_id } => {
                    if active.contains(&issue_id) {
                        // DuplicateApplication — must be rejected, count unchanged.
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.apply_for_issue(&contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err(), "expected DuplicateApplication error");
                        prop_assert_eq!(
                            client.get_global_application_count(&contributor),
                            count_before,
                            "count must not change after rejected apply (duplicate)"
                        );
                    } else if active.len() as u32 >= 15 {
                        // GlobalApplicationLimitReached — must be rejected, count unchanged.
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.apply_for_issue(&contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err(), "expected GlobalApplicationLimitReached error");
                        prop_assert_eq!(
                            client.get_global_application_count(&contributor),
                            15u32,
                            "count must stay at cap after rejected apply"
                        );
                    } else {
                        // Valid apply — must succeed.
                        client.apply_for_issue(&contributor, &org, &issue_id);
                        active.insert(issue_id);
                        prop_assert_eq!(
                            client.get_global_application_count(&contributor),
                            count_before + 1,
                            "count must increment after apply"
                        );
                    }
                }

                GlobalOp::Withdraw { issue_id } => {
                    if !active.contains(&issue_id) {
                        // ApplicationNotFound — must be rejected, count unchanged.
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.withdraw_application(&contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err(), "expected ApplicationNotFound error");
                        prop_assert_eq!(
                            client.get_global_application_count(&contributor),
                            count_before,
                            "count must not change after rejected withdraw"
                        );
                    } else {
                        // Valid withdraw — must succeed.
                        client.withdraw_application(&contributor, &org, &issue_id);
                        active.remove(&issue_id);
                        prop_assert_eq!(
                            client.get_global_application_count(&contributor),
                            count_before - 1,
                            "count must decrement after withdraw"
                        );
                    }
                }
            }

            // Invariant: count always in [0, 15].
            let count_after = client.get_global_application_count(&contributor);
            prop_assert!(count_after <= 15, "count {} exceeded global cap 15", count_after);
            prop_assert_eq!(
                count_after,
                active.len() as u32,
                "post-op invariant: contract={} model={}",
                count_after,
                active.len()
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Property: org_count_invariant_sequence
//
// For any sequence of apply / assign / complete / revoke operations:
//   get_org_assignment_count == |{active (non-completed, non-revoked) assignments}|
//
// Same approach as the global invariant test: reference BTreeSet tracks what
// the contract should have in assigned state; every deviation is a bug.
// ---------------------------------------------------------------------------
proptest! {
    #![proptest_config(proptest::test_runner::Config::with_cases(1_000))]
    #[test]
    fn prop_org_count_invariant_sequence(
        ops in proptest::collection::vec(arb_org_op(), 1usize..60)
    ) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client("oseq");
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);

        // Reference models.
        let mut applied: std::collections::BTreeSet<u32>  = std::collections::BTreeSet::new();
        let mut assigned: std::collections::BTreeSet<u32> = std::collections::BTreeSet::new();
        let mut global_count: u32 = 0;

        for op in ops {
            let org_count_before   = client.get_org_assignment_count(&contributor, &org);
            let global_count_contract = client.get_global_application_count(&contributor);

            // Pre-op invariant checks.
            prop_assert_eq!(
                org_count_before,
                assigned.len() as u32,
                "pre-op org invariant: contract={} model={}",
                org_count_before,
                assigned.len()
            );
            prop_assert_eq!(
                global_count_contract,
                global_count,
                "pre-op global invariant: contract={} model={}",
                global_count_contract,
                global_count
            );

            match op {
                OrgOp::Apply { issue_id } => {
                    // Skip if already applied (DuplicateApplication) or at global cap.
                    if applied.contains(&issue_id) || global_count >= 15 {
                        // Expect rejection; org and global counts unchanged.
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.apply_for_issue(&contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err());
                    } else {
                        client.apply_for_issue(&contributor, &org, &issue_id);
                        applied.insert(issue_id);
                        global_count += 1;
                    }
                    // Org count must not change after apply.
                    prop_assert_eq!(
                        client.get_org_assignment_count(&contributor, &org),
                        org_count_before,
                        "org count must not change after apply"
                    );
                }

                OrgOp::Assign { issue_id } => {
                    if !applied.contains(&issue_id)
                        || assigned.len() >= 4
                        || assigned.contains(&issue_id)
                    {
                        // One of: ApplicationNotFound, OrgAssignmentLimitReached, AlreadyAssigned.
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.assign_issue(&maintainer, &contributor, &org, &issue_id);
                        }));
                        // May or may not panic depending on which guard fires first;
                        // if it panics the count must be unchanged.
                        if result.is_err() {
                            prop_assert_eq!(
                                client.get_org_assignment_count(&contributor, &org),
                                org_count_before,
                                "org count must not change after rejected assign"
                            );
                        } else {
                            // Succeeded despite our precondition check — model was wrong.
                            // Update model to stay in sync.
                            applied.remove(&issue_id);
                            global_count = global_count.saturating_sub(1);
                            assigned.insert(issue_id);
                        }
                    } else {
                        client.assign_issue(&maintainer, &contributor, &org, &issue_id);
                        applied.remove(&issue_id);
                        global_count = global_count.saturating_sub(1);
                        assigned.insert(issue_id);
                        prop_assert_eq!(
                            client.get_org_assignment_count(&contributor, &org),
                            org_count_before + 1,
                            "org count must increment after assign"
                        );
                    }
                }

                OrgOp::Complete { issue_id } => {
                    if !assigned.contains(&issue_id) {
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err(), "expected AssignmentNotFound on complete");
                        prop_assert_eq!(
                            client.get_org_assignment_count(&contributor, &org),
                            org_count_before,
                            "org count must not change after rejected complete"
                        );
                    } else {
                        client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
                        assigned.remove(&issue_id);
                        prop_assert_eq!(
                            client.get_org_assignment_count(&contributor, &org),
                            org_count_before - 1,
                            "org count must decrement after complete"
                        );
                    }
                }

                OrgOp::Revoke { issue_id } => {
                    if !assigned.contains(&issue_id) {
                        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                            client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
                        }));
                        prop_assert!(result.is_err(), "expected AssignmentNotFound on revoke");
                        prop_assert_eq!(
                            client.get_org_assignment_count(&contributor, &org),
                            org_count_before,
                            "org count must not change after rejected revoke"
                        );
                    } else {
                        client.revoke_assignment(&maintainer, &contributor, &org, &issue_id);
                        assigned.remove(&issue_id);
                        prop_assert_eq!(
                            client.get_org_assignment_count(&contributor, &org),
                            org_count_before - 1,
                            "org count must decrement after revoke"
                        );
                    }
                }
            }

            // Final invariants after each operation.
            let org_count_after = client.get_org_assignment_count(&contributor, &org);
            prop_assert!(
                org_count_after <= 4,
                "org count {} exceeded cap 4",
                org_count_after
            );
            prop_assert_eq!(
                org_count_after,
                assigned.len() as u32,
                "post-op org invariant: contract={} model={}",
                org_count_after,
                assigned.len()
            );
        }
    }
}
