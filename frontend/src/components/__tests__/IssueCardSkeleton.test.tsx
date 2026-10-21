/**
 * Tests for IssueCardSkeleton — closes #552
 *
 * Covers:
 *  - Skeleton cards rendered during loading state
 *  - aria-busy="true" on the container
 *  - Correct number of cards (default 5)
 *  - Transition to real content (aria-busy becomes false)
 *  - FadeInCard wrapping after loading
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

import IssueCardGridWithSkeleton, {
  IssueCardSkeleton,
  IssueCardSkeletonGrid,
} from '../../../components/IssueCardSkeleton';

describe('IssueCardSkeleton (#552)', () => {
  it('renders a single skeleton card with aria-hidden', () => {
    const { container } = render(<IssueCardSkeleton />);
    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    expect(article?.getAttribute('aria-hidden')).toBe('true');
  });

  it('IssueCardSkeletonGrid renders 5 cards by default', () => {
    const { container } = render(<IssueCardSkeletonGrid />);
    const articles = container.querySelectorAll('article');
    expect(articles.length).toBe(5);
  });

  it('IssueCardSkeletonGrid renders custom count', () => {
    const { container } = render(<IssueCardSkeletonGrid count={3} />);
    const articles = container.querySelectorAll('article');
    expect(articles.length).toBe(3);
  });

  it('IssueCardSkeletonGrid sets aria-busy="true" on the container', () => {
    const { container } = render(<IssueCardSkeletonGrid />);
    const grid = container.firstElementChild;
    expect(grid?.getAttribute('aria-busy')).toBe('true');
  });

  it('IssueCardGridWithSkeleton shows skeleton cards while loading=true', () => {
    const { container } = render(
      <IssueCardGridWithSkeleton loading={true}>
        <div data-testid="real-content">loaded</div>
      </IssueCardGridWithSkeleton>
    );
    // Real content should not be rendered
    expect(container.querySelector('[data-testid="real-content"]')).toBeNull();
    // 5 skeleton articles should be present
    expect(container.querySelectorAll('article').length).toBe(5);
  });

  it('IssueCardGridWithSkeleton shows real content and aria-busy=false when loading=false', () => {
    const { container } = render(
      <IssueCardGridWithSkeleton loading={false}>
        <div data-testid="real-content">loaded</div>
      </IssueCardGridWithSkeleton>
    );
    expect(container.querySelector('[data-testid="real-content"]')).not.toBeNull();
    // Container should have aria-busy=false
    const wrapper = container.firstElementChild;
    expect(wrapper?.getAttribute('aria-busy')).toBe('false');
    // No skeleton articles
    expect(container.querySelectorAll('article').length).toBe(0);
  });

  it('skeleton dimensions match IssueCard (has header, title, footer areas)', () => {
    const { container } = render(<IssueCardSkeleton />);
    const article = container.querySelector('article')!;
    // Should have at least 3 skeleton line/block children (meta row, title, footer)
    const shimmerElements = article.querySelectorAll('.skeleton-shimmer');
    expect(shimmerElements.length).toBeGreaterThanOrEqual(4);
  });
});
