/**
 * jest.setup.api.ts
 *
 * Patches the global `expect` function to accept an optional second `message`
 * argument (used as a failure message hint in some test files).  Jest 29 throws
 * if `expect` receives more than one argument, so we wrap it with a lenient
 * version that drops any extra arguments before delegating to the original.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const originalExpect = (globalThis as any).expect as (...args: unknown[]) => unknown;
if (typeof originalExpect === 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).expect = (actual: unknown, _message?: unknown) => originalExpect(actual);
  // Copy all static properties (extend, assertions, etc.)
  Object.assign((globalThis as any).expect, originalExpect);
}
