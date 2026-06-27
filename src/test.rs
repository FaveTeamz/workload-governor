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
    let (_, topics, _): (_, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val) =
        events.last().unwrap();
    assert_eq!(topics.len(), 2, "Expected 2-element topics tuple");
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
    let (_, topics, _): (_, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val) =
        events.last().unwrap();
    assert_eq!(topics.len(), 2, "Expected 2-element topics tuple");
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
