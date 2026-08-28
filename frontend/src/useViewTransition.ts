/**
 * useViewTransition.ts
 *
 * Wraps document.startViewTransition (CSS View Transitions API) with a
 * class-toggle fallback for browsers that don't support it yet.
 *
 * Usage:
 *   const navigate = useViewTransition();
 *
 *   // Cross-fade
 *   navigate(() => setView("assignments"));
 *
 *   // Directional slide (forward)
 *   navigate(() => setView("detail"), "forward");
 *
 *   // Directional slide (back)
 *   navigate(() => setView("list"), "back");
 */

import { useCallback, useRef } from "react";

export type TransitionDirection = "forward" | "back" | "none";

/** Duration must match the animation-duration in animations.css (200ms) */
const TRANSITION_DURATION_MS = 200;

/**
 * Sets data-vt-dir on <html> so CSS selectors can pick the right
 * keyframe, then removes it after the transition completes.
 */
function setDirection(dir: TransitionDirection) {
  const root = document.documentElement;
  if (dir === "none") {
    root.removeAttribute("data-vt-dir");
  } else {
    root.setAttribute("data-vt-dir", dir);
  }
}

/**
 * Apply class-fallback transition to a target element.
 * 1. Adds exit class → waits for animation → calls update → adds enter class → done.
 */
function classToggleFallback(
  target: Element,
  update: () => void,
  dir: TransitionDirection
): Promise<void> {
  return new Promise((resolve) => {
    const exitClass =
      dir === "forward"
        ? "vt-exit-forward"
        : dir === "back"
        ? "vt-exit-back"
        : "vt-exit";
    const enterClass =
      dir === "forward"
        ? "vt-enter-forward"
        : dir === "back"
        ? "vt-enter-back"
        : "vt-enter";

    // Phase 1: exit
    target.classList.add(exitClass);

    const afterExit = () => {
      target.classList.remove(exitClass);

      // Phase 2: apply the state change
      update();

      // Phase 3: enter (next frame to ensure new content is painted)
      requestAnimationFrame(() => {
        target.classList.add(enterClass);

        const afterEnter = () => {
          target.classList.remove(enterClass);
          resolve();
        };

        // Clean up via animationend OR timeout fallback
        target.addEventListener("animationend", afterEnter, { once: true });
        setTimeout(afterEnter, TRANSITION_DURATION_MS + 50);
      });
    };

    // Clean up via animationend OR timeout fallback
    target.addEventListener("animationend", afterExit, { once: true });
    setTimeout(afterExit, TRANSITION_DURATION_MS + 50);
  });
}

interface NavigateOptions {
  /** Element to apply class-fallback transitions to (defaults to #main-content) */
  targetSelector?: string;
}

/**
 * Feature-detect helper. Using a separate function avoids TypeScript's
 * exhaustive narrowing of `document` to `never` in the else branch when
 * checking for non-standard properties inline (TS 5.5 issue).
 */
function supportsViewTransitions(): boolean {
  return "startViewTransition" in document;
}

type ViewTransitionDocument = Document & {
  startViewTransition: (callback: () => void) => { finished: Promise<void> };
};
export function useViewTransition(options: NavigateOptions = {}) {
  const { targetSelector = "#main-content" } = options;
  // Track whether a transition is in flight to avoid overlapping calls
  const inFlightRef = useRef(false);

  const navigate = useCallback(
    async (
      update: () => void,
      dir: TransitionDirection = "none"
    ): Promise<void> => {
      if (inFlightRef.current) {
        // If already animating, just apply the update immediately
        update();
        return;
      }

      inFlightRef.current = true;
      setDirection(dir);

      try {
        if (supportsViewTransitions()) {
          // Native View Transitions API path
          const vtDoc = document as ViewTransitionDocument;
          const transition = vtDoc.startViewTransition(() => {
            update();
          });
          await transition.finished;
        } else {
          // Class-toggle fallback
          const target =
            document.querySelector(targetSelector) ??
            document.getElementById("root");

          if (target) {
            await classToggleFallback(target, update, dir);
          } else {
            // No target found — just apply immediately
            update();
          }
        }
      } finally {
        setDirection("none");
        inFlightRef.current = false;
      }
    },
    [targetSelector]
  );

  return navigate;
}
