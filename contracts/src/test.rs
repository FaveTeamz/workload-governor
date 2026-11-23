#![cfg(test)]
use super::*;
use soroban_sdk::{Env, Address, Symbol, Vec};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

fn make_org(env: &Env, org_id: &Symbol, issue_ids: &[u32]) -> () {
    let org_key = WorkloadGovernor::org_key(org_id.clone());
    let org = Organization {
        name: org_id.clone(),
        issue_count: issue_ids.len() as u32,
        total_applications: 0,
    };
    env.storage().set(&org_key, &org);
    for &id in issue_ids {
        let issue_key = WorkloadGovernor::issue_key(org_id.clone(), id);
        env.storage().set(&issue_key, &true);
    }
}

// ---------------------------------------------------------------------------
// Pre-existing tests
// ---------------------------------------------------------------------------

#[test]
fn test_single_apply() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    make_org(&env, &org_id, &[1]);

    let result = WorkloadGovernor::apply(
        env.clone(),
        contributor.clone(),
        org_id,
        1,
    );

    assert!(result.is_ok());

    let app = WorkloadGovernor::get_application(env, contributor, 1);
    assert!(app.is_some());
}

#[test]
fn test_batch_apply_success() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    make_org(&env, &org_id, &[1, 2, 3, 4, 5]);

    let mut issue_ids = Vec::new(&env);
    for i in 1u32..=5 {
        issue_ids.push_back(i);
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

    make_org(&env, &org_id, &[1]);

    let mut issue_ids = Vec::new(&env);
    issue_ids.push_back(1u32);
    issue_ids.push_back(1u32); // intra-batch duplicate
    issue_ids.push_back(2u32); // issue doesn't exist → skipped

    let result = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_id,
        issue_ids,
    );

    assert!(result.is_ok());
    let applied = result.unwrap();
    assert_eq!(applied.len(), 1);
}

#[test]
fn test_batch_apply_cap() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "test_org");

    let ids: Vec<u32> = (1u32..=20).collect();
    make_org(&env, &org_id, ids.as_slice());

    let mut issue_ids = Vec::new(&env);
    for i in 1u32..=20 {
        issue_ids.push_back(i);
    }

    let result = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_id,
        issue_ids,
    );

    assert!(result.is_ok());
    let applied = result.unwrap();
    assert_eq!(applied.len(), 15, "global cap is 15");
}

#[test]
fn test_batch_apply_too_large() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "nonexistent_org");

    let mut issue_ids = Vec::new(&env);
    for i in 1u32..=20 {
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
    issue_ids.push_back(1u32);

    let result = WorkloadGovernor::batch_apply(
        env,
        contributor,
        org_id,
        issue_ids,
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), ApplicationError::OrganizationNotFound);
}

// ---------------------------------------------------------------------------
// #827 SC-002 — Cross-org duplicate detection
// ---------------------------------------------------------------------------

/// A contributor applies for issue #1 under org-A, then attempts to apply for
/// the same issue #1 under org-B in a separate batch_apply call.  The second
/// call must skip issue #1 and NOT increment the applied count.
#[test]
fn test_sc002_cross_org_duplicate_skipped() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_a = Symbol::from_str(&env, "org_a");
    let org_b = Symbol::from_str(&env, "org_b");

    make_org(&env, &org_a, &[1, 2]);
    make_org(&env, &org_b, &[1, 3]); // issue 1 is shared across orgs

    // Apply for issue 1 under org-A
    let mut ids_a = Vec::new(&env);
    ids_a.push_back(1u32);
    let result_a = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_a,
        ids_a,
    );
    assert!(result_a.is_ok());
    let applied_a = result_a.unwrap();
    assert_eq!(applied_a.len(), 1, "should apply issue 1 under org-A");

    // Now apply for issue 1 under org-B — must be skipped as cross-org duplicate
    let mut ids_b = Vec::new(&env);
    ids_b.push_back(1u32);
    ids_b.push_back(3u32); // issue 3 is unique to org-B
    let result_b = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_b,
        ids_b,
    );
    assert!(result_b.is_ok());
    let applied_b = result_b.unwrap();
    // Only issue 3 should be applied; issue 1 is a cross-org duplicate and skipped
    assert_eq!(applied_b.len(), 1, "cross-org duplicate issue 1 must be skipped");
    assert_eq!(applied_b.get(0).unwrap(), 3u32, "only unique issue 3 applied");
}

/// The applied count must NOT be incremented for cross-org duplicate entries.
#[test]
fn test_sc002_cross_org_duplicate_count_not_incremented() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_a = Symbol::from_str(&env, "org_a");
    let org_b = Symbol::from_str(&env, "org_b");

    make_org(&env, &org_a, &[10]);
    make_org(&env, &org_b, &[10]);

    // First application under org-A
    let mut ids_a = Vec::new(&env);
    ids_a.push_back(10u32);
    let r = WorkloadGovernor::batch_apply(env.clone(), contributor.clone(), org_a, ids_a);
    assert_eq!(r.unwrap().len(), 1);

    // Attempt under org-B — must return 0 applied (issue 10 is a cross-org dup)
    let mut ids_b = Vec::new(&env);
    ids_b.push_back(10u32);
    let r2 = WorkloadGovernor::batch_apply(env.clone(), contributor.clone(), org_b, ids_b);
    assert!(r2.is_ok());
    let applied_b = r2.unwrap();
    assert_eq!(
        applied_b.len(), 0,
        "cross-org duplicate must yield 0 applied and must not increment the count"
    );
}

/// A batch containing a cross-org duplicate mixed with unique issues should
/// cleanly skip only the duplicate, not the entire batch.
#[test]
fn test_sc002_partial_batch_with_cross_org_duplicate() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_a = Symbol::from_str(&env, "org_a");
    let org_b = Symbol::from_str(&env, "org_b");

    make_org(&env, &org_a, &[5]);
    make_org(&env, &org_b, &[5, 6, 7]);

    // Apply issue 5 under org-A first
    let mut ids_a = Vec::new(&env);
    ids_a.push_back(5u32);
    WorkloadGovernor::batch_apply(env.clone(), contributor.clone(), org_a, ids_a).unwrap();

    // Batch under org-B: [5 (cross-org dup), 6, 7]
    let mut ids_b = Vec::new(&env);
    ids_b.push_back(5u32); // duplicate
    ids_b.push_back(6u32); // unique
    ids_b.push_back(7u32); // unique
    let result = WorkloadGovernor::batch_apply(env.clone(), contributor.clone(), org_b, ids_b);
    assert!(result.is_ok());
    let applied = result.unwrap();
    assert_eq!(applied.len(), 2, "only issues 6 and 7 should be applied");
    assert!(applied.contains(&6u32));
    assert!(applied.contains(&7u32));
    assert!(!applied.contains(&5u32), "issue 5 must be excluded as cross-org duplicate");
}

/// Events must be emitted only for distinct applied issues — no event for skipped
/// cross-org duplicates.
#[test]
fn test_sc002_no_event_for_cross_org_duplicate() {
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_a = Symbol::from_str(&env, "org_a");
    let org_b = Symbol::from_str(&env, "org_b");

    make_org(&env, &org_a, &[99]);
    make_org(&env, &org_b, &[99]);

    let mut ids_a = Vec::new(&env);
    ids_a.push_back(99u32);
    WorkloadGovernor::batch_apply(env.clone(), contributor.clone(), org_a.clone(), ids_a).unwrap();

    let events_after_first = env.events().all().len();

    // Attempt the same issue under org-B — should emit 0 new events
    let mut ids_b = Vec::new(&env);
    ids_b.push_back(99u32);
    WorkloadGovernor::batch_apply(env.clone(), contributor.clone(), org_b, ids_b).unwrap();

    let events_after_second = env.events().all().len();
    assert_eq!(
        events_after_second, events_after_first,
        "no new ApplicationSubmitted event must be emitted for a cross-org duplicate"
    );
}
