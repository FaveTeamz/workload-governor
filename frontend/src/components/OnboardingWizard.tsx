/**
 * OnboardingWizard — issue #320
 *
 * Multi-step wizard (5 steps) guiding first-time contributors through:
 *   1. Welcome            – intro to WorkloadGovernor
 *   2. Install Freighter  – wallet browser extension
 *   3. Connect Wallet     – authenticate with Freighter
 *   4. Understanding Caps – global (15) and org (4) limits
 *   5. Browse Issues      – discover and apply for work
 *
 * Features:
 *   - Progress bar + dot indicators for current step
 *   - Skip available after step 2 (permanently dismisses via localStorage)
 *   - Completing all 5 steps marks onboarding done in localStorage
 *   - Keyboard accessible: Escape closes, ArrowRight/ArrowLeft navigate,
 *     Tab focus trap inside dialog
 *   - Onboarding never shown again after completion or skip
 */

import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export const STORAGE_KEY = "wg_onboarding_done";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface Step {
  /** Emoji illustration shown above the heading */
  illustration: string;
  title: string;
  /** Body copy — must be ≤50 words */
  content: string;
  /** Optional external link shown as a secondary button */
  link?: { href: string; label: string };
  /** Optional primary CTA overriding the default "Next" label */
  cta?: string;
}

const STEPS: Step[] = [
  {
    illustration: "⚙️",
    title: "Welcome to WorkloadGovernor",
    content:
      "WorkloadGovernor keeps open-source tasks fair. Caps prevent any contributor from monopolising work: up to 15 pending applications globally and up to 4 active assignments per organisation.",
  },
  {
    illustration: "🔑",
    title: "Install Freighter Wallet",
    content:
      "You need Freighter, a free Stellar browser wallet, to sign transactions. Install the extension, create a wallet, and switch to Testnet before continuing.",
    link: { href: "https://freighter.app", label: "Get Freighter — freighter.app" },
    cta: "I have Freighter",
  },
  {
    illustration: "🔗",
    title: "Connect Your Wallet",
    content:
      "Click Connect in the top navigation bar and approve the Freighter popup. Your public key will appear next to the wallet icon — that's your contributor identity on-chain.",
  },
  {
    illustration: "📊",
    title: "Understanding the Cap System",
    content:
      "You may hold at most 15 pending applications across all orgs and 4 active assignments per org at once. This ensures everyone gets a fair shot. Caps reset as applications resolve.",
  },
  {
    illustration: "🚀",
    title: "Browse Open Issues",
    content:
      "You're all set! Browse the issue list, find work that matches your skills, and hit Apply. Your application goes on-chain and a maintainer will review it soon.",
    cta: "Browse Issues",
  },
];

// ---------------------------------------------------------------------------
// OnboardingWizard
// ---------------------------------------------------------------------------

interface Props {
  /** Called after wizard is completed or permanently skipped */
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  /**
   * "idle"    — content is fully visible, no animation running
   * "exiting" — old step sliding out
   * "entering"— new step sliding in (set after state change)
   */
  const [stepPhase, setStepPhase] = useState<"idle" | "exiting" | "entering">("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Show only for first-time visitors (no wallet, never dismissed)
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  // Move focus to primary action whenever step changes
  useEffect(() => {
    if (visible) {
      firstFocusRef.current?.focus();
    }
  }, [visible, step]);

  /** Dismiss the wizard. permanent=true writes localStorage. */
  function dismiss(permanent: boolean) {
    if (permanent) {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    setVisible(false);
    onComplete?.();
  }

  /**
   * Animate to a new step:
   * 1. Set phase → "exiting" (CSS animates the current content out)
   * 2. After 200ms, update the step index and set phase → "entering"
   * 3. After the enter animation, set phase → "idle"
   */
  const goToStep = useCallback((targetStep: number) => {
    if (stepPhase !== "idle") return; // block mid-animation navigation
    setStepPhase("exiting");

    setTimeout(() => {
      setStep(targetStep);
      // Use rAF so the new content is in the DOM before adding the enter class
      animFrameRef.current = requestAnimationFrame(() => {
        setStepPhase("entering");
        setTimeout(() => setStepPhase("idle"), 210);
      });
    }, 200);
  }, [stepPhase]);

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss(true);
    }
  }

  function prev() {
    if (step > 0) goToStep(step - 1);
  }

  /** Keyboard: Escape = close (non-permanent), arrows navigate */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      dismiss(false);
      return;
    }
    if (e.key === "ArrowRight") { next(); return; }
    if (e.key === "ArrowLeft")  { prev(); return; }

    // Focus trap
    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, a, [tabindex="0"]'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
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

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const canSkip = step >= 1; // Skip available after step 2 (index ≥ 1)
  const progressPct = ((step + 1) / STEPS.length) * 100;

  const stepContentClass = [
    "onboarding-step-content",
    stepPhase === "exiting" ? "step-exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
      className="onboarding-overlay"
      onKeyDown={handleKeyDown}
    >
      <div className="onboarding-dialog" ref={dialogRef}>
        {/* Close (non-permanent) */}
        <button
          className="onboarding-close"
          onClick={() => dismiss(false)}
          aria-label="Close onboarding dialog"
        >
          ✕
        </button>

        {/* Progress bar */}
        <div
          className="onboarding-progress"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Step ${step + 1} of ${STEPS.length}`}
        >
          <div
            className="onboarding-progress__fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Dot indicators */}
        <div className="onboarding-steps" aria-label="Progress indicators">
          {STEPS.map((s, i) => (
            <span
              key={i}
              className={
                "step-dot" +
                (i === step ? " active" : "") +
                (i < step ? " done" : "")
              }
              aria-label={`Step ${i + 1}${i === step ? ", current" : i < step ? ", completed" : ""}`}
            />
          ))}
        </div>

        {/* Illustration */}
        <div className="onboarding-illustration" aria-hidden="true">
          {current.illustration}
        </div>

        {/* Heading and body */}
        <h2 id="onboarding-title">{current.title}</h2>
        <p id="onboarding-body">{current.content}</p>

        {/* Optional external link */}
        {current.link && (
          <a
            href={current.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            aria-label={`${current.link.label} (opens in new tab)`}
          >
            {current.link.label}
          </a>
        )}

        {/* Step label */}
        <p className="onboarding-step-label" aria-hidden="true">
          {step + 1} / {STEPS.length}
        </p>

        {/* Navigation actions */}
        <div className="onboarding-actions">
          {/* Back */}
          {step > 0 && (
            <button
              className="btn btn-ghost"
              onClick={prev}
              aria-label="Go to previous step"
            >
              Back
            </button>
          )}

          {/* Spacer when no Back button */}
          {step === 0 && <span />}

          {/* Next / Finish */}
          <button
            ref={firstFocusRef}
            className="btn btn-primary"
            onClick={next}
            disabled={stepPhase !== "idle"}
            aria-label={
              isLast
                ? "Finish onboarding"
                : `Next step (${step + 1} of ${STEPS.length})`
            }
          >
            {isLast ? (current.cta ?? "Get Started") : (current.cta ?? "Next →")}
          </button>

          {/* Skip — permanently dismisses onboarding */}
          {canSkip && !isLast && (
            <button
              className="btn btn-ghost"
              onClick={() => dismiss(true)}
              aria-label="Skip onboarding and don't show again"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GetStartedButton — shown in header for users who previously completed
// ---------------------------------------------------------------------------

/**
 * Shown in the app header when onboarding has already been completed.
 * Allows the user to replay the wizard.
 */
export function GetStartedButton() {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem(STORAGE_KEY)
  );

  if (!dismissed) return null;

  function handleClick() {
    localStorage.removeItem(STORAGE_KEY);
    setDismissed(false);
    // Reload so OnboardingWizard re-evaluates localStorage on mount
    window.location.reload();
  }

  return (
    <button
      className="btn btn-primary get-started"
      onClick={handleClick}
      aria-label="Reopen onboarding wizard"
    >
      Get Started
    </button>
  );
}
