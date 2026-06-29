import { useState } from "react";
import { ActivityFeed } from "./ActivityFeed";

const DEMO_ORGS = ["stellar-org", "meridian-dao"];
const NETWORK = (import.meta.env.VITE_STELLAR_NETWORK ?? "testnet") as "testnet" | "mainnet";

export function ActivityPage() {
  const [selectedOrg, setSelectedOrg] = useState<string | undefined>(undefined);

  return (
    <div className="activity-page">
      <nav className="activity-page__nav" aria-label="Activity breadcrumb">
        <a href="#/" className="activity-page__back">← Home</a>
      </nav>

      <div className="activity-page__tabs" role="tablist" aria-label="Org filter">
        <button
          role="tab"
          aria-selected={selectedOrg === undefined}
          className={`af-filter-btn${selectedOrg === undefined ? " af-filter-btn--active" : ""}`}
          onClick={() => setSelectedOrg(undefined)}
        >
          All
        </button>
        {DEMO_ORGS.map((org) => (
          <button
            key={org}
            role="tab"
            aria-selected={selectedOrg === org}
            className={`af-filter-btn${selectedOrg === org ? " af-filter-btn--active" : ""}`}
            onClick={() => setSelectedOrg(org)}
          >
            {org}
          </button>
        ))}
      </div>

      <ActivityFeed apiBase="/api" orgId={selectedOrg} network={NETWORK} />
    </div>
  );
}
