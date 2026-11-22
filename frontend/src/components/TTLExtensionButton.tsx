import React, { useState, useEffect } from 'react';

export interface TTLExtensionButtonProps {
  contributorAddress: string;
  orgId: string;
  issueId: number;
  /** Unix timestamp (in seconds) when the application TTL expires */
  expiryTimestamp: number;
  /** Configurable threshold in seconds below which extension is allowed (default: 86400s / 24 hours) */
  nearExpiryThresholdSeconds?: number;
  /** Callback invoked when application TTL is extended */
  onExtendTTL: (contributor: string, orgId: string, issueId: number) => Promise<boolean>;
}

export const TTLExtensionButton: React.FC<TTLExtensionButtonProps> = ({
  contributorAddress,
  orgId,
  issueId,
  expiryTimestamp,
  nearExpiryThresholdSeconds = 86400, // 24 hours default
  onExtendTTL,
}) => {
  const [nowSeconds, setNowSeconds] = useState<number>(Math.floor(Date.now() / 1000));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Update current time every second for accurate countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingSeconds = Math.max(0, expiryTimestamp - nowSeconds);
  const isNearExpiry = remainingSeconds <= nearExpiryThresholdSeconds;

  // Format remaining seconds into DD:HH:MM:SS format
  const formatCountdown = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return 'Expired';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  const handleExtend = async () => {
    if (!isNearExpiry || isSubmitting) return;

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const success = await onExtendTTL(contributorAddress, orgId, issueId);
      if (success) {
        setStatusMessage('TTL extended successfully!');
      } else {
        setStatusMessage('Failed to extend TTL.');
      }
    } catch (err) {
      setStatusMessage('Error submitting TTL extension transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ttl-extension-container p-4 border rounded-lg shadow-sm bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold block">
            Application TTL
          </span>
          <span
            className={`font-mono text-lg font-bold ${
              remainingSeconds <= 0
                ? 'text-red-600 dark:text-red-400'
                : isNearExpiry
                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            ⏱️ {formatCountdown(remainingSeconds)}
          </span>
        </div>

        <div className="relative group">
          <button
            onClick={handleExtend}
            disabled={!isNearExpiry || isSubmitting || remainingSeconds <= 0}
            aria-disabled={!isNearExpiry || isSubmitting || remainingSeconds <= 0}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
              isNearExpiry && remainingSeconds > 0 && !isSubmitting
                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md cursor-pointer'
                : 'bg-gray-200 dark:bg-slate-800 text-gray-400 dark:text-gray-600 cursor-not-allowed border border-gray-300 dark:border-slate-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                Extending...
              </>
            ) : (
              <>⚡ Extend TTL</>
            )}
          </button>

          {!isNearExpiry && remainingSeconds > 0 && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg text-center z-10">
              TTL is sufficient. Extension available when near expiry (&lt;{Math.round(nearExpiryThresholdSeconds / 3600)}h).
            </div>
          )}
        </div>
      </div>

      {statusMessage && (
        <p
          className={`mt-2 text-xs font-medium ${
            statusMessage.includes('successfully') ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
};
