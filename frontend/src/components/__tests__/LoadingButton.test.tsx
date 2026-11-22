import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoadingButton from '../../../components/LoadingButton';

describe('LoadingButton', () => {
  it('shows a loading state and prevents clicks while pending', () => {
    const onClick = vi.fn();

    render(
      <LoadingButton isLoading loadingText="Submitting..." onClick={onClick}>
        Apply
      </LoadingButton>
    );

    const button = screen.getByRole('button', { name: /submitting/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Submitting...')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
