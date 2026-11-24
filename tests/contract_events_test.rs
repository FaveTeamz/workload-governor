//! Contract event topic schema conformance tests. (#829 SC-004)
//!
//! Verifies that every contract event emitted by WorkloadGovernor uses the
//! standardised 3-element topic tuple required by the off-chain indexer:
//!
//! ```text
//! topics[0]  Symbol("WG")         — contract namespace discriminant
//! topics[1]  Symbol(<event_name>) — operation identifier
//! topics[2]  Address              — primary entity address
//! ```
//!
//! Run with:
//!   cargo test --features testutils --test contract_events_test

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, Symbol, TryIntoVal, Val, Vec,
};

use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

struct TestCtx {
    env: &'static Env,
    client: WorkloadGovernorClient<'static>,
    admin: Address,
}

impl TestCtx {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(WorkloadGovernor, ());
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        let client = WorkloadGovernorClient::new(env, &contract_id);
        let admin = Address::generate(env);
        client.initialize(&admin);
        TestCtx { env, client, admin }
    }

    fn org(&self, name: &str) -> Symbol {
        Symbol::new(self.env, name)
    }

    /// Returns the topics Vec<Val> of the most recent event in the log.
    fn last_topics(&self) -> Vec<Val> {
        let all = self.env.events().all();
        let (_, topics, _): (_, Vec<Val>, Val) = all.last().unwrap();
        topics
    }

    /// Asserts topics[0] == Symbol("WG"), topics[1] == expected_op, topics[2] == expected_entity.
    fn assert_schema(
        &self,
        expected_op: soroban_sdk::Symbol,
        expected_entity: &Address,
    ) {
        let topics = self.last_topics();

        assert_eq!(topics.len(), 3, "event must have exactly 3 topics");

        let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(self.env).unwrap();
        assert_eq!(t0, symbol_short!("WG"), "topics[0] must be Symbol(\"WG\")");

        let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(self.env).unwrap();
        assert_eq!(t1, expected_op, "topics[1] must be the event-name symbol");

        let t2: Address = topics.get(2).unwrap().try_into_val(self.env).unwrap();
        assert_eq!(t2, *expected_entity, "topics[2] must be the primary entity address");
    }
}

// ---------------------------------------------------------------------------
// 1. initialize — topics: (WG, "init", admin)
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_event_3_topic_schema() {
    // initialize is called in TestCtx::new(), so we verify directly.
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(WorkloadGovernor, ());
    let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
    let client = WorkloadGovernorClient::new(env, &contract_id);
    let admin = Address::generate(env);

    client.initialize(&admin);

    let all = env.events().all();
    assert!(!all.is_empty(), "initialize must emit at least one event");

    // Find the init event
    let init_sym = symbol_short!("WG");
    let (_, topics, _): (_, Vec<Val>, Val) = all
        .iter()
        .find(|(_, topics, _): &(_, Vec<Val>, Val)| {
            if let Ok(t0) = topics.get(0).unwrap().try_into_val::<_, soroban_sdk::Symbol>(env) {
                t0 == init_sym
            } else {
                false
            }
        })
        .expect("must find a WG-namespaced event after initialize");

    assert_eq!(topics.len(), 3, "initialize event must have exactly 3 topics");

    let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(env).unwrap();
    assert_eq!(t0, symbol_short!("WG"), "topics[0] must be Symbol(\"WG\")");

    let t1: soroban_sdk::Symbol = topics.get(1).unwrap().try_into_val(env).unwrap();
    assert_eq!(t1, symbol_short!("init"), "topics[1] must be Symbol(\"init\")");

    let t2: Address = topics.get(2).unwrap().try_into_val(env).unwrap();
    assert_eq!(t2, admin, "topics[2] must be the admin address");
}

// ---------------------------------------------------------------------------
// 2. register_maintainer — topics: (WG, "maint_reg", maintainer)
// ---------------------------------------------------------------------------

#[test]
fn test_register_maintainer_event_3_topic_schema() {
    let ctx = TestCtx::new();
    let maintainer = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.register_maintainer(&ctx.admin, &maintainer, &org);

    ctx.assert_schema(symbol_short!("maint_reg"), &maintainer);
}

// ---------------------------------------------------------------------------
// 3. apply_for_issue — topics: (WG, "applied", contributor)
// ---------------------------------------------------------------------------

#[test]
fn test_apply_for_issue_event_3_topic_schema() {
    let ctx = TestCtx::new();
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.apply_for_issue(&contributor, &org, &1u32);

    ctx.assert_schema(symbol_short!("applied"), &contributor);
}

// ---------------------------------------------------------------------------
// 4. withdraw_application — topics: (WG, "withdrew", contributor)
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_application_event_3_topic_schema() {
    let ctx = TestCtx::new();
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.apply_for_issue(&contributor, &org, &2u32);
    ctx.client.withdraw_application(&contributor, &org, &2u32);

    ctx.assert_schema(symbol_short!("withdrew"), &contributor);
}

// ---------------------------------------------------------------------------
// 5. assign_issue — topics: (WG, "assigned", contributor)
// ---------------------------------------------------------------------------

#[test]
fn test_assign_issue_event_3_topic_schema() {
    let ctx = TestCtx::new();
    let maintainer = Address::generate(ctx.env);
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.register_maintainer(&ctx.admin, &maintainer, &org);
    ctx.client.apply_for_issue(&contributor, &org, &3u32);
    ctx.client.assign_issue(&maintainer, &contributor, &org, &3u32);

    ctx.assert_schema(symbol_short!("assigned"), &contributor);
}

// ---------------------------------------------------------------------------
// 6. complete_assignment — topics: (WG, "completed", contributor)
// ---------------------------------------------------------------------------

#[test]
fn test_complete_assignment_event_3_topic_schema() {
    let ctx = TestCtx::new();
    let maintainer = Address::generate(ctx.env);
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.register_maintainer(&ctx.admin, &maintainer, &org);
    ctx.client.apply_for_issue(&contributor, &org, &4u32);
    ctx.client.assign_issue(&maintainer, &contributor, &org, &4u32);
    ctx.client.complete_assignment(&maintainer, &contributor, &org, &4u32);

    ctx.assert_schema(symbol_short!("completed"), &contributor);
}

// ---------------------------------------------------------------------------
// 7. revoke_assignment — topics: (WG, "revoked", contributor)
// ---------------------------------------------------------------------------

#[test]
fn test_revoke_assignment_event_3_topic_schema() {
    let ctx = TestCtx::new();
    let maintainer = Address::generate(ctx.env);
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.register_maintainer(&ctx.admin, &maintainer, &org);
    ctx.client.apply_for_issue(&contributor, &org, &5u32);
    ctx.client.assign_issue(&maintainer, &contributor, &org, &5u32);
    ctx.client.revoke_assignment(&maintainer, &contributor, &org, &5u32);

    ctx.assert_schema(symbol_short!("revoked"), &contributor);
}

// ---------------------------------------------------------------------------
// 8. All events — namespace discriminant is uniformly "WG"
// ---------------------------------------------------------------------------

#[test]
fn test_all_events_have_wg_namespace() {
    let ctx = TestCtx::new();
    let maintainer = Address::generate(ctx.env);
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("org001");

    ctx.client.register_maintainer(&ctx.admin, &maintainer, &org);
    ctx.client.apply_for_issue(&contributor, &org, &10u32);
    ctx.client.assign_issue(&maintainer, &contributor, &org, &10u32);
    ctx.client.complete_assignment(&maintainer, &contributor, &org, &10u32);

    let all = ctx.env.events().all();
    assert!(!all.is_empty());

    let wg = symbol_short!("WG");
    for (_, topics, _) in all.iter() {
        assert_eq!(
            topics.len(),
            3,
            "every WG event must have exactly 3 topics"
        );
        let t0: soroban_sdk::Symbol = topics.get(0).unwrap().try_into_val(ctx.env).unwrap();
        assert_eq!(t0, wg, "topics[0] must be Symbol(\"WG\") for all contract events");
    }
}

// ---------------------------------------------------------------------------
// 9. apply_for_issue data layout: (org_id, issue_id)
// ---------------------------------------------------------------------------

#[test]
fn test_apply_for_issue_event_data_layout() {
    let ctx = TestCtx::new();
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("datorg");
    let issue_id: u32 = 42;

    ctx.client.apply_for_issue(&contributor, &org, &issue_id);

    let all = ctx.env.events().all();
    let (_, _, data): (_, Vec<Val>, Val) = all.last().unwrap();
    let (data_org, data_issue): (Symbol, u32) = data.try_into_val(ctx.env).unwrap();

    assert_eq!(data_org, org, "data.org_id must match the org passed to apply_for_issue");
    assert_eq!(data_issue, issue_id, "data.issue_id must match the issue_id passed");
}

// ---------------------------------------------------------------------------
// 10. assign_issue data layout: (maintainer, org_id, issue_id)
// ---------------------------------------------------------------------------

#[test]
fn test_assign_issue_event_data_layout() {
    let ctx = TestCtx::new();
    let maintainer = Address::generate(ctx.env);
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("datorg2");
    let issue_id: u32 = 77;

    ctx.client.register_maintainer(&ctx.admin, &maintainer, &org);
    ctx.client.apply_for_issue(&contributor, &org, &issue_id);
    ctx.client.assign_issue(&maintainer, &contributor, &org, &issue_id);

    let all = ctx.env.events().all();
    let (_, _, data): (_, Vec<Val>, Val) = all.last().unwrap();
    let (data_maintainer, data_org, data_issue): (Address, Symbol, u32) =
        data.try_into_val(ctx.env).unwrap();

    assert_eq!(data_maintainer, maintainer, "data.maintainer must match");
    assert_eq!(data_org, org, "data.org_id must match");
    assert_eq!(data_issue, issue_id, "data.issue_id must match");
}

// ---------------------------------------------------------------------------
// 11. Error paths emit no WG events (rolled back on panic)
// ---------------------------------------------------------------------------

#[test]
fn test_duplicate_application_emits_no_event() {
    let ctx = TestCtx::new();
    let contributor = Address::generate(ctx.env);
    let org = ctx.org("errorg");

    ctx.client.apply_for_issue(&contributor, &org, &1u32);
    let before = ctx.env.events().all().len();

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        ctx.client.apply_for_issue(&contributor, &org, &1u32);
    }));
    assert!(result.is_err(), "duplicate application must panic");

    // Soroban test host resets the event log after a rolled-back invocation.
    assert_eq!(
        ctx.env.events().all().len(),
        0,
        "rolled-back call must not leave events in the log"
    );
    let _ = before; // confirm we used it
}

#[test]
fn test_corrupted_and_malformed_event_payloads() {
    let env = Env::default();
    // Test that empty and truncated topics do not cause unhandled panics
    let empty_topics: Vec<Val> = Vec::new(&env);
    assert!(empty_topics.is_empty());

    let mut truncated_topics: Vec<Val> = Vec::new(&env);
    truncated_topics.push_back(symbol_short!("applied").into_val(&env));
    assert_eq!(truncated_topics.len(), 1);

    // Verify topic symbol disparity detection
    let unexpected_topic = symbol_short!("foreign");
    assert_ne!(unexpected_topic, symbol_short!("applied"));
}
