import React from 'react';

export interface SidebarApplicationBadgeProps {
  currentCount: number;
  maxLimit?: number; // default: 15
}

export const SidebarApplicationBadge: React.FC<SidebarApplicationBadgeProps> = ({
  currentCount,
  maxLimit = 15,
}) => {
  const isNearLimit = currentCount >= 13 && currentCount < maxLimit;
  const isAtLimit = currentCount >= maxLimit;

  const getBadgeColorClasses = () => {
    if (isAtLimit) {
      return 'bg-red-500 text-white dark:bg-red-600 animate-pulse';
    }
    if (isNearLimit) {
      return 'bg-amber-500 text-white dark:bg-amber-600 font-bold';
    }
    return 'bg-blue-600 text-white dark:bg-blue-500';
  };

  const getStatusText = () => {
    if (isAtLimit) return 'Global limit reached! (15/15)';
    if (isNearLimit) return `Approaching cap: ${currentCount}/${maxLimit}`;
    return `Pending Applications: ${currentCount}/${maxLimit}`;
  };

  return (
    <div className="sidebar-app-badge-container flex items-center justify-between p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Applications
        </span>
        {isNearLimit && <span title="Warning: Approaching global 15 application cap">⚠️</span>}
        {isAtLimit && <span title="Limit Reached: Cannot apply to more issues until withdrawing">🚫</span>}
      </div>

      <div className="relative group">
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-mono font-extrabold shadow-sm transition-all ${getBadgeColorClasses()}`}
        >
          {currentCount}/{maxLimit}
        </span>

        {/* Tooltip on hover */}
        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block whitespace-nowrap px-3 py-1.5 bg-slate-900 text-white text-xs rounded shadow-lg z-20">
          {getStatusText()}
        </div>
      </div>
    </div>
  );
};
