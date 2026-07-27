'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';

const NAV_LINKS = [
  { label: 'Dashboard', href: '/' },
  { label: 'Issues', href: '/issues' },
  { label: 'Assignments', href: '/assignments' },
  { label: 'History', href: '/history' },
];

/**
 * Responsive navigation bar.
 *
 * - Desktop (≥ 768px): horizontal link row
 * - Mobile (< 768px): collapses to a hamburger button that opens a full-width
 *   dropdown. Closes on Escape key or outside click.
 *
 * All interactive elements meet the WCAG 2.5.5 minimum touch target of 44×44 px.
 */
export default function NavBar() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        isOpen &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        hamburgerRef.current &&
        !hamburgerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Close on Escape
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') setIsOpen(false);
  };

  return (
    <nav
      className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)] shadow-sm"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo / Brand */}
        <a
          href="/"
          className="text-lg font-bold text-brand-600 dark:text-brand-500"
        >
          WorkloadGovernor
        </a>

        {/* Desktop nav links — hidden below md (768px) */}
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
          aria-controls="mobile-menu"
          data-testid="hamburger-button"
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          className="touch-target rounded md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {/* Three-bar icon */}
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

      {/* Mobile menu dropdown */}
      {isOpen && (
        <div
          id="mobile-menu"
          ref={menuRef}
          data-testid="mobile-menu"
          role="navigation"
          aria-label="Mobile navigation"
          className="border-t border-[var(--color-border)] bg-[var(--color-bg)] md:hidden"
        >
          <ul className="flex flex-col py-2" role="list">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="touch-target flex w-full items-center px-6 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-600"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
