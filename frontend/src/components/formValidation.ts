/**
 * Validation utilities for WorkloadGovernor transaction forms (closes #644).
 * All validators are pure functions so they are easy to unit test.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FieldError {
  /** Human-readable error message */
  message: string
}

/** Validation result: null = valid, FieldError = invalid */
export type ValidationResult = FieldError | null

// ─── Stellar public key ───────────────────────────────────────────────────────

/** Stellar public keys are 56-character base32 strings starting with 'G' */
const STELLAR_PK_RE = /^G[A-Z2-7]{55}$/

export function validateStellarAddress(value: string): ValidationResult {
  const v = value.trim()
  if (!v) return { message: 'Contributor address is required.' }
  if (!STELLAR_PK_RE.test(v)) {
    return { message: 'Address must be a valid Stellar public key (starts with G, 56 characters).' }
  }
  return null
}

// ─── Issue ID ─────────────────────────────────────────────────────────────────

export function validateIssueId(value: string): ValidationResult {
  const v = value.trim()
  if (!v) return { message: 'Issue ID is required.' }
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) {
    return { message: 'Issue ID must be a positive integer.' }
  }
  return null
}

export function validateIssueIdNotApplied(
  value: string,
  appliedIds: Set<string>
): ValidationResult {
  const base = validateIssueId(value)
  if (base) return base
  if (appliedIds.has(value.trim())) {
    return { message: 'You have already applied for this issue.' }
  }
  return null
}

// ─── Org ID ───────────────────────────────────────────────────────────────────

export function validateOrgId(value: string): ValidationResult {
  const v = value.trim()
  if (!v) return { message: 'Organisation ID is required.' }
  return null
}

export function validateOrgIdRegistered(
  value: string,
  registeredOrgs: string[]
): ValidationResult {
  const base = validateOrgId(value)
  if (base) return base
  if (registeredOrgs.length > 0 && !registeredOrgs.includes(value.trim())) {
    return { message: 'This organisation is not registered in WorkloadGovernor.' }
  }
  return null
}

// ─── Global cap pre-check ─────────────────────────────────────────────────────

export interface CapStatus {
  globalSlotsRemaining: number
  orgSlotsRemaining:    number
}

/**
 * Returns a human-readable error message if the contributor is at cap,
 * or null if they can still apply.
 */
export function validateCapStatus(cap: CapStatus): ValidationResult {
  if (cap.globalSlotsRemaining <= 0) {
    return {
      message:
        'You have reached the global application limit (15 pending applications). ' +
        'Withdraw an existing application before applying for a new one.',
    }
  }
  if (cap.orgSlotsRemaining <= 0) {
    return {
      message:
        'You have reached the organisation assignment limit (4 active assignments). ' +
        'Complete or revoke an assignment before applying in this org.',
    }
  }
  return null
}
