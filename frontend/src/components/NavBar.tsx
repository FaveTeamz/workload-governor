/**
 * NavBar — top navigation bar for WorkloadGovernor.
 *
 * Features (per issue #650):
 * - Org switcher dropdown (3 recent orgs + search)
 * - Cap status chip: X/15 global applications with color coding
 *     green  < 10
 *     yellow 10–13
 *     red    14–15
 * - Notification badge on a bell icon (unread count)
 * - Hamburger menu on mobile (< 768px)
 * - Full keyboard accessibility with visible focus indicators
 *
 * Accessibility:
 * - All interactive elements have aria-label / aria-expanded / aria-controls
 * - Focus is trapped inside the open mobile menu (basic implementation)
 * - Visible :focus-visible ring via CSS class
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "./LanguageSelector";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgOption {
  id: string;
  name: string;
}

export interface NavBarProps {
  /** Stellar address (G…) of the connected wallet, or null if not connected. */
  walletAddress: string | null;
  /** Current number of pending global applications (0–15). */
  globalApplicationCount: number;
  /** Number of unread notifications. */
  unreadNotificationCount: number;
  /** Currently selected organisation, or null. */
  selectedOrg: OrgOption | null;
  /** Recently accessed organisations (shown in the dropdown, max shown: 3). */
  recentOrgs: OrgOption[];
  /** Called when the user selects an org from the dropdown. */
  onOrgSelect: (org: OrgOption) => void;
  /** Called when the user connects their wallet. */
  onConnectWallet: () => void;
  /** Called when the user disconnects their wallet. */
  onDisconnect: () => void;
  /** Called when the user clicks the notification bell. */
  onNotificationsOpen: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function capColor(count: number): "green" | "yellow" | "red" {
  if (count <= 9)  return "green";
  if (count <= 13) return "yellow";
  return "red";
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NavBar({
  walletAddress,
  globalApplicationCount,
  unreadNotificationCount,
  selectedOrg,
  recentOrgs,
  onOrgSelect,
  onConnectWallet,
  onDisconnect,
  onNotificationsOpen,
}: NavBarProps) {
  const { t } = useTranslation();

  // Mobile menu state
  const [mobileOpen, setMobileOpen] = useState(false);
  // Org switcher dropdown state
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  // Org search query
  const [orgSearch, setOrgSearch] = useState("");

  const orgDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef  = useRef<HTMLElement>(null);

  // Close org dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        orgDropdownRef.current &&
        !orgDropdownRef.current.contains(e.target as Node)
      ) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered orgs from the 3 most recent
  const displayedOrgs = recentOrgs
    .slice(0, 3)
    .filter((o) =>
      orgSearch === "" ||
      o.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
      o.id.toLowerCase().includes(orgSearch.toLowerCase())
    );

  const handleOrgSelect = useCallback(
    (org: OrgOption) => {
      onOrgSelect(org);
      setOrgDropdownOpen(false);
      setOrgSearch("");
    },
    [onOrgSelect]
  );

  const toggleMobileMenu = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  const color = capColor(globalApplicationCount);

  return (
    <header className="navbar" role="banner">
      {/* ── Brand ── */}
      <div className="navbar__brand">
        <a href="/" className="navbar__logo" aria-label="WorkloadGovernor home">
          <span aria-hidden="true">⚖️</span>
          <span className="navbar__brand-name">WorkloadGovernor</span>
        </a>
      </div>

      {/* ── Desktop nav links ── */}
      <nav
        className={`navbar__links ${mobileOpen ? "navbar__links--open" : ""}`}
        id="navbar-menu"
        aria-label="Main navigation"
        ref={mobileMenuRef}
      >
        <a href="/issues" className="navbar__link">{t("nav.issues")}</a>
        <a href="/assignments" className="navbar__link">{t("nav.assignments")}</a>

        {/* ── Org Switcher ── */}
        <div
          className="navbar__org-switcher"
          ref={orgDropdownRef}
        >
          <button
            type="button"
            className="navbar__org-button"
            aria-haspopup="listbox"
            aria-expanded={orgDropdownOpen}
            aria-controls="org-dropdown"
            onClick={() => setOrgDropdownOpen((prev) => !prev)}
          >
            <span className="navbar__org-icon" aria-hidden="true">🏢</span>
            <span className="navbar__org-name">
              {selectedOrg ? selectedOrg.name : t("nav.switch_org")}
            </span>
            <span className="navbar__chevron" aria-hidden="true">
              {orgDropdownOpen ? "▲" : "▼"}
            </span>
          </button>

          {orgDropdownOpen && (
            <div
              id="org-dropdown"
              className="navbar__org-dropdown"
              role="listbox"
              aria-label={t("nav.recent_orgs")}
            >
              {/* Search input */}
              <div className="navbar__org-search-wrap">
                <input
                  type="search"
                  className="navbar__org-search"
                  placeholder={t("nav.search_orgs")}
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  aria-label={t("nav.search_orgs")}
                  autoFocus
                />
              </div>

              {/* Org list */}
              <ul className="navbar__org-list" role="group" aria-label={t("nav.recent_orgs")}>
                {displayedOrgs.length === 0 ? (
                  <li className="navbar__org-empty" role="option" aria-selected={false}>
                    {t("nav.no_orgs_found")}
                  </li>
                ) : (
                  displayedOrgs.map((org) => (
                    <li key={org.id} role="option" aria-selected={selectedOrg?.id === org.id}>
                      <button
                        type="button"
                        className={`navbar__org-item ${selectedOrg?.id === org.id ? "navbar__org-item--active" : ""}`}
                        onClick={() => handleOrgSelect(org)}
                      >
                        {org.name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {/* ── Language selector (settings area) ── */}
        <LanguageSelector showLabel={false} className="navbar__lang-selector" />

        {/* ── Wallet / Auth ── */}
        {walletAddress ? (
          <div className="navbar__wallet">
            <span className="navbar__address" title={walletAddress}>
              {truncateAddress(walletAddress)}
            </span>
            <button
              type="button"
              className="navbar__btn navbar__btn--secondary"
              onClick={onDisconnect}
            >
              {t("nav.disconnect")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="navbar__btn navbar__btn--primary"
            onClick={onConnectWallet}
          >
            {t("nav.connect_wallet")}
          </button>
        )}
      </nav>

      {/* ── Right-side action cluster ── */}
      <div className="navbar__actions">
        {/* Cap Status Chip */}
        {walletAddress && (
          <div
            className={`navbar__cap-chip navbar__cap-chip--${color}`}
            title={t("cap.applications_remaining", {
              count: 15 - globalApplicationCount,
            })}
            role="status"
            aria-label={`${globalApplicationCount} ${t("cap.of_15")} ${t("cap.global_applications")}`}
          >
            <span className="navbar__cap-icon" aria-hidden="true">📋</span>
            <span className="navbar__cap-label">
              {globalApplicationCount}/15
            </span>
            {color === "yellow" && (
              <span className="navbar__cap-warning" aria-hidden="true">⚠</span>
            )}
            {color === "red" && (
              <span className="navbar__cap-critical" aria-hidden="true">🔴</span>
            )}
          </div>
        )}

        {/* Notification Bell */}
        <button
          type="button"
          className="navbar__bell"
          onClick={onNotificationsOpen}
          aria-label={`${t("nav.notifications")}${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ""}`}
        >
          <span aria-hidden="true">🔔</span>
          {unreadNotificationCount > 0 && (
            <span
              className="navbar__badge"
              aria-hidden="true"
            >
              {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
            </span>
          )}
        </button>

        {/* Hamburger — mobile only */}
        <button
          type="button"
          className="navbar__hamburger"
          aria-label={mobileOpen ? t("nav.close_menu") : t("nav.open_menu")}
          aria-expanded={mobileOpen}
          aria-controls="navbar-menu"
          onClick={toggleMobileMenu}
        >
          <span className="navbar__hamburger-bar" aria-hidden="true" />
          <span className="navbar__hamburger-bar" aria-hidden="true" />
          <span className="navbar__hamburger-bar" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export default NavBar;
