#![cfg(test)]
use super::*;
use soroban_sdk::{Env, Address, Symbol};

#[test]
fn test_extend_assignment_ttl() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");
    let issue_id = 1;

    // Create an assignment
    let assignment_key = WorkloadGovernor::assignment_key(
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );
    
    let assignment = Assignment {
        contributor: contributor.clone(),
        issue_id,
        assigned_at: env.ledger().timestamp(),
        status: AssignmentStatus::Active,
    };
    env.storage().set(&assignment_key, &assignment);

    // Check initial TTL
    let (initial_ttl, initial_remaining) = env.storage().get_ttl_info(&assignment_key);

    // Extend TTL
    let result = WorkloadGovernor::extend_assignment_ttl(
        env.clone(),
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );

    assert!(result.is_ok());

    // Check TTL was extended
    let (new_ttl, new_remaining) = env.storage().get_ttl_info(&assignment_key);
    assert!(new_ttl > initial_ttl);
    assert!(new_remaining > initial_remaining);
}

#[test]
fn test_extend_assignment_ttl_not_found() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");
    let issue_id = 1;

    let result = WorkloadGovernor::extend_assignment_ttl(
        env,
        contributor,
        org_id,
        issue_id,
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), TtlError::AssignmentNotFound);
}

#[test]
fn test_extend_assignment_ttl_no_auth_required() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");
    let issue_id = 1;

    // Create an assignment
    let assignment_key = WorkloadGovernor::assignment_key(
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );
    
    let assignment = Assignment {
        contributor: contributor.clone(),
        issue_id,
        assigned_at: env.ledger().timestamp(),
        status: AssignmentStatus::Active,
    };
    env.storage().set(&assignment_key, &assignment);

    // Call from any address (no auth required)
    let caller = Address::random(&env);
    let result = WorkloadGovernor::extend_assignment_ttl(
        env.clone(),
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );

    // Should succeed even though caller is not the contributor
    assert!(result.is_ok());
}

#[test]
fn test_get_assignment_ttl_status() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");
    let issue_id = 1;

    // Create an assignment
    let assignment_key = WorkloadGovernor::assignment_key(
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );
    
    let assignment = Assignment {
        contributor: contributor.clone(),
        issue_id,
        assigned_at: env.ledger().timestamp(),
        status: AssignmentStatus::Active,
    };
    env.storage().set(&assignment_key, &assignment);

    let result = WorkloadGovernor::get_assignment_ttl_status(
        env.clone(),
        contributor,
        org_id,
        issue_id,
    );

    assert!(result.is_ok());
    let (ttl, remaining) = result.unwrap();
    assert!(ttl > 0);
    assert!(remaining > 0);
}

#[test]
fn test_extend_application_ttl() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");
    let issue_id = 1;

    // Create an application
    let application_key = WorkloadGovernor::application_key(
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );
    
    let application = Application {
        contributor: contributor.clone(),
        issue_id,
        applied_at: env.ledger().timestamp(),
    };
    env.storage().set(&application_key, &application);

    // Check initial TTL
    let (initial_ttl, initial_remaining) = env.storage().get_ttl_info(&application_key);

    // Extend TTL
    let result = WorkloadGovernor::extend_application_ttl(
        env.clone(),
        contributor.clone(),
        org_id.clone(),
        issue_id,
    );

    assert!(result.is_ok());

    // Check TTL was extended
    let (new_ttl, new_remaining) = env.storage().get_ttl_info(&application_key);
    assert!(new_ttl > initial_ttl);
    assert!(new_remaining > initial_remaining);
}
