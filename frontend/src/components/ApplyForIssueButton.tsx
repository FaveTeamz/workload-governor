import React, { useState } from 'react';

export interface ApplyForIssueButtonProps {
  contributorAddress: string;
  orgId: string;
  issueId: number;
  globalAppCount: number;
  maxGlobalLimit?: number; // default: 15
  onApplyContractCall: (contributor: string, orgId: string, issueId: number) => Promise<boolean>;
  onStateChanged?: () => void;
}

export const ApplyForIssueButton: React.FC<ApplyForIssueButtonProps> = ({
  contributorAddress,
  orgId,
  issueId,
  globalAppCount,
  maxGlobalLimit = 15,
  onApplyContractCall,
  onStateChanged,
}) => {
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isLimitReached = globalAppCount >= maxGlobalLimit;

  const handleApply = async () => {
    if (isLimitReached || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const success = await onApplyContractCall(contributorAddress, orgId, issueId);
      if (success) {
        if (onStateChanged) onStateChanged();
      } else {
        setErrorMessage('Failed to submit application.');
      }
    } catch (err) {
      setErrorMessage('Contract error submitting application.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative group inline-block">
      <button
        onClick={handleApply}
        disabled={isLimitReached || isSubmitting}
        aria-disabled={isLimitReached || isSubmitting}
        className={`px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 flex items-center gap-2 ${
          isLimitReached
            ? 'bg-red-100 text-red-400 border border-red-200 cursor-not-allowed dark:bg-red-950/40 dark:text-red-500 dark:border-red-900/50'
            : isSubmitting
            ? 'bg-indigo-400 text-white cursor-wait'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md cursor-pointer'
        }`}
      >
        {isSubmitting ? (
          <>
            <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
            Applying...
          </>
        ) : isLimitReached ? (
          <>🚫 Apply Disabled (15/15)</>
        ) : (
          <>📝 Apply for Issue</>
        )}
      </button>

      {/* Tooltip explaining why Apply button is disabled when limit is 15 */}
      {isLimitReached && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl text-center z-30">
          ⚠️ You have reached the global limit of 15 pending applications. Withdraw an existing application to apply for new issues.
        </div>
      )}

      {errorMessage && <p className="text-xs text-red-600 mt-1">{errorMessage}</p>}
    </div>
  );
};
