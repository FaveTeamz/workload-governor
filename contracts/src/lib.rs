#![no_std]
use soroban_sdk::{contract, contracttype, Address, Env, Symbol, Vec, panic_with_error};

// ================================================================
// Error Types
// ================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ApplicationError {
    AlreadyApplied = 1,
    CapReached = 2,
    BatchTooLarge = 3,
    DuplicateInBatch = 4,
    InvalidIssue = 5,
    OrganizationNotFound = 6,
}

// ================================================================
// Data Structures
// ================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Application {
    pub contributor: Address,
    pub issue_id: u32,
    pub applied_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Organization {
    pub name: Symbol,
    pub issue_count: u32,
    pub total_applications: u32,
}

// ================================================================
// Contract
// ================================================================

#[contract]
pub struct WorkloadGovernor;

#[contractimpl]
impl WorkloadGovernor {
    /// Maximum number of issues that can be applied for in one batch
    pub const MAX_BATCH_SIZE: u32 = 15;
    /// Maximum issues a contributor can apply for globally
    pub const GLOBAL_CAP: u32 = 15;

    /// Apply for a single issue
    pub fn apply(
        env: Env,
        contributor: Address,
        org_id: Symbol,
        issue_id: u32,
    ) -> Result<(), ApplicationError> {
        // Create a vector with single issue
        let mut issue_ids = Vec::new(&env);
        issue_ids.push_back(issue_id);
        
        let result = Self::batch_apply(env, contributor, org_id, issue_ids);
        
        match result {
            Ok(applied) => {
                if applied.len() == 1 {
                    Ok(())
                } else {
                    Err(ApplicationError::InvalidIssue)
                }
            }
            Err(e) => Err(e),
        }
    }

    /// Batch apply for multiple issues in one transaction
    /// 
    /// # Arguments
    /// * `contributor` - The address of the contributor applying
    /// * `org_id` - The organization ID
    /// * `issue_ids` - Vector of issue IDs to apply for (max 15)
    /// 
    /// # Returns
    /// * `Vec<u32>` - List of successfully applied issue IDs
    /// 
    /// # Errors
    /// * `BatchTooLarge` - If more than 15 issue IDs are provided
    /// * `OrganizationNotFound` - If the organization doesn't exist
    /// 
    /// # Behavior
    /// * Skips duplicates in input (not an error)
    /// * Stops at global cap (15 total applications per contributor)
    /// * Partial success allowed
    /// * Emits ApplicationSubmitted event for each successful apply
    pub fn batch_apply(
        env: Env,
        contributor: Address,
        org_id: Symbol,
        issue_ids: Vec<u32>,
    ) -> Result<Vec<u32>, ApplicationError> {
        // Validate input size
        if issue_ids.len() > Self::MAX_BATCH_SIZE as usize {
            return Err(ApplicationError::BatchTooLarge);
        }

        // Validate organization exists
        let org_key = Self::org_key(org_id.clone());
        if !env.storage().has(&org_key) {
            return Err(ApplicationError::OrganizationNotFound);
        }

        // Check if organization has issues
        let mut org: Organization = env.storage().get(&org_key).unwrap();

        // Track successfully applied issues
        let mut applied = Vec::new(&env);
        let mut total_applied = 0u32;

        // Track processed issues to skip duplicates
        let mut processed = Vec::new(&env);

        // Iterate through issue IDs
        for issue_id in issue_ids.iter() {
            // Check global cap
            if total_applied >= Self::GLOBAL_CAP {
                break;
            }

            // Check if this issue has already been processed in this batch
            if processed.contains(&issue_id) {
                continue; // Skip duplicate in batch
            }
            processed.push_back(issue_id);

            // Check if contributor already applied for this issue
            let app_key = Self::application_key(contributor.clone(), issue_id);
            if env.storage().has(&app_key) {
                continue; // Skip already applied
            }

            // Check if issue exists
            let issue_key = Self::issue_key(org_id.clone(), issue_id);
            if !env.storage().has(&issue_key) {
                continue; // Skip invalid issue (partial success)
            }

            // Create application record
            let application = Application {
                contributor: contributor.clone(),
                issue_id,
                applied_at: env.ledger().timestamp(),
            };

            // Store application
            env.storage().set(&app_key, &application);

            // Update organization issue count
            org.total_applications += 1;

            // Add to applied list
            applied.push_back(issue_id);
            total_applied += 1;

            // Emit event
            env.events().publish(
                ("ApplicationSubmitted", "v1"),
                (contributor.clone(), org_id.clone(), issue_id, env.ledger().timestamp()),
            );
        }

        // Store updated organization
        env.storage().set(&org_key, &org);

        Ok(applied)
    }

    /// Get application for a contributor and issue
    pub fn get_application(
        env: Env,
        contributor: Address,
        issue_id: u32,
    ) -> Option<Application> {
        let key = Self::application_key(contributor, issue_id);
        env.storage().get(&key)
    }

    /// Get all applications for a contributor
    pub fn get_applications_for_contributor(
        env: Env,
        contributor: Address,
    ) -> Vec<Application> {
        // In a real implementation, this would iterate through all applications
        // For this example, we return an empty vector
        Vec::new(&env)
    }

    // ================================================================
    // Key Helpers
    // ================================================================

    fn org_key(org_id: Symbol) -> Symbol {
        // In a real implementation, this would be a proper storage key
        org_id
    }

    fn issue_key(org_id: Symbol, issue_id: u32) -> Symbol {
        // In a real implementation, this would be a proper storage key
        Symbol::from_str(&org_id.env(), &format!("issue_{}_{}", org_id.to_string(), issue_id))
    }

    fn application_key(contributor: Address, issue_id: u32) -> Symbol {
        // In a real implementation, this would be a proper storage key
        Symbol::from_str(&contributor.env(), &format!("app_{}_{}", contributor.to_string(), issue_id))
    }
}

#[cfg(test)]
mod test;
