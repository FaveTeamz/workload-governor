import { describe, it, expect } from 'vitest'
import {
  validateStellarAddress,
  validateIssueId,
  validateIssueIdNotApplied,
  validateOrgId,
  validateOrgIdRegistered,
  validateCapStatus,
} from './formValidation'

// ─── Stellar address ──────────────────────────────────────────────────────────

describe('validateStellarAddress', () => {
  // A valid 56-char G… base32 key (A-Z + 2-7 only)
  const VALID = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW'

  it('returns null for a valid Stellar public key', () => {
    expect(validateStellarAddress(VALID)).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validateStellarAddress('')?.message).toMatch(/required/i)
  })

  it('returns error for whitespace-only', () => {
    expect(validateStellarAddress('   ')?.message).toMatch(/required/i)
  })

  it('returns error when key does not start with G', () => {
    const notG = 'A' + VALID.slice(1)
    expect(validateStellarAddress(notG)?.message).toMatch(/stellar public key/i)
  })

  it('returns error when key is too short', () => {
    expect(validateStellarAddress('GABCDE')?.message).toMatch(/stellar public key/i)
  })

  it('returns error when key is too long (57 chars)', () => {
    const tooLong = 'G' + 'A'.repeat(56)
    expect(validateStellarAddress(tooLong)?.message).toMatch(/stellar public key/i)
  })

  it('trims surrounding whitespace before validation', () => {
    expect(validateStellarAddress(`  ${VALID}  `)).toBeNull()
  })
})

// ─── Issue ID ─────────────────────────────────────────────────────────────────

describe('validateIssueId', () => {
  it('returns null for a valid positive integer string', () => {
    expect(validateIssueId('42')).toBeNull()
    expect(validateIssueId('1')).toBeNull()
    expect(validateIssueId('9999')).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validateIssueId('')?.message).toMatch(/required/i)
  })

  it('returns error for 0', () => {
    expect(validateIssueId('0')?.message).toMatch(/positive integer/i)
  })

  it('returns error for negative number', () => {
    expect(validateIssueId('-1')?.message).toMatch(/positive integer/i)
  })

  it('returns error for float', () => {
    expect(validateIssueId('3.14')?.message).toMatch(/positive integer/i)
  })

  it('returns error for non-numeric string', () => {
    expect(validateIssueId('abc')?.message).toMatch(/positive integer/i)
  })
})

describe('validateIssueIdNotApplied', () => {
  const applied = new Set(['10', '20', '30'])

  it('returns null for issue not in applied set', () => {
    expect(validateIssueIdNotApplied('11', applied)).toBeNull()
  })

  it('returns error when already applied', () => {
    expect(validateIssueIdNotApplied('10', applied)?.message).toMatch(/already applied/i)
  })

  it('propagates base validateIssueId errors', () => {
    expect(validateIssueIdNotApplied('', applied)?.message).toMatch(/required/i)
    expect(validateIssueIdNotApplied('-5', applied)?.message).toMatch(/positive integer/i)
  })
})

// ─── Org ID ───────────────────────────────────────────────────────────────────

describe('validateOrgId', () => {
  it('returns null for non-empty org id', () => {
    expect(validateOrgId('stellar-org')).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validateOrgId('')?.message).toMatch(/required/i)
  })

  it('returns error for whitespace-only', () => {
    expect(validateOrgId('   ')?.message).toMatch(/required/i)
  })
})

describe('validateOrgIdRegistered', () => {
  const registered = ['stellar-org', 'meridian-dao', 'soroban-tools']

  it('returns null when org is in registered list', () => {
    expect(validateOrgIdRegistered('stellar-org', registered)).toBeNull()
  })

  it('returns error when org is not in registered list', () => {
    expect(validateOrgIdRegistered('unknown-org', registered)?.message).toMatch(/not registered/i)
  })

  it('returns null when registered list is empty (no pre-check possible)', () => {
    expect(validateOrgIdRegistered('any-org', [])).toBeNull()
  })

  it('propagates base validateOrgId errors before checking registration', () => {
    expect(validateOrgIdRegistered('', registered)?.message).toMatch(/required/i)
  })
})

// ─── Cap status ───────────────────────────────────────────────────────────────

describe('validateCapStatus', () => {
  it('returns null when both caps have remaining slots', () => {
    expect(validateCapStatus({ globalSlotsRemaining: 5, orgSlotsRemaining: 2 })).toBeNull()
  })

  it('returns error message when global slots are 0', () => {
    expect(validateCapStatus({ globalSlotsRemaining: 0, orgSlotsRemaining: 2 })?.message)
      .toMatch(/global application limit/i)
  })

  it('returns error message when org slots are 0', () => {
    expect(validateCapStatus({ globalSlotsRemaining: 10, orgSlotsRemaining: 0 })?.message)
      .toMatch(/organisation assignment limit/i)
  })

  it('global cap takes precedence over org cap when both are 0', () => {
    expect(validateCapStatus({ globalSlotsRemaining: 0, orgSlotsRemaining: 0 })?.message)
      .toMatch(/global application limit/i)
  })

  it('returns null when slots are exactly 1', () => {
    expect(validateCapStatus({ globalSlotsRemaining: 1, orgSlotsRemaining: 1 })).toBeNull()
  })
})
