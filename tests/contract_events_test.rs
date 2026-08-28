//! Contract event emission tests — issue #371
//!
//! Verifies that every state-changing contract function emits exactly one event
//! with the correct topic and data fields.  Field values are compared exactly so
//! that any schema change in `src/events.rs` causes at least one of these tests
//! to fail immediately.
//!
//! Event wire format (from `src/events.rs`):
//!
//! | Function              | topic[0]       | topic[1]         | data                          |
//! |-----------------------|----------------|------------------|-------------------------------|
//! | register_maintainer   | "maint_reg"    | maintainer       | org_id                        |
//! | apply_for_issue       | "applied"      | contributor      | (org_id, issue_id)            |
//! | withdraw_application  | "withdrew"     | contributor      | (org_id, issue_id)            |
//! | assign_issue          | "assigned"     | contributor      | (maintainer, org_id, issue_id)|
//! | complete_assignment   | "completed"    | contributor      | (maintainer, org_id, issue_id)|
//! | revoke_assignment     | "revoked"      | contributor      | (maintainer, org_id, issue_id)|
//!
//! Run with: cargo test --features testutils

#![cfg(test)]

use soroban_sdk::{
    symbol_short,
    testutils::Address as _,
    Address, Env, IntoVal, Symbol, Val,
};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Register the contract and call `initialize`, returning (env, client, admin).
fn setup() -> (Env, WorkloadGovernorClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    (env, client, admin)
}

// ---------------------------------------------------------------------------
// Test 1: register_maintainer emits maint_reg event with correct fields
// ---------------------------------------------------------------------------

#[test]
fn test_register_maintainer_event_fields() {
    let (env, client, admin) = setup();

    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");

    env.events().all();
    // Re-fetch after setup events; clear and start fresh
    let _ = env.events().all();
    // Use a fresh env snapshot after initialize
    env.events().all().iter().count(); // consume iterator
    // Clear accumulated events from initialize
    // Note: soroban testutils doesn't expose a `clear()` — we record the
    // current length and assert the *new* events appended after this point.
    let before = env.events().all().len();

    client.register_maintainer(&admin, &maintainer, &org_id);

    let all = env.events().all();
    // Exactly one new event was appended
    let new_count = all.len() - before;
    assert_eq!(new_count, 1, "expected exactly 1 event from register_maintainer");

    let (_, topics, data) = all.last().unwrap();

    // topic[0] == symbol_short!("maint_reg")
    let expected_topic0: Val = symbol_short!("maint_reg").into_val(&env);
    assert_eq!(
        topics.get(0).unwrap(),
        expected_topic0,
        "register_maintainer: topic[0] must be 'maint_reg'"
    );

    // topic[1] == maintainer address
    let expected_topic1: Val = maintainer.clone().into_val(&env);
    assert_eq!(
        topics.get(1).unwrap(),
        expected_topic1,
        "register_maintainer: topic[1] must be the maintainer address"
    );

    // data == org_id
    let expected_data: Val = org_id.clone().into_val(&env);
    assert_eq!(
        data,
        expected_data,
        "register_maintainer: data must be the org_id symbol"
    );
}

// ---------------------------------------------------------------------------
// Test 2: apply_for_issue emits applied event with correct fields
// ---------------------------------------------------------------------------

#[test]
fn test_apply_event_fields() {
    let (env, client, _admin) = setup();

    let contributor = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 42;

    // Maintainer registration is not required for apply; just initialize is enough.
    // But we need initialize to have happened (done in setup).
    let before = env.events().all().len();

    client.apply_for_issue(&contributor, &org_id, &issue_id);

    let all = env.events().all();
    let new_count = all.len() - before;
    assert_eq!(new_count, 1, "expected exactly 1 event from apply_for_issue");

    let (_, topics, data) = all.last().unwrap();

    // topic[0] == symbol_short!("applied")
    let expected_topic0: Val = symbol_short!("applied").into_val(&env);
    assert_eq!(
        topics.get(0).unwrap(),
        expected_topic0,
        "apply_for_issue: topic[0] must be 'applied'"
    );

    // topic[1] == contributor address
    let expected_topic1: Val = contributor.clone().into_val(&env);
    assert_eq!(
        topics.get(1).unwrap(),
        expected_topic1,
        "apply_for_issue: topic[1] must be contributor address"
    );

    // data == (org_id, issue_id)
    let expected_data: Val = (org_id.clone(), issue_id).into_val(&env);
    assert_eq!(
        data,
        expected_data,
        "apply_for_issue: data must be (org_id, issue_id)"
    );
}

// ---------------------------------------------------------------------------
// Test 3: withdraw_application emits withdrew event with correct fields
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_event_fields() {
    let (env, client, _admin) = setup();

    let contributor = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 42;

    client.apply_for_issue(&contributor, &org_id, &issue_id);
    let before = env.events().all().len();

    client.withdraw_application(&contributor, &org_id, &issue_id);

    let all = env.events().all();
    let new_count = all.len() - before;
    assert_eq!(new_count, 1, "expected exactly 1 event from withdraw_application");

    let (_, topics, data) = all.last().unwrap();

    // topic[0] == symbol_short!("withdrew")
    let expected_topic0: Val = symbol_short!("withdrew").into_val(&env);
    assert_eq!(
        topics.get(0).unwrap(),
        expected_topic0,
        "withdraw_application: topic[0] must be 'withdrew'"
    );

    // topic[1] == contributor address
    let expected_topic1: Val = contributor.clone().into_val(&env);
    assert_eq!(
        topics.get(1).unwrap(),
        expected_topic1,
        "withdraw_application: topic[1] must be contributor address"
    );

    // data == (org_id, issue_id)
    let expected_data: Val = (org_id.clone(), issue_id).into_val(&env);
    assert_eq!(
        data,
        expected_data,
        "withdraw_application: data must be (org_id, issue_id)"
    );
}

// ---------------------------------------------------------------------------
// Test 4: assign_issue emits assigned event with correct fields
// ---------------------------------------------------------------------------

#[test]
fn test_assign_event_fields() {
    let (env, client, admin) = setup();

    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 99;

    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    let before = env.events().all().len();

    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);

    let all = env.events().all();
    let new_count = all.len() - before;
    assert_eq!(new_count, 1, "expected exactly 1 event from assign_issue");

    let (_, topics, data) = all.last().unwrap();

    // topic[0] == symbol_short!("assigned")
    let expected_topic0: Val = symbol_short!("assigned").into_val(&env);
    assert_eq!(
        topics.get(0).unwrap(),
        expected_topic0,
        "assign_issue: topic[0] must be 'assigned'"
    );

    // topic[1] == contributor address
    let expected_topic1: Val = contributor.clone().into_val(&env);
    assert_eq!(
        topics.get(1).unwrap(),
        expected_topic1,
        "assign_issue: topic[1] must be contributor address"
    );

    // data == (maintainer, org_id, issue_id)
    let expected_data: Val = (maintainer.clone(), org_id.clone(), issue_id).into_val(&env);
    assert_eq!(
        data,
        expected_data,
        "assign_issue: data must be (maintainer, org_id, issue_id)"
    );
}

// ---------------------------------------------------------------------------
// Test 5: complete_assignment emits completed event with correct fields
// ---------------------------------------------------------------------------

#[test]
fn test_complete_event_fields() {
    let (env, client, admin) = setup();

    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 7;

    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    let before = env.events().all().len();

    client.complete_assignment(&maintainer, &contributor, &org_id, &issue_id);

    let all = env.events().all();
    let new_count = all.len() - before;
    assert_eq!(new_count, 1, "expected exactly 1 event from complete_assignment");

    let (_, topics, data) = all.last().unwrap();

    // topic[0] == symbol_short!("completed")
    let expected_topic0: Val = symbol_short!("completed").into_val(&env);
    assert_eq!(
        topics.get(0).unwrap(),
        expected_topic0,
        "complete_assignment: topic[0] must be 'completed'"
    );

    // topic[1] == contributor address
    let expected_topic1: Val = contributor.clone().into_val(&env);
    assert_eq!(
        topics.get(1).unwrap(),
        expected_topic1,
        "complete_assignment: topic[1] must be contributor address"
    );

    // data == (maintainer, org_id, issue_id)
    let expected_data: Val = (maintainer.clone(), org_id.clone(), issue_id).into_val(&env);
    assert_eq!(
        data,
        expected_data,
        "complete_assignment: data must be (maintainer, org_id, issue_id)"
    );
}

// ---------------------------------------------------------------------------
// Test 6: revoke_assignment emits revoked event with correct fields
// ---------------------------------------------------------------------------

#[test]
fn test_revoke_event_fields() {
    let (env, client, admin) = setup();

    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 55;

    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    let before = env.events().all().len();

    client.revoke_assignment(&maintainer, &contributor, &org_id, &issue_id);

    let all = env.events().all();
    let new_count = all.len() - before;
    assert_eq!(new_count, 1, "expected exactly 1 event from revoke_assignment");

    let (_, topics, data) = all.last().unwrap();

    // topic[0] == symbol_short!("revoked")
    let expected_topic0: Val = symbol_short!("revoked").into_val(&env);
    assert_eq!(
        topics.get(0).unwrap(),
        expected_topic0,
        "revoke_assignment: topic[0] must be 'revoked'"
    );

    // topic[1] == contributor address
    let expected_topic1: Val = contributor.clone().into_val(&env);
    assert_eq!(
        topics.get(1).unwrap(),
        expected_topic1,
        "revoke_assignment: topic[1] must be contributor address"
    );

    // data == (maintainer, org_id, issue_id)
    let expected_data: Val = (maintainer.clone(), org_id.clone(), issue_id).into_val(&env);
    assert_eq!(
        data,
        expected_data,
        "revoke_assignment: data must be (maintainer, org_id, issue_id)"
    );
}

// ---------------------------------------------------------------------------
// Test 7: error paths emit no events (duplicate application)
// ---------------------------------------------------------------------------

#[test]
fn test_no_event_on_duplicate_application() {
    let (env, client, _admin) = setup();

    let contributor = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 1;

    // First application — succeeds and emits an event
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    let before = env.events().all().len();

    // Second application — must panic with DuplicateApplication (error 8)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.apply_for_issue(&contributor, &org_id, &issue_id);
    }));
    assert!(
        result.is_err(),
        "duplicate apply_for_issue must panic (DuplicateApplication)"
    );

    // No new events must have been emitted
    let after = env.events().all().len();
    assert_eq!(
        after,
        before,
        "no events must be emitted on a duplicate application error path"
    );
}

// ---------------------------------------------------------------------------
// Test 8: error paths emit no events (assign without application)
// ---------------------------------------------------------------------------

#[test]
fn test_no_event_on_assign_missing_application() {
    let (env, client, admin) = setup();

    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id: u32 = 1;

    client.register_maintainer(&admin, &maintainer, &org_id);
    let before = env.events().all().len();

    // Assign without prior application — must panic with ApplicationNotFound (error 9)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    }));
    assert!(
        result.is_err(),
        "assign_issue without application must panic (ApplicationNotFound)"
    );

    let after = env.events().all().len();
    assert_eq!(
        after,
        before,
        "no events must be emitted when assign_issue fails with ApplicationNotFound"
    );
}

// ---------------------------------------------------------------------------
// Legacy count-only tests preserved for backwards compatibility
// (these were the original skeleton assertions; the field tests above supersede them)
// ---------------------------------------------------------------------------

#[test]
fn test_apply_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123u32;
    client.initialize(&admin);
    let before = env.events().all().len();
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - before, 1);
}

#[test]
fn test_withdraw_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123u32;
    client.initialize(&admin);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    let before = env.events().all().len();
    client.withdraw_application(&contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - before, 1);
}

#[test]
fn test_assign_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123u32;
    client.initialize(&admin);
    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    let before = env.events().all().len();
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - before, 1);
}

#[test]
fn test_complete_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123u32;
    client.initialize(&admin);
    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    let before = env.events().all().len();
    client.complete_assignment(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - before, 1);
}

#[test]
fn test_revoke_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123u32;
    client.initialize(&admin);
    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    let before = env.events().all().len();
    client.revoke_assignment(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - before, 1);
}

#[test]
fn test_register_maintainer_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    client.initialize(&admin);
    let before = env.events().all().len();
    client.register_maintainer(&admin, &maintainer, &org_id);
    assert_eq!(env.events().all().len() - before, 1);
}

#[test]
fn test_only_one_event_per_function() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123u32;
    client.initialize(&admin);

    let b0 = env.events().all().len();
    client.register_maintainer(&admin, &maintainer, &org_id);
    assert_eq!(env.events().all().len() - b0, 1);

    let b1 = env.events().all().len();
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - b1, 1);

    let b2 = env.events().all().len();
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - b2, 1);

    let b3 = env.events().all().len();
    client.complete_assignment(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - b3, 1);
}
