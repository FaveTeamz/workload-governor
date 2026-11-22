import React, { useState } from 'react';
import { TTLExtensionButton } from './TTLExtensionButton';

export interface ApplicationCardProps {
  contributorAddress: string;
  orgId: string;
  issueId: number;
  title: string;
  submittedAtTimestamp: number;
  initialExpiryTimestamp: number;
  nearExpiryThresholdSeconds?: number;
  onExtendTTLContractCall: (contributor: string, orgId: string, issueId: number) => Promise<boolean>;
}

export const ApplicationCard: React.FC<ApplicationCardProps> = ({
  contributorAddress,
  orgId,
  issueId,
  title,
  submittedAtTimestamp,
  initialExpiryTimestamp,
  nearExpiryThresholdSeconds = 86400,
  onExtendTTLContractCall,
}) => {
  const [expiryTimestamp, setExpiryTimestamp] = useState<number>(initialExpiryTimestamp);

  const handleExtend = async (contributor: string, org: string, id: number): Promise<boolean> => {
    const success = await onExtendTTLContractCall(contributor, org, id);
    if (success) {
      // Extend TTL display by 7 days (604,800 seconds) upon successful contract execution
      setExpiryTimestamp((prev) => prev + 604800);
    }
    return success;
  };

  return (
    <div className="application-card border rounded-xl p-5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
            {orgId}
          </span>
          <h3 className="text-lg font-bold mt-1 text-slate-900 dark:text-slate-100">
            #{issueId}: {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Submitted {new Date(submittedAtTimestamp * 1000).toLocaleDateString()}
          </p>
        </div>
      </div>

      <TTLExtensionButton
        contributorAddress={contributorAddress}
        orgId={orgId}
        issueId={issueId}
        expiryTimestamp={expiryTimestamp}
        nearExpiryThresholdSeconds={nearExpiryThresholdSeconds}
        onExtendTTL={handleExtend}
      />
    </div>
  );
};
