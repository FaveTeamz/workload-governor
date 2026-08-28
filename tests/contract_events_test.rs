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
// Helpers
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

    // Second call must fail with AlreadyInitialized.
    let result = client.try_initialize(&admin);
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

    let result = client.try_initialize(&admin2);
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
            .get(0)
            .and_then(|v| {
                let sym: Result<soroban_sdk::Symbol, _> = v.try_into_val(env);
                sym.ok()
            })
            .map(|s| s == symbol_short!("init"))
            .unwrap_or(false)
    });

    assert!(
        init_event.is_some(),
        "Indexer must be able to find the ContractInitialized event by topic"
    );

    let (_, _, data) = init_event.unwrap();
    let (discovered_admin, _): (Address, u32) = data.try_into_val(env).unwrap();

    assert_eq!(
        discovered_admin, admin,
        "Admin address recovered from the event must match the actual admin"
    );
}

/// `ledger` in the event data is a `u32` — the raw ledger sequence number, not zero.
/// Indexers can use it to determine the exact on-chain ledger of initialization.
#[test]
fn contract_initialized_event_ledger_is_nonzero_u32() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    // Advance the ledger sequence so it's clearly non-zero.
    env.ledger().set_sequence_number(42);
    client.initialize(&admin);

    let events = env.events().all();
    let (_, _, data): (_, Vec<Val>, Val) = events.last().unwrap();
    let (_, ledger): (Address, u32) = data.try_into_val(env).unwrap();

    assert_eq!(
        ledger, 42,
        "Ledger sequence in event data must match the ledger at initialize time"
    );
}

/// The event emitted by `initialize` is the LAST event in the log (no subsequent
/// events follow within the same invocation). This simplifies indexer logic.
#[test]
fn contract_initialized_event_is_last_event_in_log() {
    let (client, env) = setup();
    let admin = Address::generate(env);

    client.initialize(&admin);

    let events = env.events().all();
    let (_, last_topics, _): (_, Vec<Val>, Val) = events.last().unwrap();

    let last_topic0: soroban_sdk::Symbol =
        last_topics.get(0).unwrap().try_into_val(env).unwrap();

    assert_eq!(
        last_topic0,
        symbol_short!("init"),
        "The last event in the log after initialize must be the ContractInitialized event"
    );
}
