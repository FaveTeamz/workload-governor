/**
 * ActivityPage — /profile/activity route, closes #651
 *
 * Shows a contributor's full chronological activity timeline.
 * Address is read from the `address` query-param; falls back to DEMO.
 */
import { useSearchParams } from "react-router-dom";
import { ActivityTimeline } from "./ActivityTimeline";
import "./ActivityPage.css";

const DEMO_ADDRESS = "GBXXX1ABCDEFGHIJKLMNO12345";

export function ActivityPage() {
  const [params] = useSearchParams();
  const address = params.get("address") ?? DEMO_ADDRESS;

  return (
    <div className="activity-page">
      <nav className="activity-page__nav" aria-label="Breadcrumb">
        <a href="/" className="activity-page__back">
          ← Home
        </a>
      </nav>

      <header className="activity-page__header">
        <h1 className="activity-page__title">Activity Timeline</h1>
        <p className="activity-page__subtitle">
          Your complete application and assignment history, newest first.
        </p>
      </header>

      <ActivityTimeline address={address} apiBase="/api" />
    </div>
  );
}
