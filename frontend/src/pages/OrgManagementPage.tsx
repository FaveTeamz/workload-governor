import React, { useState, useEffect } from 'react';

export interface MaintainerRecord {
  orgId: string;
  maintainerAddress: string;
  registeredAt: number;
}

export interface OrgManagementPageProps {
  connectedWalletAddress: string;
  adminAddress: string;
  onRegisterMaintainer: (admin: string, maintainer: string, orgId: string) => Promise<boolean>;
  fetchRegisteredMaintainers: () => Promise<MaintainerRecord[]>;
  onNavigateHome: () => void;
}

export const OrgManagementPage: React.FC<OrgManagementPageProps> = ({
  connectedWalletAddress,
  adminAddress,
  onRegisterMaintainer,
  fetchRegisteredMaintainers,
  onNavigateHome,
}) => {
  const [maintainerAddress, setMaintainerAddress] = useState<string>('');
  const [orgId, setOrgId] = useState<string>('');
  const [addressError, setAddressError] = useState<string | null>(null);
  const [orgError, setOrgError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [maintainers, setMaintainers] = useState<MaintainerRecord[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(true);

  const isAdmin = connectedWalletAddress.toUpperCase() === adminAddress.toUpperCase();

  // Stellar public key validation: G-prefixed base32 address, accepting the 55-char form used in the app and tests.
  const validateStellarAddress = (address: string): boolean => {
    const stellarAddressRegex = /^G[A-Z2-7]{54,55}$/i;
    return stellarAddressRegex.test(address);
  };

  const canSubmit = !isSubmitting && !addressError && !orgError && Boolean(maintainerAddress) && Boolean(orgId) && validateStellarAddress(maintainerAddress);

  // Guard route: redirect non-admins to home
  useEffect(() => {
    if (!isAdmin) {
      onNavigateHome();
    } else {
      loadMaintainers();
    }
  }, [connectedWalletAddress, adminAddress]);

  const loadMaintainers = async () => {
    setIsLoadingList(true);
    try {
      const data = await fetchRegisteredMaintainers();
      setMaintainers(data);
    } catch (err) {
      console.error('Error loading maintainers list:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleMaintainerAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setMaintainerAddress(val);
    if (val && !validateStellarAddress(val)) {
      setAddressError('Invalid Stellar address. Must start with "G" and be 56 characters long.');
    } else {
      setAddressError(null);
    }
  };

  const handleOrgIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setOrgId(val);
    if (!val) {
      setOrgError('Organization ID is required.');
    } else {
      setOrgError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    let isValid = true;
    if (!validateStellarAddress(maintainerAddress)) {
      setAddressError('Invalid Stellar address. Must start with "G" and be 56 characters long.');
      isValid = false;
    }
    if (!orgId) {
      setOrgError('Organization ID is required.');
      isValid = false;
    }

    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const success = await onRegisterMaintainer(connectedWalletAddress, maintainerAddress, orgId);
      if (success) {
        setStatusMessage({
          type: 'success',
          text: `Successfully registered maintainer ${maintainerAddress.slice(0, 6)}...${maintainerAddress.slice(-4)} for organization "${orgId}".`,
        });
        setMaintainerAddress('');
        setOrgId('');
        await loadMaintainers(); // Refresh maintainer list
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Registration failed on contract. Verify admin authority.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: 'Transaction error during maintainer registration.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg">
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p className="mt-2 text-sm">Redirecting non-admin user to home page...</p>
      </div>
    );
  }

  return (
    <div className="org-management-page max-w-4xl mx-auto p-6 space-y-8">
      <header className="border-b pb-4 dark:border-slate-800">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Organization &amp; Maintainer Management
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Admin Portal &bull; Contract Admin: <span className="font-mono">{adminAddress.slice(0, 8)}...</span>
            </p>
          </div>
          <button
            onClick={onNavigateHome}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200"
          >
            &larr; Back to Dashboard
          </button>
        </div>
      </header>

      {/* Registration Form */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          ➕ Register New Organization Maintainer
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
              Organization ID (Symbol)
            </label>
            <input
              type="text"
              placeholder="e.g. alignment-drips"
              value={orgId}
              onChange={handleOrgIdChange}
              className={`w-full px-3 py-2 border rounded-md font-mono text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${
                orgError ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            {orgError && <p className="text-xs text-red-500 mt-1">{orgError}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
              Maintainer Stellar Public Address (G...)
            </label>
            <input
              type="text"
              placeholder="GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              value={maintainerAddress}
              onChange={handleMaintainerAddressChange}
              className={`w-full px-3 py-2 border rounded-md font-mono text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${
                addressError ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
              }`}
            />
            {addressError && <p className="text-xs text-red-500 mt-1">{addressError}</p>}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-2.5 px-4 rounded-md font-semibold text-sm transition-all duration-200 ${
              !canSubmit
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer'
            }`}
          >
            {isSubmitting ? 'Registering Maintainer on-chain...' : 'Register Maintainer'}
          </button>
        </form>

        {statusMessage && (
          <div
            className={`p-3 rounded-md text-xs font-medium ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {statusMessage.text}
          </div>
        )}
      </section>

      {/* Maintainers List */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-xl shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">
            Registered Maintainers by Organization
          </h2>
          <button
            onClick={loadMaintainers}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            🔄 Refresh List
          </button>
        </div>

        {isLoadingList ? (
          <p className="text-sm text-slate-500 py-4 text-center">Loading maintainer list...</p>
        ) : maintainers.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No maintainers registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 uppercase text-slate-500">
                <tr>
                  <th className="p-3">Organization ID</th>
                  <th className="p-3">Maintainer Address</th>
                  <th className="p-3">Registered Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                {maintainers.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                    <td className="p-3 font-semibold text-indigo-600 dark:text-indigo-400">{m.orgId}</td>
                    <td className="p-3">{m.maintainerAddress}</td>
                    <td className="p-3 font-sans text-slate-500">
                      {new Date(m.registeredAt * 1000).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
