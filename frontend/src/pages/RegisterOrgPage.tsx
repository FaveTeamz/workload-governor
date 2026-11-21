import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import "./RegisterOrgPage.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Step = 1 | 2 | 3 | 4;

interface FormData {
  orgId: string;
  maintainers: string[];
  cap: number;
}

type GithubCheckStatus = "idle" | "checking" | "found" | "not_found" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STELLAR_RE = /^G[A-Z2-7]{54,55}$/;

function isValidStellarAddress(addr: string): boolean {
  return STELLAR_RE.test(addr.trim());
}

function stepLabel(step: Step): string {
  switch (step) {
    case 1: return "GitHub Org";
    case 2: return "Maintainers";
    case 3: return "Cap";
    case 4: return "Review";
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Step indicator strip */
function StepBar({ current }: { current: Step }) {
  const steps: Step[] = [1, 2, 3, 4];
  return (
    <nav className="register-org__step-bar" aria-label="Form steps">
      <ol className="step-bar__list">
        {steps.map((s) => (
          <li
            key={s}
            className={[
              "step-bar__item",
              s === current ? "step-bar__item--active" : "",
              s < current ? "step-bar__item--done" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={s === current ? "step" : undefined}
          >
            <span className="step-bar__num" aria-hidden="true">
              {s < current ? "✓" : s}
            </span>
            <span className="step-bar__label">{stepLabel(s)}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — GitHub Org Lookup
// ---------------------------------------------------------------------------

interface Step1Props {
  orgId: string;
  onChange: (v: string) => void;
  status: GithubCheckStatus;
  onNext: () => void;
}

function Step1({ orgId, onChange, status, onNext }: Step1Props) {
  const statusMsg: Record<GithubCheckStatus, string> = {
    idle: "",
    checking: "Checking GitHub…",
    found: `✓ "${orgId}" exists on GitHub`,
    not_found: `✗ No GitHub organisation named "${orgId}"`,
    error: "Could not reach GitHub — please try again",
  };

  const statusClass: Record<GithubCheckStatus, string> = {
    idle: "",
    checking: "field-hint field-hint--checking",
    found: "field-hint field-hint--ok",
    not_found: "field-hint field-hint--error",
    error: "field-hint field-hint--error",
  };

  return (
    <section aria-labelledby="step1-heading">
      <h2 id="step1-heading" className="register-org__step-title">
        Step 1: GitHub Organisation Lookup
      </h2>
      <p className="register-org__step-desc">
        Enter the exact GitHub organisation name (e.g.{" "}
        <code>stellar</code>). We'll verify it exists before proceeding.
      </p>

      <div className="form-field">
        <label htmlFor="org-id-input" className="form-label">
          GitHub Organisation Name
        </label>
        <input
          id="org-id-input"
          type="text"
          className="form-input"
          value={orgId}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. stellar"
          autoComplete="off"
          aria-describedby="org-id-hint"
          aria-invalid={status === "not_found" || status === "error" ? true : undefined}
        />
        {status !== "idle" && (
          <p
            id="org-id-hint"
            className={statusClass[status]}
            role={status === "not_found" || status === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {statusMsg[status]}
          </p>
        )}
      </div>

      <div className="register-org__actions">
        <Button
          onClick={onNext}
          disabled={status !== "found"}
          aria-disabled={status !== "found"}
        >
          Next: Set Maintainers →
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Set Maintainers
// ---------------------------------------------------------------------------

interface Step2Props {
  maintainers: string[];
  onAdd: (addr: string) => void;
  onRemove: (addr: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function Step2({ maintainers, onAdd, onRemove, onNext, onBack }: Step2Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function handleAdd() {
    const addr = input.trim();
    if (!addr) {
      setError("Address cannot be empty");
      return;
    }
    if (!isValidStellarAddress(addr)) {
      setError("Invalid Stellar address — must start with G and be 56 characters");
      return;
    }
    if (maintainers.includes(addr)) {
      setError("This address has already been added");
      return;
    }
    setError("");
    onAdd(addr);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <section aria-labelledby="step2-heading">
      <h2 id="step2-heading" className="register-org__step-title">
        Step 2: Set Maintainers
      </h2>
      <p className="register-org__step-desc">
        Add one or more Stellar public key addresses that will be authorised
        as maintainers for this organisation.
      </p>

      <div className="form-field">
        <label htmlFor="maintainer-input" className="form-label">
          Stellar Address
        </label>
        <div className="input-row">
          <input
            id="maintainer-input"
            type="text"
            className={`form-input${error ? " form-input--error" : ""}`}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="GABC…"
            autoComplete="off"
            aria-describedby={error ? "maintainer-error" : undefined}
            aria-invalid={error ? true : undefined}
          />
          <Button variant="secondary" onClick={handleAdd} type="button">
            Add
          </Button>
        </div>
        {error && (
          <p id="maintainer-error" className="field-hint field-hint--error" role="alert">
            {error}
          </p>
        )}
      </div>

      {maintainers.length > 0 && (
        <ul className="maintainer-list" aria-label="Added maintainers">
          {maintainers.map((addr) => (
            <li key={addr} className="maintainer-list__item">
              <code className="maintainer-list__addr">{addr}</code>
              <button
                type="button"
                className="maintainer-list__remove btn btn-ghost btn-sm"
                onClick={() => onRemove(addr)}
                aria-label={`Remove maintainer ${addr}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {maintainers.length === 0 && (
        <p className="register-org__empty">No maintainers added yet.</p>
      )}

      <div className="register-org__actions">
        <Button variant="ghost" onClick={onBack} type="button">
          ← Back
        </Button>
        <Button
          onClick={onNext}
          disabled={maintainers.length === 0}
          aria-disabled={maintainers.length === 0}
          type="button"
        >
          Next: Configure Cap →
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Configure Cap
// ---------------------------------------------------------------------------

interface Step3Props {
  cap: number;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}

function capDescription(cap: number): string {
  if (cap <= 3) return "Very strict — contributors can only hold up to " + cap + " active assignment(s) per org. Ideal for tightly-scoped sprints.";
  if (cap <= 7) return "Balanced — contributors hold up to " + cap + " assignments. Good for medium-sized orgs with steady issue flow.";
  if (cap <= 12) return "Generous — contributors can juggle " + cap + " tasks simultaneously. Best for large orgs with many parallel work streams.";
  return "Maximum — " + cap + " concurrent assignments. Reserve for high-trust contributors or orgs with exceptional throughput.";
}

function Step3({ cap, onChange, onNext, onBack }: Step3Props) {
  const [error, setError] = useState("");

  function handleChange(raw: string) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) {
      setError("Cap must be a number");
      return;
    }
    if (n < 1 || n > 20) {
      setError("Cap must be between 1 and 20");
      onChange(Math.max(1, Math.min(20, n)));
      return;
    }
    setError("");
    onChange(n);
  }

  return (
    <section aria-labelledby="step3-heading">
      <h2 id="step3-heading" className="register-org__step-title">
        Step 3: Configure Assignment Cap
      </h2>
      <p className="register-org__step-desc">
        Set the maximum number of active assignments a single contributor may
        hold within this organisation at any time (1–20).
      </p>

      <div className="form-field">
        <label htmlFor="cap-input" className="form-label">
          Assignment Cap (1–20)
        </label>
        <div className="cap-row">
          <input
            id="cap-input"
            type="number"
            min={1}
            max={20}
            step={1}
            className={`form-input form-input--narrow${error ? " form-input--error" : ""}`}
            value={cap}
            onChange={(e) => handleChange(e.target.value)}
            aria-describedby="cap-impact cap-range-hint"
            aria-invalid={error ? true : undefined}
          />
          <input
            type="range"
            min={1}
            max={20}
            step={1}
            className="cap-slider"
            value={cap}
            onChange={(e) => handleChange(e.target.value)}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
        {error && (
          <p className="field-hint field-hint--error" role="alert">
            {error}
          </p>
        )}
        <p id="cap-range-hint" className="field-hint">
          Allowed range: 1–20
        </p>
      </div>

      <div className="cap-impact" id="cap-impact" aria-live="polite">
        <strong>Impact:</strong> {capDescription(cap)}
      </div>

      <div className="register-org__actions">
        <Button variant="ghost" onClick={onBack} type="button">
          ← Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!!error}
          aria-disabled={!!error}
          type="button"
        >
          Next: Review →
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review and Submit
// ---------------------------------------------------------------------------

interface Step4Props {
  data: FormData;
  apiKey: string;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
}

function Step4({ data, apiKey, onBack, onSubmit, submitting, submitError }: Step4Props) {
  return (
    <section aria-labelledby="step4-heading">
      <h2 id="step4-heading" className="register-org__step-title">
        Step 4: Review &amp; Submit
      </h2>
      <p className="register-org__step-desc">
        Review the details below before registering the organisation.
      </p>

      <dl className="review-list">
        <div className="review-list__row">
          <dt>GitHub Organisation</dt>
          <dd>
            <code>{data.orgId}</code>
          </dd>
        </div>

        <div className="review-list__row">
          <dt>Maintainers ({data.maintainers.length})</dt>
          <dd>
            <ul className="review-list__maintainers">
              {data.maintainers.map((addr) => (
                <li key={addr}>
                  <code>{addr}</code>
                </li>
              ))}
            </ul>
          </dd>
        </div>

        <div className="review-list__row">
          <dt>Assignment Cap</dt>
          <dd>
            <strong>{data.cap}</strong>{" "}
            <span className="review-list__muted">concurrent assignments per contributor</span>
          </dd>
        </div>

        <div className="review-list__row">
          <dt>API Key</dt>
          <dd>
            <code>{apiKey.length > 8 ? `${apiKey.slice(0, 4)}${"•".repeat(apiKey.length - 8)}${apiKey.slice(-4)}` : "•".repeat(apiKey.length)}</code>
          </dd>
        </div>
      </dl>

      {submitError && (
        <p className="field-hint field-hint--error" role="alert">
          {submitError}
        </p>
      )}

      <div className="register-org__actions">
        <Button variant="ghost" onClick={onBack} disabled={submitting} type="button">
          ← Back
        </Button>
        <Button
          onClick={onSubmit}
          disabled={submitting}
          aria-busy={submitting}
          type="button"
        >
          {submitting ? "Registering…" : "Register Organisation"}
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Access Denied
// ---------------------------------------------------------------------------

function AccessDenied() {
  return (
    <main className="register-org register-org--denied" id="main-content" tabIndex={-1}>
      <Card>
        <div className="access-denied">
          <span className="access-denied__icon" aria-hidden="true">🔒</span>
          <h1>Access Denied</h1>
          <p>
            An admin API key is required to register organisations.
            Please provide a valid key in the field below.
          </p>
        </div>
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface RegisterOrgPageProps {
  /** Override API base URL (for tests) */
  apiBase?: string;
  /** Inject the GitHub check function (for tests) */
  checkGitHubOrg?: (org: string) => Promise<GithubCheckStatus>;
}

async function defaultCheckGitHubOrg(org: string): Promise<GithubCheckStatus> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (res.status === 200) return "found";
    if (res.status === 404) return "not_found";
    return "error";
  } catch {
    return "error";
  }
}

export function RegisterOrgPage({
  apiBase = "/api",
  checkGitHubOrg = defaultCheckGitHubOrg,
}: RegisterOrgPageProps) {
  const navigate = useNavigate();

  // ── Auth guard ──────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("wg_admin_api_key") ?? "");
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState("");
  const authenticated = apiKey.length > 0;

  function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    const k = keyInput.trim();
    if (!k) {
      setKeyError("API key cannot be empty");
      return;
    }
    setKeyError("");
    localStorage.setItem("wg_admin_api_key", k);
    setApiKey(k);
    setKeyInput("");
  }

  // ── Form state ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1);
  const [orgId, setOrgId] = useState("");
  const [githubStatus, setGithubStatus] = useState<GithubCheckStatus>("idle");
  const [maintainers, setMaintainers] = useState<string[]>([]);
  const [cap, setCap] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounced GitHub check
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerGithubCheck = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      if (!trimmed) {
        setGithubStatus("idle");
        return;
      }
      setGithubStatus("checking");
      debounceRef.current = setTimeout(async () => {
        const result = await checkGitHubOrg(trimmed);
        setGithubStatus(result);
      }, 500);
    },
    [checkGitHubOrg],
  );

  function handleOrgIdChange(value: string) {
    setOrgId(value);
    triggerGithubCheck(value);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Submit ──────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${apiBase}/admin/orgs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ org_id: orgId, maintainers, cap }),
      });

      if (res.status === 401 || res.status === 403) {
        setSubmitError("Invalid or expired API key. Please update your key.");
        // Wipe stored key so the auth form reappears
        localStorage.removeItem("wg_admin_api_key");
        setApiKey("");
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error ?? `Server error (${res.status})`);
        return;
      }

      // Success — redirect to org detail page
      navigate(`/orgs/${encodeURIComponent(orgId)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // Show API key entry if not authenticated
  if (!authenticated) {
    return (
      <main className="register-org" id="main-content" tabIndex={-1}>
        <h1 className="register-org__title">Register Organisation</h1>
        <Card>
          <AccessDenied />
          <form
            className="api-key-form"
            onSubmit={handleSaveKey}
            aria-label="Enter admin API key"
          >
            <div className="form-field">
              <label htmlFor="api-key-input" className="form-label">
                Admin API Key
              </label>
              <input
                id="api-key-input"
                type="password"
                className={`form-input${keyError ? " form-input--error" : ""}`}
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  if (keyError) setKeyError("");
                }}
                placeholder="Enter your admin API key"
                aria-describedby={keyError ? "api-key-error" : undefined}
                aria-invalid={keyError ? true : undefined}
              />
              {keyError && (
                <p id="api-key-error" className="field-hint field-hint--error" role="alert">
                  {keyError}
                </p>
              )}
            </div>
            <Button type="submit">Unlock</Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="register-org" id="main-content" tabIndex={-1}>
      <h1 className="register-org__title">Register Organisation</h1>

      <div className="register-org__header-row">
        <StepBar current={step} />
        <button
          type="button"
          className="btn btn-ghost btn-sm register-org__logout"
          onClick={() => {
            localStorage.removeItem("wg_admin_api_key");
            setApiKey("");
          }}
          aria-label="Clear API key and log out"
        >
          Clear key
        </button>
      </div>

      <Card>
        {step === 1 && (
          <Step1
            orgId={orgId}
            onChange={handleOrgIdChange}
            status={githubStatus}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <Step2
            maintainers={maintainers}
            onAdd={(addr) => setMaintainers((prev) => [...prev, addr])}
            onRemove={(addr) => setMaintainers((prev) => prev.filter((a) => a !== addr))}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Step3
            cap={cap}
            onChange={setCap}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <Step4
            data={{ orgId, maintainers, cap }}
            apiKey={apiKey}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
          />
        )}
      </Card>
    </main>
  );
}
