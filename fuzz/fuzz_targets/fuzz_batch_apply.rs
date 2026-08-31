#![no_main]
use libfuzzer_sys::fuzz_target;
use soroban_sdk::{Env, Address, Symbol, Vec};
use workload_governor::{WorkloadGovernor, Organization, ApplicationError};

fuzz_target!(|data: (Vec<u32>, u8)| {
    let (issue_ids, cap) = data;
    
    // Limit cap to 0-30
    let cap = cap % 30;
    
    let env = Env::default();
    let contributor = Address::random(&env);
    let org_id = Symbol::from_str(&env, "fuzz_org");

    // Initialize organization
    let org_key = WorkloadGovernor::org_key(org_id.clone());
    let org = Organization {
        name: org_id.clone(),
        issue_count: 50,
        total_applications: 0,
    };
    env.storage().set(&org_key, &org);

    // Initialize issues (up to 50)
    let mut valid_issue_ids = Vec::new(&env);
    for id in issue_ids.iter() {
        let issue_id = id % 50; // Keep within 0-49
        let issue_key = WorkloadGovernor::issue_key(org_id.clone(), issue_id);
        env.storage().set(&issue_key, &true);
        valid_issue_ids.push_back(issue_id);
    }

    // Fuzz the batch_apply function
    let result = WorkloadGovernor::batch_apply(
        env.clone(),
        contributor.clone(),
        org_id,
        valid_issue_ids,
    );

    // Verify the result
    if let Ok(applied) = result {
        // Applied should not exceed 15 (global cap)
        assert!(applied.len() <= 15);
        
        // Applied should not exceed input size
        assert!(applied.len() <= valid_issue_ids.len());
        
        // All applied IDs should be unique
        let mut unique_check = Vec::new(&env);
        for id in applied.iter() {
            assert!(!unique_check.contains(&id));
            unique_check.push_back(id);
        }
    }
});
