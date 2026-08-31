#![cfg(test)]
use super::*;
use soroban_sdk::{Env, Address, Symbol, Vec};

#[test]
fn test_single_apply() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");
    let issue_id = 1;

    // Initialize organization
    let org_key = WorkloadGovernor::org_key(org_id.clone());
    let org = Organization {
        name: org_id.clone(),
        issue_count: 10,
        total_applications: 0,
    };
    env.storage().set(&org_key, &org);

    // Initialize issue
    let issue_key = WorkloadGovernor::issue_key(org_id.clone(), issue_id);
    env.storage().set(&issue_key, &true);

    let result = WorkloadGovernor::apply(
        env.clone(),
        contributor.clone(),
        org_id,
        issue_id,
    );

    assert!(result.is_ok());

    // Verify application was stored
    let app = WorkloadGovernor::get_application(env, contributor, issue_id);
    assert!(app.is_some());
}

#[test]
fn test_batch_apply_success() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    // Initialize organization
    let org_key = WorkloadGovernor::org_key(org_id.clone());
    let org = Organization {
        name: org_id.clone(),
        issue_count: 10,
        total_applications: 0,
    };
    env.storage().set(&org_key, &org);

    // Initialize issues
    let mut issue_ids = Vec::new(&env);
    for i in 1..=5 {
        issue_ids.push_back(i);
        let issue_key = WorkloadGovernor::issue_key(org_id.clone(), i);
        env.storage().set(&issue_key, &true);
    }

    let result = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_id,
        issue_ids,
    );

    assert!(result.is_ok());
    let applied = result.unwrap();
    assert_eq!(applied.len(), 5);
}

#[test]
fn test_batch_apply_duplicates_skipped() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    // Initialize organization
    let org_key = WorkloadGovernor::org_key(org_id.clone());
    let org = Organization {
        name: org_id.clone(),
        issue_count: 10,
        total_applications: 0,
    };
    env.storage().set(&org_key, &org);

    // Initialize issue
    let issue_key = WorkloadGovernor::issue_key(org_id.clone(), 1);
    env.storage().set(&issue_key, &true);

    // Create batch with duplicate
    let mut issue_ids = Vec::new(&env);
    issue_ids.push_back(1);
    issue_ids.push_back(1);
    issue_ids.push_back(2); // This doesn't exist, will be skipped

    let result = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_id,
        issue_ids,
    );

    assert!(result.is_ok());
    let applied = result.unwrap();
    // Should only apply issue 1 once
    assert_eq!(applied.len(), 1);
}

#[test]
fn test_batch_apply_cap() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    // Initialize organization
    let org_key = WorkloadGovernor::org_key(org_id.clone());
    let org = Organization {
        name: org_id.clone(),
        issue_count: 20,
        total_applications: 0,
    };
    env.storage().set(&org_key, &org);

    // Initialize 20 issues
    let mut issue_ids = Vec::new(&env);
    for i in 1..=20 {
        issue_ids.push_back(i);
        let issue_key = WorkloadGovernor::issue_key(org_id.clone(), i);
        env.storage().set(&issue_key, &true);
    }

    let result = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_id,
        issue_ids,
    );

    assert!(result.is_ok());
    let applied = result.unwrap();
    // Cap is 15, so should only apply 15
    assert_eq!(applied.len(), 15);
}

#[test]
fn test_batch_apply_too_large() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    let mut issue_ids = Vec::new(&env);
    for i in 1..=20 {
        issue_ids.push_back(i);
    }

    let result = WorkloadGovernor::batch_apply(
        env,
        contributor,
        org_id,
        issue_ids,
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), ApplicationError::BatchTooLarge);
}

#[test]
fn test_batch_apply_invalid_org() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "nonexistent_org");

    let mut issue_ids = Vec::new(&env);
    issue_ids.push_back(1);

    let result = WorkloadGovernor::batch_apply(
        env,
        contributor,
        org_id,
        issue_ids,
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), ApplicationError::OrganizationNotFound);
}
