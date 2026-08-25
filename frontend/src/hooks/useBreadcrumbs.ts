import { useLocation, useParams } from "react-router-dom";
import type { BreadcrumbItem } from "../components/Breadcrumb";

/**
 * useBreadcrumbs
 *
 * Builds an ordered list of BreadcrumbItem objects from the current React
 * Router location and route params.  Route-to-crumb mapping is driven by
 * the ROUTE_CONFIGS table below — add a new entry whenever a new route is
 * introduced.
 *
 * Format produced (issue detail example):
 *   Home > <org_id> > Issue <issue_id>
 */

interface RouteConfig {
  /** Regex that matches the full pathname */
  pattern: RegExp;
  /**
   * Builds the breadcrumb chain from extracted params and any extra context
   * passed by the calling component.
   */
  build: (params: Record<string, string>, context: BreadcrumbContext) => BreadcrumbItem[];
}

export interface BreadcrumbContext {
  /** Human-readable org name, falls back to org_id when not provided */
  orgName?: string;
  /** Human-readable issue title, falls back to issue_id when not provided */
  issueTitle?: string;
  /** Human-readable contributor display name, falls back to truncated address */
  contributorName?: string;
}

const HOME: BreadcrumbItem = { label: "Home", path: "/" };

const ROUTE_CONFIGS: RouteConfig[] = [
  // /maintainer/:org_id
  {
    pattern: /^\/maintainer\/([^/]+)$/,
    build: ([orgId], ctx) => [
      HOME,
      { label: ctx.orgName ?? orgId, path: `/orgs/${orgId}` },
      { label: "Maintainer Dashboard" },
    ],
  },
  // /orgs/:org_id/issues/:issue_id
  {
    pattern: /^\/orgs\/([^/]+)\/issues\/([^/]+)$/,
    build: ([orgId, issueId], ctx) => [
      HOME,
      { label: ctx.orgName ?? orgId, path: `/orgs/${orgId}` },
      { label: ctx.issueTitle ?? `Issue ${issueId}` },
    ],
  },
  // /orgs/:org_id
  {
    pattern: /^\/orgs\/([^/]+)$/,
    build: ([orgId], ctx) => [
      HOME,
      { label: ctx.orgName ?? orgId },
    ],
  },
  // /contributors/:address
  {
    pattern: /^\/contributors\/([^/]+)$/,
    build: ([address], ctx) => [
      HOME,
      { label: ctx.contributorName ?? truncateAddress(address) },
    ],
  },
  // /orgs/:org_id/contributors/:address
  {
    pattern: /^\/orgs\/([^/]+)\/contributors\/([^/]+)$/,
    build: ([orgId, address], ctx) => [
      HOME,
      { label: ctx.orgName ?? orgId, path: `/orgs/${orgId}` },
      { label: ctx.contributorName ?? truncateAddress(address) },
    ],
  },
];

function truncateAddress(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

/**
 * Derive breadcrumbs from route params + optional context.
 *
 * Components can pass `context` to supply human-readable labels (e.g. the
 * org name fetched from the API) so breadcrumbs are more informative than
 * raw IDs.
 */
export function useBreadcrumbs(context: BreadcrumbContext = {}): BreadcrumbItem[] {
  const location = useLocation();
  const params = useParams<Record<string, string>>();

  const pathname = location.pathname;

  for (const config of ROUTE_CONFIGS) {
    const match = pathname.match(config.pattern);
    if (match) {
      // match[0] is the full string; positional groups start at index 1
      const groups = match.slice(1);
      return config.build(groups, context);
    }
  }

  // Fallback: just show Home for unknown routes
  return [HOME];
}
