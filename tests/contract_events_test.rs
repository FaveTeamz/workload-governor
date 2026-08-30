//! Contract event tests for WorkloadGovernor.
//!
//! Verifies that every state-changing function emits exactly the right event
//! with:
//!   1. A 2-element topics tuple
//!   2. First topic = symbol_short!("workload")  (namespace)
//!   3. Second topic = the operation-specific name symbol
//!
//! Run with: cargo test --features testutils contract_event

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events},
    Address, Env, Symbol, TryFromVal, Val, Vec,
};

use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

struct EventsTestEnv {
    env: Env,
    client: WorkloadGovernorClient<'static>,
}

impl EventsTestEnv {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, WorkloadGovernor);
        let env: &'static Env = std::boxed::Box::leak(std::boxed::Box::new(env));
        let client = WorkloadGovernorClient::new(env, &contract_id);
        EventsTestEnv {
            env: env.clone(),
            client,
        }
    }

    fn org(&self, name: &str) -> Symbol {
        Symbol::new(&self.env, name)
    }

    /// Returns the topics Vec of the most recently emitted event.
    fn last_event_topics(&self) -> Vec<Val> {
        let events = self.env.events().all();
        let (_, topics, _): (_, Vec<Val>, Val) = events.last().unwrap();
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
fn contract_event_register_maintainer_emits_workload_maint_reg() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let org = t.org("org1");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("maint_reg"));
}

// ---------------------------------------------------------------------------
// 3. deregister_maintainer → operation "maint_drg"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_deregister_maintainer_emits_workload_maint_drg() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let org = t.org("org2");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.deregister_maintainer(&admin, &maintainer, &org);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("maint_drg"));
}

// ---------------------------------------------------------------------------
// 4. set_org_cap → operation "cap_set"  (carries old_cap + new_cap)
// ---------------------------------------------------------------------------

#[test]
fn contract_event_set_org_cap_emits_workload_cap_set() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let org = t.org("caporg");

    t.client.initialize(&admin);
    t.client.set_org_cap(&admin, &org, &3u32);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("cap_set"));
}

#[test]
fn contract_event_set_org_cap_updates_stored_value() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let org = t.org("capdata");

    t.client.initialize(&admin);
    t.client.set_org_cap(&admin, &org, &2u32);
    assert_eq!(t.client.get_org_cap(&org), 2, "Cap should be 2 after set");

    t.client.set_org_cap(&admin, &org, &5u32);
    assert_eq!(t.client.get_org_cap(&org), 5, "Cap should be 5 after update");
}

// ---------------------------------------------------------------------------
// 5. apply_for_issue → operation "app_sub"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_apply_for_issue_emits_workload_app_sub() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("org3");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &10u32);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("app_sub"));
}

// ---------------------------------------------------------------------------
// 6. withdraw_application → operation "app_wdw"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_withdraw_application_emits_workload_app_wdw() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("org4");

    t.client.initialize(&admin);
    t.client.apply_for_issue(&contributor, &org, &20u32);
    t.client.withdraw_application(&contributor, &org, &20u32);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("app_wdw"));
}

// ---------------------------------------------------------------------------
// 7. assign_issue → operation "assigned"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_assign_issue_emits_workload_assigned() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("org5");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &30u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &30u32);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("assigned"));
}

// ---------------------------------------------------------------------------
// 8. complete_assignment → operation "completed"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_complete_assignment_emits_workload_completed() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("org6");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &40u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &40u32);
    t.client.complete_assignment(&maintainer, &contributor, &org, &40u32);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("completed"));
}

// ---------------------------------------------------------------------------
// 9. revoke_assignment → operation "revoked"
// ---------------------------------------------------------------------------

#[test]
fn contract_event_revoke_assignment_emits_workload_revoked() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("org7");

    t.client.initialize(&admin);
    t.client.register_maintainer(&admin, &maintainer, &org);
    t.client.apply_for_issue(&contributor, &org, &50u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &50u32);
    t.client.revoke_assignment(&maintainer, &contributor, &org, &50u32);

    t.assert_workload_namespace();
    assert_eq!(t.last_event_operation(), symbol_short!("revoked"));
}

// ---------------------------------------------------------------------------
// 10. All state-changing functions each produce at least one event
// ---------------------------------------------------------------------------

#[test]
fn contract_event_all_state_changing_functions_emit_events() {
    let t = EventsTestEnv::new();
    let admin = Address::generate(&t.env);
    let maintainer = Address::generate(&t.env);
    let contributor = Address::generate(&t.env);
    let org = t.org("allops");

    macro_rules! assert_event_emitted {
        ($before:expr, $call:expr, $label:expr) => {{
            $call;
            assert!(t.env.events().all().len() > $before, "{} must emit an event", $label);
        }};
    }

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.initialize(&admin), "initialize");

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.register_maintainer(&admin, &maintainer, &org), "register_maintainer");

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.deregister_maintainer(&admin, &maintainer, &org), "deregister_maintainer");

    // Re-register for subsequent calls
    t.client.register_maintainer(&admin, &maintainer, &org);

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.set_org_cap(&admin, &org, &3u32), "set_org_cap");

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.apply_for_issue(&contributor, &org, &1u32), "apply_for_issue");

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.withdraw_application(&contributor, &org, &1u32), "withdraw_application");

    t.client.apply_for_issue(&contributor, &org, &2u32);
    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.assign_issue(&maintainer, &contributor, &org, &2u32), "assign_issue");

    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.complete_assignment(&maintainer, &contributor, &org, &2u32), "complete_assignment");

    t.client.apply_for_issue(&contributor, &org, &3u32);
    t.client.assign_issue(&maintainer, &contributor, &org, &3u32);
    let n = t.env.events().all().len();
    assert_event_emitted!(n, t.client.revoke_assignment(&maintainer, &contributor, &org, &3u32), "revoke_assignment");
}
