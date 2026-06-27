import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

const STORAGE_KEY = "wg_onboarding_done";

const STEPS = [
  {
    title: "Welcome to WorkloadGovernor",
    content:
      "WorkloadGovernor enforces fair workload caps: max 15 pending applications globally and max 4 active assignments per org. This keeps tasks accessible to everyone.",
  },
  {
    title: "Install Freighter Wallet",
    content:
      "You need the Freighter browser extension to sign Stellar transactions.",
    link: { href: "https://freighter.app", label: "Get Freighter Extension" },
  },
  {
    title: "Connect Your Wallet",
    content:
      "Click the button below to connect your Freighter wallet and authenticate with the platform.",
  },
  {
    title: "Browse Open Issues",
    content:
      "You're ready! Browse open issues and apply for work that interests you.",
    cta: "Browse Issues",
  },
];

interface Props {
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  useEffect(() => {
    if (visible) firstFocusRef.current?.focus();
  }, [visible, step]);

  function dismiss(permanent: boolean) {
    if (permanent) localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
    onComplete?.();
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss(true);
  }

  function prev() {
    if (step > 0) setStep((s) => s - 1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") dismiss(false);
    if (e.key === "ArrowRight") next();
    if (e.key === "ArrowLeft") prev();
    // Keep focus trapped inside dialog
    if (e.key === "Tab") {
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, a, [tabindex="0"]'
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

  const current = STEPS[step];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Onboarding step ${step + 1} of ${STEPS.length}: ${current.title}`}
      className="onboarding-overlay"
      onKeyDown={handleKeyDown}
    >
      <div className="onboarding-dialog" ref={dialogRef}>
        {/* Step indicators */}
        <div className="onboarding-steps" aria-label="Progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`step-dot${i === step ? " active" : ""}${i < step ? " done" : ""}`}
              aria-label={`Step ${i + 1}${i === step ? ", current" : i < step ? ", completed" : ""}`}
            />
          ))}
        </div>

        <h2 id="onboarding-title">{current.title}</h2>
        <p>{current.content}</p>

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

        {current.cta && (
          <button className="btn btn-primary" onClick={() => dismiss(true)}>
            {current.cta}
          </button>
        )}

        <div className="onboarding-actions">
          {step > 0 && (
            <button
              className="btn btn-ghost"
              onClick={prev}
              aria-label="Previous step"
            >
              Back
            </button>
          )}

          <button
            ref={firstFocusRef}
            className="btn btn-primary"
            onClick={next}
            aria-label={
              step < STEPS.length - 1
                ? `Next step (${step + 1} of ${STEPS.length})`
                : "Finish onboarding"
            }
          >
            {step < STEPS.length - 1 ? "Next" : "Get Started"}
          </button>

          <button
            className="btn btn-ghost"
            onClick={() => dismiss(true)}
            aria-label="Skip onboarding and don't show again"
          >
            Skip
          </button>
        </div>

        <button
          className="onboarding-close"
          onClick={() => dismiss(false)}
          aria-label="Close onboarding dialog"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Show this when onboarding was previously skipped */
export function GetStartedButton() {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem(STORAGE_KEY)
  );

  if (!dismissed) return null;

  return (
    <button
      className="btn btn-primary get-started"
      onClick={() => {
        localStorage.removeItem(STORAGE_KEY);
        setDismissed(false);
        window.location.reload();
      }}
      aria-label="Reopen onboarding wizard"
    >
      Get Started
    </button>
  );
}
