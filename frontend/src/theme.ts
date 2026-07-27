/**
 * theme.ts — Dark mode toggle with FOUC prevention
 *
 * FOUC prevention: a blocking <script> snippet in the <head> applies the stored
 * preference synchronously before the browser renders any content (see index.html).
 * This module handles the interactive toggle after page load.
 *
 * Storage key: "wg-theme"  →  "dark" | "light" | (absent = follow OS)
 */

export type ThemePreference = "dark" | "light" | "system";

const STORAGE_KEY = "wg-theme";
const DATA_ATTR = "data-theme";
const DARK_VALUE = "dark";
const LIGHT_VALUE = "light";

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Read the user's stored theme preference.
 * Returns undefined when the user has not overridden the OS preference.
 */
export function getStoredPreference(): ThemePreference | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
  } catch {
    // localStorage unavailable (private browsing, security policy)
  }
  return undefined;
}

/** Determine whether dark mode should be active given the stored preference. */
export function shouldUseDarkMode(): boolean {
  const stored = getStoredPreference();
  if (stored === "dark") return true;
  if (stored === "light") return false;
  // Fall back to OS
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply or remove [data-theme=dark] on <html>. */
export function applyTheme(dark: boolean): void {
  const root = document.documentElement;
  if (dark) {
    root.setAttribute(DATA_ATTR, DARK_VALUE);
  } else {
    // Explicitly set light so components that rely on [data-theme=light] work too
    root.setAttribute(DATA_ATTR, LIGHT_VALUE);
  }
}

/** Persist the user's manual choice and apply it immediately. */
export function setTheme(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    // Ignore storage errors — the visual state still updates in-memory
  }
  applyTheme(preference === "system" ? shouldUseDarkMode() : preference === "dark");
  updateToggleIcon();
}

// ---------------------------------------------------------------------------
// Toggle button
// ---------------------------------------------------------------------------

const SUN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
</svg>`;

const MOON_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
</svg>`;

/** Update the toggle button's icon and accessible label to match current mode. */
export function updateToggleIcon(): void {
  const btn = document.getElementById("theme-toggle") as HTMLButtonElement | null;
  if (!btn) return;

  const isDark = document.documentElement.getAttribute(DATA_ATTR) === DARK_VALUE;
  btn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
  btn.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  btn.setAttribute("aria-pressed", String(isDark));
}

/** Handle a click on the toggle button. */
function handleToggleClick(): void {
  const isDark = document.documentElement.getAttribute(DATA_ATTR) === DARK_VALUE;
  setTheme(isDark ? "light" : "dark");
}

// ---------------------------------------------------------------------------
// Illustration swapping
// ---------------------------------------------------------------------------

/** Apply the --illustration-filter CSS variable to all .illustration elements. */
export function swapIllustrations(): void {
  // The CSS variable --illustration-filter already handles this automatically.
  // This function exists as an explicit hook for any JS-controlled <img> swapping.
  const illustrations = document.querySelectorAll<HTMLImageElement>(".illustration[data-dark-src]");
  const isDark = document.documentElement.getAttribute(DATA_ATTR) === DARK_VALUE;
  illustrations.forEach((img) => {
    const lightSrc = img.dataset.lightSrc ?? img.src;
    const darkSrc = img.dataset.darkSrc ?? img.src;
    img.src = isDark ? darkSrc : lightSrc;
    if (!img.dataset.lightSrc) img.dataset.lightSrc = lightSrc;
  });
}

// ---------------------------------------------------------------------------
// OS preference listener
// ---------------------------------------------------------------------------

let mediaQuery: MediaQueryList | undefined;

function handleOsChange(event: MediaQueryListEvent): void {
  // Only react to OS changes if the user has not set a manual preference
  if (!getStoredPreference()) {
    applyTheme(event.matches);
    updateToggleIcon();
    swapIllustrations();
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Call this once after the DOM is ready.
 * - Wires up the toggle button click handler
 * - Starts listening for OS preference changes
 * - Syncs illustration variants
 */
export function initTheme(): void {
  // Apply current preference (re-applies what the blocking <head> snippet did)
  applyTheme(shouldUseDarkMode());
  updateToggleIcon();
  swapIllustrations();

  // Wire toggle button
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", handleToggleClick);
  }

  // Listen for OS preference changes
  if (typeof window !== "undefined" && window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", handleOsChange);
  }
}

/**
 * Inline script to paste into <head> verbatim (minified).
 * Prevents FOUC by synchronously applying the stored preference before first paint.
 *
 * Usage in HTML:
 *   <script>/* FOUC_PREVENTION_SNIPPET *\/</script>
 */
export const FOUC_PREVENTION_SNIPPET = /* js */ `
(function(){try{var p=localStorage.getItem('wg-theme');if(p==='dark'||p==='light'){document.documentElement.setAttribute('data-theme',p);}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();
`.trim();
