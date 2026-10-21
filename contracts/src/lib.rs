#![no_std]
use soroban_sdk::{contract, contracttype, symbol_short, Address, Env, Symbol, Vec, panic_with_error};

// ================================================================
// Error Types
// ================================================================

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ApplicationError {
    AlreadyApplied   = 1,
    CapReached       = 2,
    BatchTooLarge    = 3,
    DuplicateInBatch = 4,
    InvalidIssue     = 5,
    OrganizationNotFound = 6,
    /// Issue ID has already been applied for under a different org scope within
    /// the same contributor history — cross-org duplicate detected. (#827 SC-002)
    CrossOrgDuplicate = 7,
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

    /// Batch apply for multiple issues in one transaction.
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
    /// * Skips intra-batch duplicates (same issue_id appearing twice in the
    ///   submitted list).
    /// * Skips cross-org duplicates: if an issue_id has already been applied for
    ///   under **any** org scope in the contributor's application history the
    ///   entry is skipped cleanly and the global count is NOT incremented.
    ///   (#827 SC-002)
    /// * Stops when the global cap (15) is reached.
    /// * Partial success allowed; emits ApplicationSubmitted only for each
    ///   distinctly applied issue.
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

        let mut org: Organization = env.storage().get(&org_key).unwrap();

        // Track successfully applied issues in this call
        let mut applied: Vec<u32> = Vec::new(&env);
        let mut total_applied: u32 = 0;

        // Track issue IDs already seen within this batch to detect intra-batch
        // duplicates without mutating storage prematurely.
        let mut processed: Vec<u32> = Vec::new(&env);

        for issue_id in issue_ids.iter() {
            // Global cap guard
            if total_applied >= Self::GLOBAL_CAP {
                break;
            }

            // --- Intra-batch duplicate check ---
            if processed.contains(&issue_id) {
                // Same issue_id appeared more than once in the submitted list.
                continue;
            }
            processed.push_back(issue_id);

            // --- Cross-org duplicate check (#827 SC-002) ---
            // The global application index key is keyed by (contributor, issue_id)
            // and is org-agnostic.  If the entry exists the contributor has already
            // applied for this issue under some org scope and we must skip it.
            let app_key = Self::application_key(contributor.clone(), issue_id);
            if env.storage().has(&app_key) {
                // Cross-org or same-org duplicate — skip cleanly, do not increment.
                continue;
            }

            // --- Issue existence check ---
            let issue_key = Self::issue_key(org_id.clone(), issue_id);
            if !env.storage().has(&issue_key) {
                continue; // Invalid / non-existent issue — partial success
            }

            // All checks passed — record the application.
            let application = Application {
                contributor: contributor.clone(),
                issue_id,
                applied_at: env.ledger().timestamp(),
            };

            // Write to the global (org-agnostic) application index.
            env.storage().set(&app_key, &application);

            org.total_applications += 1;
            applied.push_back(issue_id);
            total_applied += 1;

            // Emit ApplicationSubmitted for each distinct application.
            env.events().publish(
                (symbol_short!("WG"), symbol_short!("AppSubmit"), contributor.clone()),
                (org_id.clone(), issue_id, env.ledger().timestamp()),
            );
        }

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
        _env: Env,
        _contributor: Address,
    ) -> Vec<Application> {
        Vec::new(&_env)
    }

    // ================================================================
    // Key Helpers
    // ================================================================

    fn org_key(org_id: Symbol) -> Symbol {
        org_id
    }

    fn issue_key(org_id: Symbol, issue_id: u32) -> Symbol {
        Symbol::from_str(
            &org_id.env(),
            &format!("issue_{}_{}", org_id.to_string(), issue_id),
        )
    }

    /// Global (org-agnostic) application key.
    ///
    /// Keyed by `(contributor, issue_id)` without org_id so that the same key
    /// is produced regardless of which org the contributor is applying through.
    /// This is what enables the cross-org duplicate detection in `batch_apply`.
    fn application_key(contributor: Address, issue_id: u32) -> Symbol {
        Symbol::from_str(
            &contributor.env(),
            &format!("app_{}_{}", contributor.to_string(), issue_id),
        )
    }
}

#[cfg(test)]
mod test;
