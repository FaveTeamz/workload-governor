import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

/** localStorage key that gates first-time display */
export const ONBOARDING_STORAGE_KEY = "wg_onboarding_done";

// ─────────────────────────────────────────────────────────────────────────────
// Step content definitions (3 steps per issue #642)
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — one per step
// ─────────────────────────────────────────────────────────────────────────────

interface Step1Props {
  walletConnected: boolean;
  onConnectWallet?: () => void;
}

function StepConnectWallet({ walletConnected, onConnectWallet }: Step1Props) {
  return (
    <div className="onboarding-step-body">
      {/* Freighter logo placeholder */}
      <div
        className="onboarding-icon"
        aria-hidden="true"
        role="img"
        aria-label="Freighter wallet logo"
      >
        🔑
      </div>

      <h2 id="onboarding-title">Connect Your Wallet</h2>

      {walletConnected ? (
        <p className="onboarding-connected">
          ✅ Wallet connected! You're ready to apply for issues.
        </p>
      ) : (
        <>
          <p>
            WorkloadGovernor uses the <strong>Freighter</strong> browser
            extension to sign Stellar transactions. Install it to get started.
          </p>

          <a
            href="https://freighter.app"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary onboarding-external-link"
            aria-label="Get Freighter Extension (opens in new tab)"
          >
            Get Freighter Extension ↗
          </a>

          {onConnectWallet && (
            <button
              className="btn btn-primary"
              onClick={onConnectWallet}
              aria-label="Connect Freighter wallet"
            >
              Connect Wallet
            </button>
          )}

          <p className="onboarding-hint">
            Already have Freighter installed? Click <em>Connect Wallet</em>{" "}
            above, then approve the connection request in the extension popup.
          </p>
        </>
      )}
    </div>
  );
}

function StepUnderstandingCaps() {
  return (
    <div className="onboarding-step-body">
      <div className="onboarding-icon" aria-hidden="true">⚖️</div>

      <h2 id="onboarding-title">Understanding Caps</h2>

      <p>
        WorkloadGovernor enforces <strong>fairness caps</strong> so that a small
        group of contributors can't monopolise all open tasks.
      </p>

      <div
        className="onboarding-caps"
        role="list"
        aria-label="Fairness cap rules"
      >
        {/* Global cap card */}
        <div
          className="onboarding-cap-card"
          role="listitem"
          aria-label="Global cap: 15 pending applications across all organisations"
        >
          <span className="cap-number" aria-hidden="true">15</span>
          <div className="cap-detail">
            <strong>Global Cap</strong>
            <span>Max pending applications across all orgs</span>
          </div>

          {/* Visual bar — static illustration */}
          <div
            className="cap-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={15}
            aria-valuenow={9}
            aria-label="Example: 9 of 15 applications used"
          >
            <div className="cap-bar-fill cap-bar-global" style={{ width: "60%" }} />
          </div>
          <span className="cap-bar-label">Example: 9 / 15 used</span>
        </div>

        {/* Org cap card */}
        <div
          className="onboarding-cap-card"
          role="listitem"
          aria-label="Org cap: 4 active assignments per organisation"
        >
          <span className="cap-number" aria-hidden="true">4</span>
          <div className="cap-detail">
            <strong>Per-Org Cap</strong>
            <span>Max active assignments per organisation</span>
          </div>

          <div
            className="cap-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={4}
            aria-valuenow={2}
            aria-label="Example: 2 of 4 assignments used"
          >
            <div className="cap-bar-fill cap-bar-org" style={{ width: "50%" }} />
          </div>
          <span className="cap-bar-label">Example: 2 / 4 used</span>
        </div>
      </div>

      <p className="onboarding-hint">
        Once you reach a cap, apply buttons will be disabled until you withdraw
        an application or an assignment is completed.
      </p>
    </div>
  );
}

interface Step3Props {
  orgFilter: string;
  onOrgFilterChange: (value: string) => void;
  onBrowse: () => void;
}

const EXAMPLE_ORGS = ["stellar-org", "meridian-dao", "soroban-labs"];

function StepFindAnIssue({ orgFilter, onOrgFilterChange, onBrowse }: Step3Props) {
  return (
    <div className="onboarding-step-body">
      <div className="onboarding-icon" aria-hidden="true">🔍</div>

      <h2 id="onboarding-title">Find an Issue</h2>

      <p>
        Browse open issues across organisations and apply for work that interests
        you. Use the filter below to narrow by organisation.
      </p>

      <label htmlFor="onboarding-org-filter" className="onboarding-label">
        Filter by organisation
      </label>
      <input
        id="onboarding-org-filter"
        type="text"
        className="onboarding-input"
        placeholder="e.g. stellar-org"
        value={orgFilter}
        onChange={(e) => onOrgFilterChange(e.target.value)}
        aria-describedby="onboarding-org-hint"
        autoComplete="off"
      />
      <span id="onboarding-org-hint" className="onboarding-hint">
        Example orgs:{" "}
        {EXAMPLE_ORGS.map((org, i) => (
          <span key={org}>
            <button
              className="onboarding-chip"
              onClick={() => onOrgFilterChange(org)}
              aria-label={`Filter by ${org}`}
            >
              {org}
            </button>
            {i < EXAMPLE_ORGS.length - 1 && " "}
          </span>
        ))}
      </span>

      <button
        className="btn btn-primary"
        onClick={onBrowse}
        aria-label={
          orgFilter
            ? `Browse issues in ${orgFilter}`
            : "Browse all open issues"
        }
      >
        {orgFilter ? `Browse Issues in ${orgFilter}` : "Browse All Issues"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main wizard component
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingWizardProps {
  /** Called when the user completes or skips the wizard */
  onComplete?: () => void;
  /** Called when the user clicks Connect Wallet in step 1 */
  onConnectWallet?: () => void;
  /** Whether a wallet is already connected (controls step 1 UI) */
  walletConnected?: boolean;
  /**
   * Bypass localStorage gate and show wizard immediately.
   * Used by Storybook stories and integration tests.
   */
  forceVisible?: boolean;
  /**
   * Start on a specific step index (0-based).
   * Used by Storybook stories.
   */
  initialStep?: number;
}

export function OnboardingWizard({
  onComplete,
  onConnectWallet,
  walletConnected = false,
  forceVisible = false,
  initialStep = 0,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(
    Math.min(Math.max(0, initialStep), TOTAL_STEPS - 1)
  );
  const [visible, setVisible] = useState(forceVisible);
  const [orgFilter, setOrgFilter] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Show on first visit (localStorage gate)
  useEffect(() => {
    if (!forceVisible && !localStorage.getItem(ONBOARDING_STORAGE_KEY)) {
      setVisible(true);
    }
  }, [forceVisible]);

  // Restore forced visibility when forceVisible changes (Storybook hot reload)
  useEffect(() => {
    if (forceVisible) setVisible(true);
  }, [forceVisible]);

  // Move focus to primary button when step changes
  useEffect(() => {
    if (visible) {
      // small tick to let the DOM settle
      const id = setTimeout(() => primaryBtnRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [visible, step]);

  function dismiss(permanent: boolean) {
    if (permanent) localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    setVisible(false);
    onComplete?.();
  }

  function next() {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss(true);
    }
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleBrowse() {
    // Navigate to main view; dismiss wizard permanently
    dismiss(true);
    if (orgFilter) {
      window.location.hash = `#/issues?org=${encodeURIComponent(orgFilter)}`;
    }
  }

  // Focus trap + keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      dismiss(false);
      return;
    }

    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, [tabindex="0"]'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (!visible) return null;

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <>
      {/* Backdrop — not interactive; keyboard focus stays in dialog */}
      <div
        className="onboarding-overlay"
        aria-hidden="true"
        onClick={() => dismiss(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="onboarding-dialog"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        // Ensure the dialog itself can receive focus for keyboard events
        tabIndex={-1}
      >
        {/* Progress indicator */}
        <div
          className="onboarding-steps"
          aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}
          role="group"
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={[
                "step-dot",
                i === step ? "active" : "",
                i < step ? "done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`Step ${i + 1}${
                i === step
                  ? " (current)"
                  : i < step
                  ? " (completed)"
                  : ""
              }`}
            />
          ))}
        </div>

        {/* Step body */}
        {step === 0 && (
          <StepConnectWallet
            walletConnected={walletConnected}
            onConnectWallet={onConnectWallet}
          />
        )}
        {step === 1 && <StepUnderstandingCaps />}
        {step === 2 && (
          <StepFindAnIssue
            orgFilter={orgFilter}
            onOrgFilterChange={setOrgFilter}
            onBrowse={handleBrowse}
          />
        )}

        {/* Navigation actions */}
        <div className="onboarding-actions">
          {step > 0 && (
            <button
              className="btn btn-ghost"
              onClick={prev}
              aria-label="Go to previous step"
            >
              Back
            </button>
          )}

          <button
            ref={primaryBtnRef}
            className="btn btn-primary"
            onClick={next}
            aria-label={
              isLastStep
                ? "Finish onboarding"
                : `Next (step ${step + 1} of ${TOTAL_STEPS})`
            }
          >
            {isLastStep ? "Get Started" : "Next →"}
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => dismiss(true)}
            aria-label="Skip onboarding wizard"
          >
            Skip
          </button>
        </div>

        {/* Close button (top-right) */}
        <button
          className="onboarding-close"
          onClick={() => dismiss(false)}
          aria-label="Close onboarding dialog"
        >
          ✕
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Replay button — shown in settings and anywhere onboarding was previously done
// ─────────────────────────────────────────────────────────────────────────────

interface ReplayButtonProps {
  label?: string;
  className?: string;
}

export function ReplayOnboardingButton({
  label = "Replay Onboarding",
  className = "",
}: ReplayButtonProps) {
  function replay() {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
    window.location.reload();
  }

  return (
    <button
      className={`btn btn-secondary ${className}`.trim()}
      onClick={replay}
      aria-label="Clear onboarding state and replay the onboarding wizard"
    >
      {label}
    </button>
  );
}

/**
 * @deprecated Use ReplayOnboardingButton instead.
 * Kept for backward compatibility with existing App.tsx import.
 */
export function GetStartedButton() {
  return <ReplayOnboardingButton label="Get Started" />;
}
