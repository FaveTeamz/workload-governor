#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, Symbol,
};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

#[test]
fn test_apply_event_emitted() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123;

    client.register_maintainer(&admin, &contributor, &org_id);
    env.events().all().clear();

    client.apply_for_issue(&contributor, &org_id, &issue_id);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
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
    let issue_id = 123;

    client.register_maintainer(&admin, &contributor, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    env.events().all().clear();

    client.withdraw_application(&contributor, &org_id, &issue_id);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
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
    let issue_id = 123;

    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    env.events().all().clear();

    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
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
    let issue_id = 123;

    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    env.events().all().clear();

    client.complete_assignment(&maintainer, &contributor, &org_id, &issue_id);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
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
    let issue_id = 123;

    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    env.events().all().clear();

    client.revoke_assignment(&maintainer, &contributor, &org_id, &issue_id);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
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

    env.events().all().clear();

    client.register_maintainer(&admin, &maintainer, &org_id);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
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
    let issue_id = 123;

    env.events().all().clear();

    client.register_maintainer(&admin, &maintainer, &org_id);
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    env.events().all().clear();

    client.apply_for_issue(&contributor, &org_id, &issue_id);
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    env.events().all().clear();

    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    env.events().all().clear();

    client.complete_assignment(&maintainer, &contributor, &org_id, &issue_id);
    let events = env.events().all();
    assert_eq!(events.len(), 1);
}
