'use client';

type EmptyStateVariant = 'no-issues' | 'no-assignments' | 'no-history';

type EmptyStateProps = {
  variant: EmptyStateVariant;
  className?: string;
};

type VariantConfig = {
  illustration: string;
  alt: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

const VARIANTS: Record<EmptyStateVariant, VariantConfig> = {
  'no-issues': {
    illustration: '/illustrations/no-open-issues.svg',
    alt: '',
    headline: 'No Open Issues',
    body: 'There are no open issues to apply for right now. Check back soon!',
    ctaLabel: 'Browse Issues',
    ctaHref: '/issues',
  },
  'no-assignments': {
    illustration: '/illustrations/no-active-assignments.svg',
    alt: '',
    headline: 'No Active Assignments',
    body: 'You have no active assignments. Apply for an issue to get started.',
    ctaLabel: 'Apply for an Issue',
    ctaHref: '/issues',
  },
  'no-history': {
    illustration: '/illustrations/no-history-yet.svg',
    alt: '',
    headline: 'No History Yet',
    body: 'No events yet. Your activity will appear here once you start applying.',
    ctaLabel: 'Get Started',
    ctaHref: '/issues',
  },
};

/**
 * EmptyState component — issue #317.
 *
 * Renders a contextual illustration, headline, supporting copy, and a CTA
 * button for each of the three dashboard empty states.
 *
 * Accessibility:
 *  - Illustration wrapper has aria-hidden="true" (decorative)
 *  - Headline uses <h3> for correct heading hierarchy under section <h2>s
 *  - CTA is a styled anchor tag (navigates to /issues)
 *  - Float animation respects prefers-reduced-motion via CSS
 *
 * Dark mode:
 *  - SVGs use currentColor so they adapt automatically
 *  - Tailwind dark: classes handle all text/background colours
 */
export default function EmptyState({ variant, className = '' }: EmptyStateProps) {
  const config = VARIANTS[variant];

  return (
    <div
      data-testid={`empty-state-${variant}`}
      className={`flex flex-col items-center justify-center gap-6 py-16 text-center ${className}`}
    >
      {/* Decorative illustration — aria-hidden to skip for screen readers */}
      <div
        aria-hidden="true"
        className="float-animation text-[var(--color-text-secondary)] dark:text-[var(--color-text-secondary)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.illustration}
          alt={config.alt}
          width={160}
          height={128}
          className="mx-auto opacity-80 dark:opacity-60"
          aria-hidden="true"
        />
      </div>

      {/* Headline */}
      <div className="flex flex-col gap-2">
        <h3 className="text-xl font-semibold text-[var(--color-text-primary)] dark:text-gray-100">
          {config.headline}
        </h3>
        <p className="max-w-sm text-sm text-[var(--color-text-secondary)] dark:text-gray-400">
          {config.body}
        </p>
      </div>

      {/* CTA */}
      <a
        href={config.ctaHref}
        className="touch-target inline-flex items-center rounded-md bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:bg-brand-500 dark:hover:bg-brand-600"
      >
        {config.ctaLabel}
      </a>
    </div>
  );
}
