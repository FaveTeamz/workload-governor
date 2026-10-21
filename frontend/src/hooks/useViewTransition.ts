/**
 * useViewTransition
 *
 * Wraps a navigation callback with the View Transitions API (document.startViewTransition).
 * - Respects `prefers-reduced-motion`: skips the transition when the user has opted out.
 * - Gracefully falls back to a plain synchronous call on browsers that don't support the API.
 *
 * Usage:
 *   const navigate = useViewTransition();
 *   <a onClick={() => navigate(() => setHash('#/activity'))}>Activity</a>
 */
export function useViewTransition() {
  /**
   * Wraps `callback` in a view transition, honouring reduced-motion and
   * browser-support constraints.
   */
  function startTransition(callback: () => void): void {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supportsVT = typeof (document as any).startViewTransition === 'function';

    if (supportsVT && !prefersReduced) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document as any).startViewTransition(callback);
    } else {
      // Fallback: execute immediately without animation
      callback();
    }
  }

  return startTransition;
}
