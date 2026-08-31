//! Integration tests for the `ContractInitialized` event emitted by `initialize`.
//!
//! Acceptance criteria verified here:
//!   1. `ContractInitialized` event emitted with `admin` address and `ledger` number.
//!   2. Double-initialization does NOT emit a second event (`AlreadyInitialized` fires first).
//!   3. Event fields are correctly structured for indexer consumption.
//!
//! Run with:
//!   cargo test --features testutils --test contract_events_test

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger as _},
    Address, Env, TryIntoVal, Val, Vec,
};

use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

fn setup() -> (WorkloadGovernorClient<'static>, &'static Env) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(WorkloadGovernor, ());
    // SAFETY: env is heap-allocated and lives for the duration of the test.
    let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
    let client = WorkloadGovernorClient::new(env, &contract_id);
    (client, env)
}

// ---------------------------------------------------------------------------
// Criterion 1: ContractInitialized event is emitted with admin and ledger
// ---------------------------------------------------------------------------

/// The `initialize` function emits exactly one event, indexed by
/// `symbol_short!("init")` as the first topic and the admin address as the second.
#[test]
fn contract_initialized_event_is_emitted() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    client.initialize(&admin);

    let events = env.events().all();
    assert!(
        !events.is_empty(),
        "Expected at least one event after initialize"
    );
}

/// Topics are a 2-tuple: `(symbol_short!("init"), admin)`.
/// Indexers use the first topic to filter `ContractInitialized` events.
#[test]
fn contract_initialized_event_topics() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    client.initialize(&admin);

    let events = env.events().all();
    let (_, topics, _): (_, Vec<Val>, Val) = events.last().unwrap();

    assert_eq!(topics.len(), 2, "Expected exactly 2 topics");

    let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(env).unwrap();
    assert_eq!(
        topic0,
        symbol_short!("init"),
        "First topic must be symbol_short!(\"init\")"
    );

    let topic1: Address = topics.get(1).unwrap().try_into_val(env).unwrap();
    assert_eq!(
        topic1, admin,
        "Second topic must be the admin address"
    );
}

/// Data is a 2-tuple: `(admin: Address, ledger: u32)`.
/// The ledger sequence number allows indexers to establish an exact on-chain
/// timestamp for the deployment.
#[test]
fn contract_initialized_event_data_contains_admin_and_ledger() {
    let (client, env) = setup();
    let admin = Address::generate(env);
    let ledger_before = env.ledger().sequence();

    client.initialize(&admin);

    let events = env.events().all();
    let (_, _, data): (_, Vec<Val>, Val) = events.last().unwrap();

    let (data_admin, data_ledger): (Address, u32) = data.try_into_val(env).unwrap();

    assert_eq!(
        data_admin, admin,
        "Data field 'admin' must match the address passed to initialize"
    );
    assert_eq!(
        data_ledger, ledger_before,
        "Data field 'ledger' must match env.ledger().sequence() at call time"
    );
}

/// The admin address appears in BOTH the topics tuple (for indexer filtering)
/// and the data tuple (for full event payload consumption).
#[test]
fn contract_initialized_event_admin_present_in_topics_and_data() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    client.initialize(&admin);

    let events = env.events().all();
    let (_, topics, data): (_, Vec<Val>, Val) = events.last().unwrap();

    let topic_admin: Address = topics.get(1).unwrap().try_into_val(env).unwrap();
    let (data_admin, _): (Address, u32) = data.try_into_val(env).unwrap();

    assert_eq!(
        topic_admin, data_admin,
        "Admin must appear identically in both topics[1] and data.admin"
    );
    assert_eq!(
        topic_admin, admin,
        "Both references must equal the address supplied to initialize"
    );
}

// ---------------------------------------------------------------------------
// Criterion 2: Double-initialization does NOT emit a second event
// ---------------------------------------------------------------------------

/// Calling `initialize` a second time fires `AlreadyInitialized` (error 1)
/// before any state or event is written. The second call's event is rolled back.
///
/// After the failed second call, the event log is empty (the Soroban test host
/// resets the log after each invocation; a rolled-back call leaves nothing).
/// This proves no "init" event was emitted for the duplicate attempt.
#[test]
fn contract_initialized_event_not_emitted_on_double_init() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    // Successful first initialization — event is emitted then the log is cleared
    // by the host before the next invocation.
    client.initialize(&admin);

    // Confirm at least one event was emitted for the first call.
    assert!(
        env.events().all().len() > 0,
        "Expected at least one event after the first initialize"
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

    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);

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
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
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
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
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
        "Second initialize must return an error (AlreadyInitialized)"
    );

    // The host rolls back all events from the failed invocation.
    // An empty log is the evidence that no 'init' event was emitted for the
    // duplicate attempt — any event it might have tried to emit was rolled back.
    assert_eq!(
        env.events().all().len(),
        0,
        "Event log must be empty after a rolled-back AlreadyInitialized call; \
         this proves the second initialize did NOT emit a ContractInitialized event"
    );
}

/// Variant: a different admin address on the second call also fires
/// `AlreadyInitialized` before emitting any event.
#[test]
fn contract_initialized_event_not_emitted_for_different_admin_on_double_init() {
    let (client, env) = setup();
    let admin1 = Address::generate(env);
    let admin2 = Address::generate(env);

    client.initialize(&admin1);

    client.register_maintainer(&admin, &maintainer, &org_id);
    let before = env.events().all().len();

    // Assign without prior application — must panic with ApplicationNotFound (error 9)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
    }));
    assert!(
        result.is_err(),
        "Second initialize with a different admin must also fail"
    );

    // No event for the second (different-admin) attempt either.
    assert_eq!(
        env.events().all().len(),
        0,
        "No ContractInitialized event should be emitted for a failed second initialize"
    );
}

// ---------------------------------------------------------------------------
// Criterion 3: Indexer-oriented structural verification
// ---------------------------------------------------------------------------

/// Indexers filter on topic[0] == symbol_short!("init") to detect new
/// contract deployments. Verify the symbol value is stable.
#[test]
fn contract_initialized_event_topic_symbol_is_init() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    client.initialize(&admin);

    let events = env.events().all();
    let (_, topics, _): (_, Vec<Val>, Val) = events.last().unwrap();
    let topic0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(env).unwrap();

    // symbol_short!("init") is the stable discriminant indexers should filter on.
    assert_eq!(topic0, symbol_short!("init"));
}

/// Indexers can recover the admin address from events alone (no storage query needed).
/// This test simulates the indexer use-case: read the event, extract admin.
#[test]
fn contract_initialized_event_admin_discoverable_from_event_alone() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    client.initialize(&admin);

    let events = env.events().all();

    // An indexer walks all events looking for topic[0] == "init"
    let init_event = events.iter().find(|(_, topics, _): &(_, Vec<Val>, Val)| {
        topics
    }

    /// Asserts the last event has 2 topics and the first is "workload".
    fn assert_workload_namespace(&self) {
        let topics = self.last_event_topics();
        assert_eq!(topics.len(), 2, "Expected 2-element topics tuple");
        let first = Symbol::try_from_val(&self.env, &topics.get(0).unwrap()).unwrap();
        assert_eq!(
            first,
            Symbol::new(&self.env, "workload"),
            "First topic must be symbol 'workload'"
        );
    }

    /// Returns the second topic as a Symbol.
    fn last_event_operation(&self) -> Symbol {
        let topics = self.last_event_topics();
        Symbol::try_from_val(&self.env, &topics.get(1).unwrap()).unwrap()
    }
}

// ---------------------------------------------------------------------------
// 1. initialize → operation "init"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_initialize_emits_workload_init() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);

    t.client.initialize(&admin);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("init"));
}

// ---------------------------------------------------------------------------
// 2. register_maintainer → operation "maint_reg"
// ---------------------------------------------------------------------------

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
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
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
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
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
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
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
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id, &None::<u32>);
    assert_eq!(env.events().all().len() - b2, 1);

    let b3 = env.events().all().len();
    client.complete_assignment(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(env.events().all().len() - b3, 1);
}
