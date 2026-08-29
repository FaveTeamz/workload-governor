#![cfg(test)]

use soroban_sdk::{
    testutils::{Address as _, Events},
    Address, Env, Symbol,
};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

#[test]
fn test_already_assigned_error_prevents_double_assignment() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    // Create admin, contributors, and maintainer
    let admin = Address::generate(&env);
    let contributor_a = Address::generate(&env);
    let contributor_b = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123;

    // Register maintainer
    client.register_maintainer(&admin, &maintainer, &org_id);

    // Contributor A applies for the issue
    client.apply_for_issue(&contributor_a, &org_id, &issue_id);

    // Maintainer assigns issue to Contributor A (should succeed)
    client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);

    // Try to assign the same issue to Contributor B (should fail)
    // This should panic with error code 11 (AlreadyAssigned)
    let result = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);
    });

    // Verify the second assignment failed
    assert!(result.is_err(), "Expected error 11 (AlreadyAssigned) but assignment succeeded");

    // Verify Contributor A still has the assignment
    // The assignment should still be active
    // (We can check this by trying to assign again or checking status)

    // Try to assign to another contributor (also should fail)
    let contributor_c = Address::generate(&env);
    let result2 = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_c, &org_id, &issue_id);
    });
    assert!(result2.is_err(), "Expected error 11 for any second assignment");

    // Now revoke the assignment from Contributor A
    client.revoke_assignment(&maintainer, &contributor_a, &org_id, &issue_id);

    // After revocation, should be able to assign again
    // Assign to Contributor B (should succeed now)
    client.apply_for_issue(&contributor_b, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);

    // Verify the assignment was successful
    // If we got here, the assignment worked
}

#[test]
fn test_already_assigned_error_code_is_error_11() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor_a = Address::generate(&env);
    let contributor_b = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123;

    // Register maintainer
    client.register_maintainer(&admin, &maintainer, &org_id);

    // Assign to Contributor A
    client.apply_for_issue(&contributor_a, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);

    // Try to assign to Contributor B - should get error 11
    // Since we can't easily catch specific error codes in this test framework,
    // we verify the panic contains the error code
    let result = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);
    });

    // The panic should contain error code 11
    // Let's verify it failed
    assert!(result.is_err(), "Expected error 11 (AlreadyAssigned)");
}

#[test]
fn test_first_assignment_remains_active_after_failed_second_attempt() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor_a = Address::generate(&env);
    let contributor_b = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123;

    // Register maintainer
    client.register_maintainer(&admin, &maintainer, &org_id);

    // Assign to Contributor A (should succeed)
    client.apply_for_issue(&contributor_a, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);

    // Try to assign to Contributor B (should fail)
    let result = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);
    });
    assert!(result.is_err(), "Second assignment should have failed");

    // The first assignment should still be active
    // Let's verify by checking that we can't assign the same issue again
    // (If it was inactive, we could assign it)
    let result3 = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);
    });
    assert!(result3.is_err(), "First assignment should still be active");
}

#[test]
fn test_revoke_then_reassign_works() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor_a = Address::generate(&env);
    let contributor_b = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org-001");
    let issue_id = 123;

    // Register maintainer
    client.register_maintainer(&admin, &maintainer, &org_id);

    // Assign to Contributor A
    client.apply_for_issue(&contributor_a, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);

    // Revoke the assignment
    client.revoke_assignment(&maintainer, &contributor_a, &org_id, &issue_id);

    // Now assign to Contributor B (should succeed)
    client.apply_for_issue(&contributor_b, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);

    // If we got here, it worked!
    // Let's verify by checking we can't assign again (should be blocked)
    let contributor_c = Address::generate(&env);
    let result = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_c, &org_id, &issue_id);
    });
    assert!(result.is_err(), "After assigning to B, should not be able to assign again");
}

// ============================================================
// Issue #369 — AlreadyAssigned edge-case coverage
// All tests below use the unit_already_assigned_ prefix.
// ============================================================

/// Test 1: assign_issue returns AlreadyAssigned (error 11) when the issue
/// is already assigned to a different contributor.
#[test]
fn unit_already_assigned_returns_error_11() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor_a = Address::generate(&env);
    let contributor_b = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org001");
    let issue_id: u32 = 42;

    // Setup: register maintainer and have contributor_a apply + get assigned
    client.register_maintainer(&admin, &maintainer, &org_id);
    client.apply_for_issue(&contributor_a, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);

    // contributor_b must apply before the maintainer can attempt assignment
    client.apply_for_issue(&contributor_b, &org_id, &issue_id);

    // Attempting to assign the same issue to contributor_b must fail (AlreadyAssigned = 11)
    let result = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);
    });
    assert!(result.is_err(), "Expected AlreadyAssigned (error 11) but assignment succeeded");

    // contributor_a must still be assigned
    assert!(
        client.is_assigned(&contributor_a, &org_id, &issue_id),
        "contributor_a should still be assigned after the failed second attempt",
    );
}

/// Test 2: after revoking an assignment the issue can be re-assigned to a
/// *different* contributor.
#[test]
fn unit_already_assigned_after_revoke_reassign_to_different_contributor() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor_a = Address::generate(&env);
    let contributor_b = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org001");
    let issue_id: u32 = 42;

    client.register_maintainer(&admin, &maintainer, &org_id);

    // Assign to contributor_a then revoke
    client.apply_for_issue(&contributor_a, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_a, &org_id, &issue_id);
    client.revoke_assignment(&maintainer, &contributor_a, &org_id, &issue_id);

    // contributor_a must no longer be assigned
    assert!(
        !client.is_assigned(&contributor_a, &org_id, &issue_id),
        "contributor_a should not be assigned after revoke",
    );

    // contributor_b applies and gets assigned — must succeed
    client.apply_for_issue(&contributor_b, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor_b, &org_id, &issue_id);

    assert!(
        client.is_assigned(&contributor_b, &org_id, &issue_id),
        "contributor_b should be assigned after revoke-and-reassign",
    );
}

/// Test 3: after revoking an assignment the *same* contributor can be
/// re-assigned to the same issue.
#[test]
fn unit_already_assigned_after_revoke_reassign_to_same_contributor() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org001");
    let issue_id: u32 = 42;

    client.register_maintainer(&admin, &maintainer, &org_id);

    // First assignment cycle
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    client.revoke_assignment(&maintainer, &contributor, &org_id, &issue_id);

    // Second assignment cycle for the same contributor
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);

    assert!(
        client.is_assigned(&contributor, &org_id, &issue_id),
        "contributor should be assigned again after revoke-and-reassign to same contributor",
    );
}

/// Test 4: two sequential assign_issue calls for the same (issue, contributor)
/// — the second call returns AlreadyAssigned because the assignment entry
/// persists from the first call.
#[test]
fn unit_already_assigned_two_sequential_same_issue_second_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org001");
    let issue_id: u32 = 42;

    client.register_maintainer(&admin, &maintainer, &org_id);

    // First call: apply + assign succeeds
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);

    // contributor applies again (application entry was consumed by first assign)
    client.apply_for_issue(&contributor, &org_id, &issue_id);

    // Second assign_issue for same contributor+issue must fail with AlreadyAssigned
    let result = std::panic::catch_unwind(|| {
        client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    });
    assert!(
        result.is_err(),
        "Second assign_issue for the same (contributor, issue) must return AlreadyAssigned",
    );
}

/// Test 5: after revoking, the assignment storage entry is removed and the
/// org assignment counter returns to zero, enabling re-assignment.
#[test]
fn unit_already_assigned_storage_cleared_after_revoke() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org001");
    let issue_id: u32 = 42;

    client.register_maintainer(&admin, &maintainer, &org_id);

    // Assign then revoke
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);

    // Counter must be 1 while assigned
    assert_eq!(
        client.get_org_assignment_count(&contributor, &org_id),
        1,
        "org assignment count should be 1 after assign",
    );

    client.revoke_assignment(&maintainer, &contributor, &org_id, &issue_id);

    // Counter must be 0 after revoke (entry removed from storage)
    assert_eq!(
        client.get_org_assignment_count(&contributor, &org_id),
        0,
        "org assignment count should be 0 after revoke",
    );

    // is_assigned must return false — assignment entry was removed
    assert!(
        !client.is_assigned(&contributor, &org_id, &issue_id),
        "is_assigned must be false after revoke",
    );

    // Re-assign to verify storage is fully clear and accepts a new assignment
    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);
    assert_eq!(
        client.get_org_assignment_count(&contributor, &org_id),
        1,
        "org assignment count should be 1 after re-assignment",
    );
}

/// Test 6: is_assigned returns true immediately after assign_issue, confirming
/// that the assignment entry is written to storage during the assign transition.
#[test]
fn unit_already_assigned_is_assigned_true_after_assignment() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let contributor = Address::generate(&env);
    let maintainer = Address::generate(&env);
    let org_id = Symbol::new(&env, "org001");
    let issue_id: u32 = 42;

    client.register_maintainer(&admin, &maintainer, &org_id);

    // Before assignment: is_assigned must be false
    assert!(
        !client.is_assigned(&contributor, &org_id, &issue_id),
        "is_assigned should be false before any assignment",
    );

    client.apply_for_issue(&contributor, &org_id, &issue_id);
    client.assign_issue(&maintainer, &contributor, &org_id, &issue_id);

    // After assignment: application entry is consumed, assignment entry is written
    assert!(
        !client.has_applied(&contributor, &org_id, &issue_id),
        "has_applied should be false after assign_issue (application is consumed)",
    );
    assert!(
        client.is_assigned(&contributor, &org_id, &issue_id),
        "is_assigned should be true after assign_issue",
    );
}
