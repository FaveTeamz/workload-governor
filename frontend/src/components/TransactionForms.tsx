import { useState, useId, type FormEvent } from 'react'
import {
  validateStellarAddress,
  validateIssueIdNotApplied,
  validateOrgIdRegistered,
  validateCapStatus,
  type ValidationResult,
  type CapStatus,
} from './formValidation'

// ─── FieldError component ─────────────────────────────────────────────────────

interface FieldErrorProps {
  error: ValidationResult
  id:    string
}

function FieldError({ error, id }: FieldErrorProps) {
  if (!error) return null
  return (
    <p id={id} className="form-field__error" role="alert" aria-live="polite">
      <span className="form-field__error-icon" aria-hidden="true">⚠</span>
      {error.message}
    </p>
  )
}

// ─── FormField component ──────────────────────────────────────────────────────

interface FormFieldProps {
  label:       string
  name:        string
  value:       string
  onChange:    (v: string) => void
  onBlur?:     () => void
  error:       ValidationResult
  errorId:     string
  placeholder?: string
  hint?:        string
  required?:    boolean
}

function FormField({
  label,
  name,
  value,
  onChange,
  onBlur,
  error,
  errorId,
  placeholder,
  hint,
  required = true,
}: FormFieldProps) {
  const hintId = `${errorId}__hint`
  const describedBy = [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined

  return (
    <div className={`form-field${error ? ' form-field--error' : ''}`}>
      <label className="form-field__label" htmlFor={name}>
        {label}
        {required && <span className="form-field__required" aria-hidden="true"> *</span>}
      </label>
      {hint && (
        <p id={hintId} className="form-field__hint">{hint}</p>
      )}
      <div className="form-field__input-wrap">
        <input
          id={name}
          name={name}
          className={`form-field__input${error ? ' form-field__input--error' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          required={required}
          autoComplete="off"
          spellCheck={false}
        />
        {error && <span className="form-field__error-indicator" aria-hidden="true">!</span>}
      </div>
      <FieldError error={error} id={errorId} />
    </div>
  )
}

// ─── CapWarning ───────────────────────────────────────────────────────────────

function CapWarning({ message }: { message: string }) {
  return (
    <div className="form-cap-warning" role="alert" aria-live="assertive">
      <span className="form-cap-warning__icon" aria-hidden="true">⛔</span>
      <p className="form-cap-warning__text">{message}</p>
    </div>
  )
}

// ─── ApplyForm ────────────────────────────────────────────────────────────────

export interface ApplyFormProps {
  /** IDs the contributor has already applied to */
  appliedIssueIds?:   string[]
  /** Registered org IDs (fetched from org list endpoint) */
  registeredOrgs?:    string[]
  /** Current contributor cap status */
  capStatus?:         CapStatus
  onSubmit:           (data: { orgId: string; issueId: string }) => Promise<void>
}

export function ApplyForm({
  appliedIssueIds = [],
  registeredOrgs  = [],
  capStatus,
  onSubmit,
}: ApplyFormProps) {
  const uid     = useId()
  const [orgId,    setOrgId   ] = useState('')
  const [issueId,  setIssueId ] = useState('')
  const [touched,  setTouched ] = useState({ orgId: false, issueId: false })
  const [busy,     setBusy    ] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const appliedSet = new Set(appliedIssueIds)
  const validate = (field: 'orgId' | 'issueId', val?: string) => {
    if (field === 'orgId')   return validateOrgIdRegistered(val ?? orgId,   registeredOrgs)
    if (field === 'issueId') return validateIssueIdNotApplied(val ?? issueId, appliedSet)
    return null
  }

  const showError = (field: 'orgId' | 'issueId') => touched[field] || submitted

  const orgIdError   = showError('orgId')   ? validate('orgId')   : null
  const issueIdError = showError('issueId') ? validate('issueId') : null
  const capError     = capStatus ? validateCapStatus(capStatus) : null

  const isValid = !validate('orgId') && !validate('issueId') && !capError

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return
    setBusy(true)
    try {
      await onSubmit({ orgId: orgId.trim(), issueId: issueId.trim() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="tx-form" onSubmit={handleSubmit} noValidate>
      <h3 className="tx-form__title">Apply for Issue</h3>

      {capError && <CapWarning message={capError.message} />}

      <FormField
        label="Organisation ID"
        name={`${uid}-org-id`}
        value={orgId}
        onChange={setOrgId}
        onBlur={() => setTouched(t => ({ ...t, orgId: true }))}
        error={orgIdError}
        errorId={`${uid}-org-id-err`}
        placeholder="e.g. stellar-org"
        hint={registeredOrgs.length ? undefined : 'Enter the exact org ID as registered.'}
      />

      <FormField
        label="Issue ID"
        name={`${uid}-issue-id`}
        value={issueId}
        onChange={setIssueId}
        onBlur={() => setTouched(t => ({ ...t, issueId: true }))}
        error={issueIdError}
        errorId={`${uid}-issue-id-err`}
        placeholder="e.g. 42"
        hint="Must be a positive integer. Cannot apply twice to the same issue."
      />

      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy || !!capError}
        aria-busy={busy}
        aria-describedby={capError ? `${uid}-cap-err` : undefined}
      >
        {busy ? 'Applying…' : 'Apply'}
      </button>
    </form>
  )
}

// ─── AssignForm ───────────────────────────────────────────────────────────────

export interface AssignFormProps {
  registeredOrgs?: string[]
  onSubmit:        (data: { contributor: string; orgId: string; issueId: string }) => Promise<void>
}

export function AssignForm({ registeredOrgs = [], onSubmit }: AssignFormProps) {
  const uid    = useId()
  const [contributor, setContributor] = useState('')
  const [orgId,       setOrgId      ] = useState('')
  const [issueId,     setIssueId    ] = useState('')
  const [touched,  setTouched] = useState({ contributor: false, orgId: false, issueId: false })
  const [busy,     setBusy   ] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const validate = (field: 'contributor' | 'orgId' | 'issueId', val?: string) => {
    if (field === 'contributor') return validateStellarAddress(val ?? contributor)
    if (field === 'orgId')       return validateOrgIdRegistered(val ?? orgId, registeredOrgs)
    if (field === 'issueId')     return validateIssueIdNotApplied(val ?? issueId, new Set())
    return null
  }

  const showError = (f: 'contributor' | 'orgId' | 'issueId') => touched[f] || submitted

  const contributorError = showError('contributor') ? validate('contributor') : null
  const orgIdError       = showError('orgId')       ? validate('orgId')       : null
  const issueIdError     = showError('issueId')     ? validate('issueId')     : null

  const isValid = !validate('contributor') && !validate('orgId') && !validate('issueId')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return
    setBusy(true)
    try {
      await onSubmit({
        contributor: contributor.trim(),
        orgId:       orgId.trim(),
        issueId:     issueId.trim(),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="tx-form" onSubmit={handleSubmit} noValidate>
      <h3 className="tx-form__title">Assign Issue</h3>

      <FormField
        label="Contributor Address"
        name={`${uid}-contributor`}
        value={contributor}
        onChange={setContributor}
        onBlur={() => setTouched(t => ({ ...t, contributor: true }))}
        error={contributorError}
        errorId={`${uid}-contributor-err`}
        placeholder="GXXXXXXXXXX…"
        hint="Must be a valid Stellar public key starting with G."
      />
      <FormField
        label="Organisation ID"
        name={`${uid}-org-id`}
        value={orgId}
        onChange={setOrgId}
        onBlur={() => setTouched(t => ({ ...t, orgId: true }))}
        error={orgIdError}
        errorId={`${uid}-org-id-err`}
        placeholder="e.g. stellar-org"
      />
      <FormField
        label="Issue ID"
        name={`${uid}-issue-id`}
        value={issueId}
        onChange={setIssueId}
        onBlur={() => setTouched(t => ({ ...t, issueId: true }))}
        error={issueIdError}
        errorId={`${uid}-issue-id-err`}
        placeholder="e.g. 42"
      />

      <button
        type="submit"
        className="btn btn-primary"
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? 'Assigning…' : 'Assign'}
      </button>
    </form>
  )
}

// ─── CompleteForm ─────────────────────────────────────────────────────────────

export interface CompleteFormProps {
  registeredOrgs?: string[]
  onSubmit:        (data: { contributor: string; orgId: string; issueId: string }) => Promise<void>
}

export function CompleteForm({ registeredOrgs = [], onSubmit }: CompleteFormProps) {
  const uid    = useId()
  const [contributor, setContributor] = useState('')
  const [orgId,       setOrgId      ] = useState('')
  const [issueId,     setIssueId    ] = useState('')
  const [touched,  setTouched] = useState({ contributor: false, orgId: false, issueId: false })
  const [busy,     setBusy   ] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const validate = (field: 'contributor' | 'orgId' | 'issueId', val?: string) => {
    if (field === 'contributor') return validateStellarAddress(val ?? contributor)
    if (field === 'orgId')       return validateOrgIdRegistered(val ?? orgId, registeredOrgs)
    if (field === 'issueId')     return validateIssueIdNotApplied(val ?? issueId, new Set())
    return null
  }

  const showError = (f: 'contributor' | 'orgId' | 'issueId') => touched[f] || submitted

  const contributorError = showError('contributor') ? validate('contributor') : null
  const orgIdError       = showError('orgId')       ? validate('orgId')       : null
  const issueIdError     = showError('issueId')     ? validate('issueId')     : null

  const isValid = !validate('contributor') && !validate('orgId') && !validate('issueId')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return
    setBusy(true)
    try {
      await onSubmit({ contributor: contributor.trim(), orgId: orgId.trim(), issueId: issueId.trim() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="tx-form" onSubmit={handleSubmit} noValidate>
      <h3 className="tx-form__title">Complete Assignment</h3>
      <FormField label="Contributor Address" name={`${uid}-contributor`} value={contributor}
        onChange={setContributor} onBlur={() => setTouched(t => ({ ...t, contributor: true }))}
        error={contributorError} errorId={`${uid}-contributor-err`} placeholder="GXXXXXXXXXX…" />
      <FormField label="Organisation ID" name={`${uid}-org-id`} value={orgId}
        onChange={setOrgId} onBlur={() => setTouched(t => ({ ...t, orgId: true }))}
        error={orgIdError} errorId={`${uid}-org-id-err`} placeholder="e.g. stellar-org" />
      <FormField label="Issue ID" name={`${uid}-issue-id`} value={issueId}
        onChange={setIssueId} onBlur={() => setTouched(t => ({ ...t, issueId: true }))}
        error={issueIdError} errorId={`${uid}-issue-id-err`} placeholder="e.g. 42" />
      <button type="submit" className="btn btn-complete" disabled={busy} aria-busy={busy}>
        {busy ? 'Completing…' : 'Complete'}
      </button>
    </form>
  )
}

// ─── RevokeForm ───────────────────────────────────────────────────────────────

export interface RevokeFormProps {
  registeredOrgs?: string[]
  onSubmit:        (data: { contributor: string; orgId: string; issueId: string }) => Promise<void>
}

export function RevokeForm({ registeredOrgs = [], onSubmit }: RevokeFormProps) {
  const uid    = useId()
  const [contributor, setContributor] = useState('')
  const [orgId,       setOrgId      ] = useState('')
  const [issueId,     setIssueId    ] = useState('')
  const [touched,  setTouched] = useState({ contributor: false, orgId: false, issueId: false })
  const [busy,     setBusy   ] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const validate = (field: 'contributor' | 'orgId' | 'issueId', val?: string) => {
    if (field === 'contributor') return validateStellarAddress(val ?? contributor)
    if (field === 'orgId')       return validateOrgIdRegistered(val ?? orgId, registeredOrgs)
    if (field === 'issueId')     return validateIssueIdNotApplied(val ?? issueId, new Set())
    return null
  }

  const showError = (f: 'contributor' | 'orgId' | 'issueId') => touched[f] || submitted

  const contributorError = showError('contributor') ? validate('contributor') : null
  const orgIdError       = showError('orgId')       ? validate('orgId')       : null
  const issueIdError     = showError('issueId')     ? validate('issueId')     : null

  const isValid = !validate('contributor') && !validate('orgId') && !validate('issueId')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!isValid) return
    setBusy(true)
    try {
      await onSubmit({ contributor: contributor.trim(), orgId: orgId.trim(), issueId: issueId.trim() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="tx-form" onSubmit={handleSubmit} noValidate>
      <h3 className="tx-form__title">Revoke Assignment</h3>
      <FormField label="Contributor Address" name={`${uid}-contributor`} value={contributor}
        onChange={setContributor} onBlur={() => setTouched(t => ({ ...t, contributor: true }))}
        error={contributorError} errorId={`${uid}-contributor-err`} placeholder="GXXXXXXXXXX…" />
      <FormField label="Organisation ID" name={`${uid}-org-id`} value={orgId}
        onChange={setOrgId} onBlur={() => setTouched(t => ({ ...t, orgId: true }))}
        error={orgIdError} errorId={`${uid}-org-id-err`} placeholder="e.g. stellar-org" />
      <FormField label="Issue ID" name={`${uid}-issue-id`} value={issueId}
        onChange={setIssueId} onBlur={() => setTouched(t => ({ ...t, issueId: true }))}
        error={issueIdError} errorId={`${uid}-issue-id-err`} placeholder="e.g. 42" />
      <button type="submit" className="btn btn-revoke" disabled={busy} aria-busy={busy}>
        {busy ? 'Revoking…' : 'Revoke'}
      </button>
    </form>
  )
}
