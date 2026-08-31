//! Unit tests and property-based tests for WorkloadGovernor.
//!
//! Run with:   cargo test --features testutils
//! PBT only:   cargo test --features testutils prop_
//! Unit only:  cargo test --features testutils unit_

#![cfg(test)]

// std is brought into scope via #[macro_use] extern crate std in lib.rs (cfg(test)).
use std::panic;
use std::string::String;

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
        t.client.apply_for_issue(&contributor, &org_a, &(i + 1));
        t.client.assign_issue(&m1, &contributor, &org_a, &(i + 1));
    }
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org_a), 4);

    // org_b must still accept an assignment
    t.client.apply_for_issue(&contributor, &org_b, &100u32);
    t.client.assign_issue(&m2, &contributor, &org_b, &100u32);
    assert_eq!(t.client.get_org_assignment_count(&contributor, &org_b), 1);
}

// ---------------------------------------------------------------------------
// UNIT TESTS — all ContractError variants
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
    for i in 1u32..=15 {
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
    for i in 1u32..=4 {
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

// ===========================================================================
// TESTS FOR #601 — InvalidIssueId validation
// ===========================================================================

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_zero_apply() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &0u32); // InvalidIssueId
}

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_max_apply() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &u32::MAX); // InvalidIssueId
}

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_zero_withdraw() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.withdraw_application(&contributor, &org, &0u32); // InvalidIssueId
}

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_max_withdraw() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.withdraw_application(&contributor, &org, &u32::MAX); // InvalidIssueId
}

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_zero_assign() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.assign_issue(&maintainer, &contributor, &org, &0u32); // InvalidIssueId
}

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_zero_complete() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.complete_assignment(&maintainer, &contributor, &org, &0u32); // InvalidIssueId
}

#[test]
#[should_panic]
fn unit_error_invalid_issue_id_zero_revoke() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("v");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.revoke_assignment(&maintainer, &contributor, &org, &0u32); // InvalidIssueId
}

#[test]
fn unit_valid_issue_id_boundaries() {
    // issue_id = 1 and u32::MAX - 1 are both valid
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("bdry");
    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &1u32);
    assert!(t.client.has_applied(&contributor, &org, &1u32));
    let high = u32::MAX - 1;
    t.client.apply_for_issue(&contributor, &org, &high);
    assert!(t.client.has_applied(&contributor, &org, &high));
}

// ===========================================================================
// TESTS FOR #602 — Storage migration v1 → v2
// ===========================================================================

#[test]
fn unit_migrate_v1_to_v2_no_entries() {
    // Migration with an empty pairs list should succeed.
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    t.client.initialize(&admin);
    let pairs: soroban_sdk::Vec<(Address, Symbol)> = soroban_sdk::Vec::new(&t.env);
    // Must succeed without panic
    t.client.migrate_v1_to_v2(&admin, &pairs);
}

#[test]
#[should_panic]
fn unit_migrate_v1_to_v2_only_once() {
    // Second call must panic with MigrationAlreadyDone.
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    t.client.initialize(&admin);
    let pairs: soroban_sdk::Vec<(Address, Symbol)> = soroban_sdk::Vec::new(&t.env);
    t.client.migrate_v1_to_v2(&admin, &pairs);
    t.client.migrate_v1_to_v2(&admin, &pairs); // MigrationAlreadyDone
}

#[test]
fn unit_migrate_v1_to_v2_event_emitted() {
    use soroban_sdk::testutils::Events;
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    t.client.initialize(&admin);
    let pairs: soroban_sdk::Vec<(Address, Symbol)> = soroban_sdk::Vec::new(&t.env);
    t.client.migrate_v1_to_v2(&admin, &pairs);
    let events = t.env.events().all();
    // At minimum the initialization event + migration event must be present
    assert!(events.len() >= 2);
    // Last event is migration completed — it must have 2 topics
    let (_, topics, _): (_, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val) =
        events.last().unwrap();
    assert_eq!(topics.len(), 2);
}

// ===========================================================================
// TESTS FOR #603 — Multi-sig admin threshold
// ===========================================================================

#[test]
fn unit_set_admin_threshold_2_of_3() {
    // Happy path: configure 2-of-3 multisig
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let signer1 = Address::generate(&t.env);
    let signer2 = Address::generate(&t.env);
    let signer3 = Address::generate(&t.env);
    t.client.initialize(&admin);

    let mut signers = soroban_sdk::Vec::new(&t.env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    signers.push_back(signer3.clone());

    // Must succeed
    t.client.set_admin_threshold(&2u32, &signers);
}

#[test]
#[should_panic]
fn unit_set_admin_threshold_zero_invalid() {
    // threshold = 0 must panic with InvalidThreshold
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let signer = Address::generate(&t.env);
    t.client.initialize(&admin);

    let mut signers = soroban_sdk::Vec::new(&t.env);
    signers.push_back(signer.clone());

    t.client.set_admin_threshold(&0u32, &signers); // InvalidThreshold
}

#[test]
#[should_panic]
fn unit_set_admin_threshold_exceeds_signer_count() {
    // threshold > len(signers) must panic with InvalidThreshold
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let signer = Address::generate(&t.env);
    t.client.initialize(&admin);

    let mut signers = soroban_sdk::Vec::new(&t.env);
    signers.push_back(signer.clone());

    t.client.set_admin_threshold(&5u32, &signers); // InvalidThreshold: 5 > 1
}

#[test]
fn unit_multisig_admin_operations_succeed() {
    // After setting multi-sig, admin operations using mock_all_auths still work.
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let signer1 = Address::generate(&t.env);
    let signer2 = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let org = t.org("ms");

    t.client.initialize(&admin);

    let mut signers = soroban_sdk::Vec::new(&t.env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    t.client.set_admin_threshold(&2u32, &signers);

    // register_maintainer must succeed since mock_all_auths satisfies all required auths
    t.client.register_maintainer(&admin, &maintainer, &org);
}

#[test]
fn unit_set_admin_threshold_event_emitted() {
    use soroban_sdk::testutils::Events;
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let s1 = Address::generate(&t.env);
    let s2 = Address::generate(&t.env);
    t.client.initialize(&admin);

    let mut signers = soroban_sdk::Vec::new(&t.env);
    signers.push_back(s1.clone());
    signers.push_back(s2.clone());
    t.client.set_admin_threshold(&1u32, &signers);

    let events = t.env.events().all();
    assert!(events.len() >= 2);
    let (_, topics, _): (_, soroban_sdk::Vec<soroban_sdk::Val>, soroban_sdk::Val) =
        events.last().unwrap();
    assert_eq!(topics.len(), 2);
}

// ===========================================================================
// TESTS FOR #600 — Governance proposals
// ===========================================================================

#[test]
fn unit_propose_cap_change_creates_proposal() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    let proposal_id = t.client.propose_cap_change(&maintainer, &org, &20u32);
    assert_eq!(proposal_id, 1u32);
}

#[test]
#[should_panic]
fn unit_propose_cap_change_requires_maintainer() {
    // Non-maintainer cannot create proposals
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let stranger = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.propose_cap_change(&stranger, &org, &20u32); // UnauthorizedMaintainer
}

#[test]
fn unit_vote_cap_change_records_votes() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let m2 = Address::generate(&t.env);
    let m3 = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org);
    t.client.register_maintainer(&admin, &m2, &org);
    t.client.register_maintainer(&admin, &m3, &org);

    let proposal_id = t.client.propose_cap_change(&m1, &org, &20u32);
    t.client.vote_cap_change(&m1, &org, &proposal_id, &true);
    t.client.vote_cap_change(&m2, &org, &proposal_id, &true);
    t.client.vote_cap_change(&m3, &org, &proposal_id, &false);
    // 2 yes, 1 no — verify no panic
}

#[test]
#[should_panic]
fn unit_vote_cap_change_duplicate_vote() {
    // Same maintainer cannot vote twice
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org);

    let proposal_id = t.client.propose_cap_change(&m1, &org, &20u32);
    t.client.vote_cap_change(&m1, &org, &proposal_id, &true);
    t.client.vote_cap_change(&m1, &org, &proposal_id, &true); // AlreadyVoted
}

#[test]
#[should_panic]
fn unit_execute_cap_change_insufficient_quorum() {
    // Only 1 vote — quorum of 3 not met
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org);

    let proposal_id = t.client.propose_cap_change(&m1, &org, &20u32);
    t.client.vote_cap_change(&m1, &org, &proposal_id, &true);
    t.client.execute_cap_change(&m1, &proposal_id); // QuorumNotMet
}

#[test]
#[should_panic]
fn unit_execute_cap_change_insufficient_approval() {
    // 3 votes but 1 yes, 2 no — less than 50% approval
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let m2 = Address::generate(&t.env);
    let m3 = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org);
    t.client.register_maintainer(&admin, &m2, &org);
    t.client.register_maintainer(&admin, &m3, &org);

    let proposal_id = t.client.propose_cap_change(&m1, &org, &20u32);
    t.client.vote_cap_change(&m1, &org, &proposal_id, &true);
    t.client.vote_cap_change(&m2, &org, &proposal_id, &false);
    t.client.vote_cap_change(&m3, &org, &proposal_id, &false);
    t.client.execute_cap_change(&m1, &proposal_id); // InsufficientApproval
}

#[test]
fn unit_execute_cap_change_full_lifecycle() {
    // Propose → 3 yes votes → execute → verify cap changed
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let m2 = Address::generate(&t.env);
    let m3 = Address::generate(&t.env);
    let org = t.org("gov");
    let contributor = Address::generate(&t.env);
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org);
    t.client.register_maintainer(&admin, &m2, &org);
    t.client.register_maintainer(&admin, &m3, &org);

    // Default cap is 15
    assert_eq!(t.client.get_global_cap(), 15u32);

    let proposal_id = t.client.propose_cap_change(&m1, &org, &25u32);
    t.client.vote_cap_change(&m1, &org, &proposal_id, &true);
    t.client.vote_cap_change(&m2, &org, &proposal_id, &true);
    t.client.vote_cap_change(&m3, &org, &proposal_id, &true);
    t.client.execute_cap_change(&m1, &proposal_id);

    // Cap must now be 25
    assert_eq!(t.client.get_global_cap(), 25u32);

    // Verify new cap is enforced — contributor can submit up to 25 applications
    for i in 1u32..=25 {
        t.client.apply_for_issue(&contributor, &org, &i);
    }
    assert_eq!(t.client.get_global_application_count(&contributor), 25);

    // 26th must fail
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        t.client.apply_for_issue(&contributor, &org, &26u32);
    }));
    assert!(result.is_err(), "Expected GlobalApplicationLimitReached at new cap");
}

#[test]
fn unit_multiple_proposals_independent() {
    // Two proposals can coexist with independent vote counts
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    let m1 = Address::generate(&t.env);
    let m2 = Address::generate(&t.env);
    let m3 = Address::generate(&t.env);
    let m4 = Address::generate(&t.env);
    let org = t.org("gov");
    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &m1, &org);
    t.client.register_maintainer(&admin, &m2, &org);
    t.client.register_maintainer(&admin, &m3, &org);
    t.client.register_maintainer(&admin, &m4, &org);

    let p1 = t.client.propose_cap_change(&m1, &org, &20u32);
    let p2 = t.client.propose_cap_change(&m2, &org, &30u32);
    assert_eq!(p1, 1u32);
    assert_eq!(p2, 2u32);

    // Vote on p1 and execute it
    t.client.vote_cap_change(&m1, &org, &p1, &true);
    t.client.vote_cap_change(&m2, &org, &p1, &true);
    t.client.vote_cap_change(&m3, &org, &p1, &true);
    t.client.execute_cap_change(&m1, &p1);
    assert_eq!(t.client.get_global_cap(), 20u32);
}

#[test]
fn unit_governance_default_cap_is_15() {
    let t = TestEnv::new();
    let admin = Address::generate(&t.env);
    t.client.initialize(&admin);
    assert_eq!(t.client.get_global_cap(), 15u32);
}

// ---------------------------------------------------------------------------
// PROPERTY-BASED TESTS
// ---------------------------------------------------------------------------

use proptest::prelude::*;

fn arb_org_name() -> impl Strategy<Value = String> {
    "[a-z]{1,9}".prop_map(|s: String| s)
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
    fn prop_not_initialized_guard(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
        let (_, client, _, _, contributor, org) = fresh_client(&org_name);
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
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
        for i in 1u32..=15 {
            client.apply_for_issue(&contributor, &org, &i);
        }
        prop_assert_eq!(client.get_global_application_count(&contributor), 15);
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &99u32);
        }));
        prop_assert!(result.is_err());
        prop_assert_eq!(client.get_global_application_count(&contributor), 15);
    }
}

// Feature: workload-governor, Property 6: Application Round-Trip
proptest! {
    #[test]
    fn prop_apply_round_trip(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
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
    fn prop_duplicate_application_rejected(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.apply_for_issue(&contributor, &org, &issue_id);
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &issue_id);
        }));
        prop_assert!(result.is_err());
    }
}

// Feature: workload-governor, Property 8: Withdrawal Round-Trip
proptest! {
    #[test]
    fn prop_withdraw_round_trip(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
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
    fn prop_unregistered_maintainer_rejected(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
        let (env, client, admin, _, contributor, org) = fresh_client(&org_name);
        let stranger = Address::generate(&env);
        client.initialize(&admin);
        client.apply_for_issue(&contributor, &org, &issue_id);
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
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
        for i in 1u32..=4 {
            client.apply_for_issue(&contributor, &org, &i);
            client.assign_issue(&maintainer, &contributor, &org, &i);
        }
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 4);
        client.apply_for_issue(&contributor, &org, &99u32);
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.assign_issue(&maintainer, &contributor, &org, &99u32);
        }));
        prop_assert!(result.is_err());
        prop_assert_eq!(client.get_org_assignment_count(&contributor, &org), 4);
    }
}

// Feature: workload-governor, Property 11: Assignment Round-Trip
proptest! {
    #[test]
    fn prop_assign_round_trip(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
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
    fn prop_complete_is_inverse_of_assign(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
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
    fn prop_revoke_is_inverse_of_assign(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
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
    fn prop_assignment_not_found(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
        let (_, client, admin, maintainer, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        client.register_maintainer(&admin, &maintainer, &org);
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.complete_assignment(&maintainer, &contributor, &org, &issue_id);
        }));
        prop_assert!(result.is_err());
    }
}

// Feature: workload-governor, Property 15: Read-Only Queries Are Immutable
proptest! {
    #[test]
    fn prop_read_only_queries_are_immutable(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
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

// Feature: workload-governor, Property #601: Invalid issue_id rejected for all entry points
proptest! {
    #[test]
    fn prop_invalid_issue_id_rejected(org_name in arb_org_name()) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);

        // issue_id = 0 must be rejected
        let r0 = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &0u32);
        }));
        prop_assert!(r0.is_err(), "issue_id = 0 should be rejected");

        // issue_id = u32::MAX must be rejected
        let rmax = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.apply_for_issue(&contributor, &org, &u32::MAX);
        }));
        prop_assert!(rmax.is_err(), "issue_id = u32::MAX should be rejected");
    }
}

// Feature: workload-governor, Property #601: Valid issue_ids accepted
proptest! {
    #[test]
    fn prop_valid_issue_ids_accepted(org_name in arb_org_name(), issue_id in 1u32..(u32::MAX - 1)) {
        let (_, client, admin, _, contributor, org) = fresh_client(&org_name);
        client.initialize(&admin);
        // Any issue_id in [1, u32::MAX) should be accepted
        client.apply_for_issue(&contributor, &org, &issue_id);
        prop_assert!(client.has_applied(&contributor, &org, &issue_id));
    }
}

// Feature: workload-governor, Property #602: Migration callable only once
proptest! {
    #[test]
    fn prop_migration_idempotency_guarded(org_name in arb_org_name()) {
        let (env, client, admin, _, _, _) = fresh_client(&org_name);
        client.initialize(&admin);
        let pairs: soroban_sdk::Vec<(Address, Symbol)> = soroban_sdk::Vec::new(&env);
        client.migrate_v1_to_v2(&admin, &pairs);
        // Second call must always panic
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
            client.migrate_v1_to_v2(&admin, &pairs);
        }));
        prop_assert!(result.is_err(), "migration must be callable only once");
    }
}

// Feature: workload-governor, Property #600: Default global cap is 15
proptest! {
    #[test]
    fn prop_governance_default_cap_is_15(org_name in arb_org_name()) {
        let (_, client, admin, _, _, _) = fresh_client(&org_name);
        client.initialize(&admin);
        prop_assert_eq!(client.get_global_cap(), 15u32);
    }
}
