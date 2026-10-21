import { useState } from "react";
import { ActivityFeed } from "./ActivityFeed";
import { ExportButton } from "./ExportButton";
import { ContributorProfile } from "./ContributorProfile";

const DEMO_ADDRESS = "GBXXX1ABCDEFGHIJKLMNO12345";

export function ActivityPage() {
  const [params] = useSearchParams();
  const address = params.get("address") ?? DEMO_ADDRESS;

  return (
    <div className="activity-page">
      <nav className="activity-page__nav" aria-label="Activity breadcrumb">
        <a href="#/" className="activity-page__back">← Home</a>
        <ExportButton className="activity-page__export" />
      </nav>

      <ContributorProfile
        walletAddress="GBXXX1ABCDEFGHIJKLMNO12345"
        completions={0}
      >
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
      </ContributorProfile>
    </div>
  );
}
