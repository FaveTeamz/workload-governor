import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrgManagementPage } from '../OrgManagementPage';

describe('OrgManagementPage', () => {
  const adminAddr = 'GADMINXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const nonAdminAddr = 'GUSERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  it('redirects non-admin users to home page', () => {
    const mockNavigateHome = vi.fn();
    const mockRegister = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue([]);

    render(
      <OrgManagementPage
        connectedWalletAddress={nonAdminAddr}
        adminAddress={adminAddr}
        onRegisterMaintainer={mockRegister}
        fetchRegisteredMaintainers={mockFetch}
        onNavigateHome={mockNavigateHome}
      />
    );

    expect(mockNavigateHome).toHaveBeenCalled();
  });

  it('validates maintainer address and registers maintainer for admin user', async () => {
    const mockNavigateHome = vi.fn();
    const mockRegister = vi.fn().mockResolvedValue(true);
    const mockFetch = vi.fn().mockResolvedValue([]);
    const validMaintainer = 'GMAINTAINERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    render(
      <OrgManagementPage
        connectedWalletAddress={adminAddr}
        adminAddress={adminAddr}
        onRegisterMaintainer={mockRegister}
        fetchRegisteredMaintainers={mockFetch}
        onNavigateHome={mockNavigateHome}
      />
    );

    const orgInput = screen.getByPlaceholderText(/alignment-drips/i);
    const addrInput = screen.getByPlaceholderText(/GXXXXXXXXXXXXXXXX/i);

    fireEvent.change(orgInput, { target: { value: 'org-test' } });
    fireEvent.change(addrInput, { target: { value: validMaintainer } });

    const submitBtn = screen.getByRole('button', { name: /Register Maintainer/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(adminAddr, validMaintainer, 'org-test');
    });
  });
});
