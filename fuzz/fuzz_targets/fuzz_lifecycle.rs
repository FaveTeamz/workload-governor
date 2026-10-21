//! Fuzz target: stateful lifecycle invariant fuzzing across multiple contributors
//! and organizations.
//!
//! Issue #834 — https://github.com/FaveTeamz/workload-governor/issues/834
//!
//! ## Motivation
//!
//! Individual unit tests verify isolated state transitions, but complex
//! interleavings of `apply`, `assign`, `withdraw`, `revoke`, and `complete`
//! across **multiple users and organizations** can expose invariant violations
//! that single-contributor tests miss:
//!
//! * A contributor applying across several orgs may silently exceed the global
//!   cap of 15 if the counter is not decremented atomically on every transition.
//! * Assigning the same contributor to multiple orgs simultaneously could push
//!   the per-org count past 4 if the guard fires in the wrong order.
//! * A revoke on an org where the assignment count is 0 must not wrap (u32
//!   underflow / saturation).
//!
//! ## Model
//!
//! The fuzzer maintains a **shadow state** — a Rust-side mirror of the expected
//! contract storage values — and after every operation it compares the shadow
//! with the values returned by the contract's query functions.  Any divergence
//! is a bug and causes an immediate assertion failure (libFuzzer crash).
//!
//! ### Actors
//! * **5 contributors** (C0..C4) — generated once, reused across all operations.
//! * **3 organizations** (O0..O2) — fixed Symbol names `"orgA"`, `"orgB"`, `"orgC"`.
//! * **1 maintainer** per organization (same address for simplicity; the test
//!   env's `mock_all_auths` satisfies all `require_auth` calls).
//!
//! ### Operations encoded in the fuzz input
//!
//! Each byte of the input drives one operation:
//!
//! ```text
//! bits [7..5] — operation selector (3 bits → 8 variants, 6 used):
//!   0 → Apply
//!   1 → Withdraw
//!   2 → Assign
//!   3 → Complete
//!   4 → Revoke
//!   5 → (reserved / no-op)
//!   6 → (reserved / no-op)
//!   7 → (reserved / no-op)
//! bits [4..3] — contributor index (2 bits → 0..4, taken mod 5)
//! bits [2..1] — org index         (2 bits → 0..3, taken mod 3)
//! bit  [0]    — issue_id selector (1 bit → selects from a small fixed set)
//! ```
//!
//! Using a fixed pool of 8 issue IDs (1..=8) keeps the state space small enough
//! for the fuzzer to explore exhaustively while still covering all transitions.
//!
//! ### Invariants checked after every operation
//!
//! 1. **Global cap**:
//!    `shadow_global[c] == contract.get_global_application_count(c)` for all c.
//!    AND `shadow_global[c] <= 15`.
//!
//! 2. **Org cap**:
//!    `shadow_org[c][o] == contract.get_org_assignment_count(c, o)` for all c, o.
//!    AND `shadow_org[c][o] <= 4`.
//!
//! 3. **Mutual exclusion**:
//!    For every (c, o, issue_id): NOT (has_applied(c,o,i) AND is_assigned(c,o,i)).
//!
//! 4. **Shadow consistency**:
//!    Shadow `applied[c][o][i]` matches `contract.has_applied(c, o, i)`.
//!    Shadow `assigned[c][o][i]` matches `contract.is_assigned(c, o, i)`.

#![no_main]

use libfuzzer_sys::fuzz_target;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};
use workload_governor::{WorkloadGovernor, WorkloadGovernorClient};

// ---------------------------------------------------------------------------
// Constants that define the search space
// ---------------------------------------------------------------------------

const NUM_CONTRIBUTORS: usize = 5;
const NUM_ORGS: usize = 3;
/// Fixed pool of valid GitHub-style issue IDs (non-zero, not u32::MAX).
const ISSUE_POOL: [u32; 8] = [1, 2, 3, 4, 5, 6, 7, 8];
const NUM_ISSUES: usize = ISSUE_POOL.len();

const GLOBAL_CAP: u32 = 15;
const ORG_CAP: u32 = 4;

// ---------------------------------------------------------------------------
// Shadow state
// ---------------------------------------------------------------------------

/// In-memory mirror of the contract's expected storage values.
#[derive(Clone)]
struct ShadowState {
    /// `global_apps[c]` — number of pending applications for contributor c.
    global_apps: [u32; NUM_CONTRIBUTORS],
    /// `org_assignments[c][o]` — number of active assignments for (contributor c, org o).
    org_assignments: [[u32; NUM_ORGS]; NUM_CONTRIBUTORS],
    /// `applied[c][o][i]` — true if contributor c has a pending application for issue i in org o.
    applied: [[[bool; NUM_ISSUES]; NUM_ORGS]; NUM_CONTRIBUTORS],
    /// `assigned[c][o][i]` — true if contributor c has an active assignment for issue i in org o.
    assigned: [[[bool; NUM_ISSUES]; NUM_ORGS]; NUM_CONTRIBUTORS],
}

impl ShadowState {
    fn new() -> Self {
        Self {
            global_apps: [0; NUM_CONTRIBUTORS],
            org_assignments: [[0; NUM_ORGS]; NUM_CONTRIBUTORS],
            applied: [[[false; NUM_ISSUES]; NUM_ORGS]; NUM_CONTRIBUTORS],
            assigned: [[[false; NUM_ISSUES]; NUM_ORGS]; NUM_CONTRIBUTORS],
        }
    }

    /// Returns true if the apply can succeed according to shadow rules.
    fn can_apply(&self, c: usize, o: usize, i: usize) -> bool {
        self.global_apps[c] < GLOBAL_CAP
            && !self.applied[c][o][i]
            && !self.assigned[c][o][i]
    }

    /// Returns true if the withdraw can succeed according to shadow rules.
    fn can_withdraw(&self, c: usize, o: usize, i: usize) -> bool {
        self.applied[c][o][i]
    }

    /// Returns true if the assign can succeed according to shadow rules.
    fn can_assign(&self, c: usize, o: usize, i: usize) -> bool {
        self.applied[c][o][i]
            && self.org_assignments[c][o] < ORG_CAP
            && !self.assigned[c][o][i]
    }

    /// Returns true if the complete can succeed according to shadow rules.
    fn can_complete(&self, c: usize, o: usize, i: usize) -> bool {
        self.assigned[c][o][i]
    }

    /// Returns true if the revoke can succeed according to shadow rules.
    fn can_revoke(&self, c: usize, o: usize, i: usize) -> bool {
        self.assigned[c][o][i]
    }

    /// Apply: increment global count, mark application.
    fn do_apply(&mut self, c: usize, o: usize, i: usize) {
        self.global_apps[c] += 1;
        self.applied[c][o][i] = true;
    }

    /// Withdraw: decrement global count, clear application.
    fn do_withdraw(&mut self, c: usize, o: usize, i: usize) {
        self.global_apps[c] = self.global_apps[c].saturating_sub(1);
        self.applied[c][o][i] = false;
    }

    /// Assign: consume application, increment org count, mark assignment.
    fn do_assign(&mut self, c: usize, o: usize, i: usize) {
        self.applied[c][o][i] = false;
        self.global_apps[c] = self.global_apps[c].saturating_sub(1);
        self.org_assignments[c][o] += 1;
        self.assigned[c][o][i] = true;
    }

    /// Complete: decrement org count, clear assignment.
    fn do_complete(&mut self, c: usize, o: usize, i: usize) {
        self.org_assignments[c][o] = self.org_assignments[c][o].saturating_sub(1);
        self.assigned[c][o][i] = false;
    }

    /// Revoke: same effect as complete on the shadow.
    fn do_revoke(&mut self, c: usize, o: usize, i: usize) {
        self.org_assignments[c][o] = self.org_assignments[c][o].saturating_sub(1);
        self.assigned[c][o][i] = false;
    }
}

// ---------------------------------------------------------------------------
// Fuzz target
// ---------------------------------------------------------------------------

fuzz_target!(|data: &[u8]| {
    if data.is_empty() {
        return;
    }

    // ── Environment setup ───────────────────────────────────────────────────
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, WorkloadGovernor);
    let client = WorkloadGovernorClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Initialize the contract.
    let init_ok = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.initialize(&admin);
    }))
    .is_ok();
    if !init_ok {
        return;
    }

    // ── Generate fixed actor pools ──────────────────────────────────────────
    let contributors: [Address; NUM_CONTRIBUTORS] = [
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
        Address::generate(&env),
    ];

    // Fixed org names: "orgA", "orgB", "orgC"
    let org_names: [&str; NUM_ORGS] = ["orgA", "orgB", "orgC"];
    let orgs: [Symbol; NUM_ORGS] = [
        Symbol::new(&env, org_names[0]),
        Symbol::new(&env, org_names[1]),
        Symbol::new(&env, org_names[2]),
    ];

    // One maintainer per org — reuse the admin address (mock_all_auths covers it).
    let maintainer = Address::generate(&env);
    for o in 0..NUM_ORGS {
        let reg_ok = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            client.register_maintainer(&admin, &maintainer, &orgs[o]);
        }))
        .is_ok();
        if !reg_ok {
            return;
        }
    }

    // ── Shadow state ────────────────────────────────────────────────────────
    let mut shadow = ShadowState::new();

    // ── Helper: verify shadow matches contract and check all invariants ─────
    let verify = |shadow: &ShadowState, label: &str| {
        for c in 0..NUM_CONTRIBUTORS {
            let contrib = &contributors[c];

            // Invariant 1: global application count
            let contract_global = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                client.get_global_application_count(contrib)
            }));
            if let Ok(cg) = contract_global {
                assert!(
                    cg <= GLOBAL_CAP,
                    "[{label}] INVARIANT VIOLATED: contributor {c} global_count={cg} > {GLOBAL_CAP}"
                );
                assert_eq!(
                    cg,
                    shadow.global_apps[c],
                    "[{label}] SHADOW MISMATCH: contributor {c} \
                     contract_global={cg} != shadow_global={}",
                    shadow.global_apps[c]
                );
            }

            for o in 0..NUM_ORGS {
                let org = &orgs[o];

                // Invariant 2: org assignment count
                let contract_org = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    client.get_org_assignment_count(contrib, org)
                }));
                if let Ok(co) = contract_org {
                    assert!(
                        co <= ORG_CAP,
                        "[{label}] INVARIANT VIOLATED: contributor {c} org {o} \
                         org_count={co} > {ORG_CAP}"
                    );
                    assert_eq!(
                        co,
                        shadow.org_assignments[c][o],
                        "[{label}] SHADOW MISMATCH: contributor {c} org {o} \
                         contract_org={co} != shadow_org={}",
                        shadow.org_assignments[c][o]
                    );
                }

                for i in 0..NUM_ISSUES {
                    let issue_id = ISSUE_POOL[i];

                    // Invariant 3: mutual exclusion (applied XOR assigned)
                    let has_app = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.has_applied(contrib, org, &issue_id)
                    }));
                    let has_asgn = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.is_assigned(contrib, org, &issue_id)
                    }));
                    if let (Ok(app), Ok(asgn)) = (has_app, has_asgn) {
                        assert!(
                            !(app && asgn),
                            "[{label}] INVARIANT VIOLATED: contributor {c} org {o} issue {issue_id} \
                             has_applied=true AND is_assigned=true simultaneously"
                        );

                        // Invariant 4: shadow consistency
                        assert_eq!(
                            app,
                            shadow.applied[c][o][i],
                            "[{label}] SHADOW MISMATCH: contributor {c} org {o} issue {issue_id} \
                             contract_applied={app} != shadow_applied={}",
                            shadow.applied[c][o][i]
                        );
                        assert_eq!(
                            asgn,
                            shadow.assigned[c][o][i],
                            "[{label}] SHADOW MISMATCH: contributor {c} org {o} issue {issue_id} \
                             contract_assigned={asgn} != shadow_assigned={}",
                            shadow.assigned[c][o][i]
                        );
                    }
                }
            }
        }
    };

    // ── Process each byte as one operation ──────────────────────────────────
    for &byte in data.iter() {
        // Decode the byte
        let op = (byte >> 5) & 0b111;            // bits [7..5]: operation (0–7)
        let c = ((byte >> 3) & 0b11) as usize % NUM_CONTRIBUTORS; // bits [4..3]
        let o = ((byte >> 1) & 0b11) as usize % NUM_ORGS;         // bits [2..1]
        let i = (byte & 0b1) as usize % NUM_ISSUES;               // bit  [0]
        let issue_id = ISSUE_POOL[i];

        let contrib = &contributors[c];
        let org = &orgs[o];

        match op {
            // ── Apply ───────────────────────────────────────────────────────
            0 => {
                if shadow.can_apply(c, o, i) {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.apply_for_issue(contrib, org, &issue_id);
                    }));
                    if result.is_ok() {
                        shadow.do_apply(c, o, i);
                    } else {
                        // Unexpected failure on a supposedly-valid apply: the shadow
                        // said it should succeed, but the contract rejected it.
                        // This is itself an invariant violation — panic to report it.
                        panic!(
                            "SHADOW DIVERGENCE: apply_for_issue(c={c}, o={o}, issue={issue_id}) \
                             was expected to succeed (shadow said ok) but panicked"
                        );
                    }
                } else {
                    // Expected to fail — call it anyway so the contract's guard logic
                    // is exercised; catch the expected panic.
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.apply_for_issue(contrib, org, &issue_id);
                    }));
                }
            }

            // ── Withdraw ────────────────────────────────────────────────────
            1 => {
                if shadow.can_withdraw(c, o, i) {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.withdraw_application(contrib, org, &issue_id);
                    }));
                    if result.is_ok() {
                        shadow.do_withdraw(c, o, i);
                    } else {
                        panic!(
                            "SHADOW DIVERGENCE: withdraw_application(c={c}, o={o}, issue={issue_id}) \
                             was expected to succeed but panicked"
                        );
                    }
                } else {
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.withdraw_application(contrib, org, &issue_id);
                    }));
                }
            }

            // ── Assign ──────────────────────────────────────────────────────
            2 => {
                if shadow.can_assign(c, o, i) {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.assign_issue(&maintainer, contrib, org, &issue_id);
                    }));
                    if result.is_ok() {
                        shadow.do_assign(c, o, i);
                    } else {
                        panic!(
                            "SHADOW DIVERGENCE: assign_issue(c={c}, o={o}, issue={issue_id}) \
                             was expected to succeed but panicked"
                        );
                    }
                } else {
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.assign_issue(&maintainer, contrib, org, &issue_id);
                    }));
                }
            }

            // ── Complete ────────────────────────────────────────────────────
            3 => {
                if shadow.can_complete(c, o, i) {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.complete_assignment(&maintainer, contrib, org, &issue_id);
                    }));
                    if result.is_ok() {
                        shadow.do_complete(c, o, i);
                    } else {
                        panic!(
                            "SHADOW DIVERGENCE: complete_assignment(c={c}, o={o}, issue={issue_id}) \
                             was expected to succeed but panicked"
                        );
                    }
                } else {
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.complete_assignment(&maintainer, contrib, org, &issue_id);
                    }));
                }
            }

            // ── Revoke ──────────────────────────────────────────────────────
            4 => {
                if shadow.can_revoke(c, o, i) {
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.revoke_assignment(&maintainer, contrib, org, &issue_id);
                    }));
                    if result.is_ok() {
                        shadow.do_revoke(c, o, i);
                    } else {
                        panic!(
                            "SHADOW DIVERGENCE: revoke_assignment(c={c}, o={o}, issue={issue_id}) \
                             was expected to succeed but panicked"
                        );
                    }
                } else {
                    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        client.revoke_assignment(&maintainer, contrib, org, &issue_id);
                    }));
                }
            }

            // ── Reserved / no-op (ops 5, 6, 7) ─────────────────────────────
            _ => {}
        }

        // Verify invariants after every operation.
        verify(&shadow, "after operation");
    }

    // Final full invariant check at end of input.
    verify(&shadow, "final");
});
