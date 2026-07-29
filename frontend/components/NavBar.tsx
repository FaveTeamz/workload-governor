'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useFocusTrap } from '../src/hooks/useFocusTrap';

const NAV_LINKS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Issues', href: '/issues' },
  { label: 'Assignments', href: '/assignments' },
  { label: 'History', href: '/history' },
];

/**
 * Responsive navigation bar (issue #17).
 *
 * - Desktop (≥ 768 px): horizontal link row in the top bar.
 * - Mobile (< 768 px): hamburger button opens a slide-in drawer from the left.
 *   The drawer:
 *     • Traps focus (via useFocusTrap) so keyboard users cannot tab outside.
 *     • Closes on backdrop click, nav-link click, Escape key, or the close ×
 *       button inside the drawer.
 *     • Restores focus to the hamburger button on close.
 *     • Locks body scroll while open.
 *
 * All interactive elements meet the WCAG 2.5.5 minimum touch target (44 × 44 px).
 */
export default function NavBar() {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Trap focus inside the drawer while it is open
  useFocusTrap(drawerRef, isOpen);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  /** Close the drawer and return focus to the hamburger button. */
  const close = () => {
    setIsOpen(false);
    // Defer so state update flushes before we try to focus
    requestAnimationFrame(() => hamburgerRef.current?.focus());
  };

  const handleHamburgerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') close();
  };

  return (
    <nav
      className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)] shadow-sm"
      aria-label="Main navigation"
    >
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo / Brand */}
        <a
          href="/"
          className="text-lg font-bold text-brand-600 dark:text-brand-500"
        >
          WorkloadGovernor
        </a>

        {/* Desktop nav links — hidden below md (768 px) */}
        <ul className="hidden md:flex md:items-center md:gap-6" role="list">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="touch-target rounded px-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Hamburger button — visible below md only */}
        <button
          ref={hamburgerRef}
          type="button"
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isOpen}
          aria-controls="mobile-drawer"
          data-testid="hamburger-button"
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={handleHamburgerKeyDown}
          className="touch-target rounded md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {/* Animated three-bar / × icon */}
          <span className="flex flex-col gap-[5px]" aria-hidden="true">
            <span
              className={`block h-0.5 w-6 rounded bg-[var(--color-text-primary)] transition-transform duration-200 ${
                isOpen ? 'translate-y-[7px] rotate-45' : ''
              }`}
            />
            <span
              className={`block h-0.5 w-6 rounded bg-[var(--color-text-primary)] transition-opacity duration-200 ${
                isOpen ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`block h-0.5 w-6 rounded bg-[var(--color-text-primary)] transition-transform duration-200 ${
                isOpen ? '-translate-y-[7px] -rotate-45' : ''
              }`}
            />
          </span>
        </button>
      </div>

      {/* ── Backdrop ────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          aria-hidden="true"
          data-testid="drawer-backdrop"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={close}
        />
      )}

      {/* ── Slide-in drawer ─────────────────────────────────────────── */}
      {isOpen && (
        <nav
          id="mobile-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          data-testid="mobile-drawer"
          className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[var(--color-bg)] shadow-xl md:hidden"
          style={{
            transform: 'translateX(0)',
            transition: 'transform 250ms ease-in-out',
          }}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
            <span className="text-lg font-bold text-brand-600">
              WorkloadGovernor
            </span>

            {/* Close button */}
            <button
              type="button"
              aria-label="Close navigation menu"
              data-testid="drawer-close-button"
              onClick={close}
              className="touch-target rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              {/* × SVG icon */}
              <svg
                aria-hidden="true"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Nav links */}
          <ul className="flex flex-col py-4" role="list">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={close}
                  className="touch-target flex w-full items-center px-6 py-3 text-base font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-600"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </nav>
  );
}
