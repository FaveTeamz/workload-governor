/**
 * LocaleDemo.stories.tsx
 *
 * Storybook stories demonstrating locale rendering (issue #653).
 *
 * Shows the NavBar and key strings in all 4 supported locales:
 *   en-US, es, fr, pt-BR
 *
 * The pt-BR story specifically verifies:
 *   - Date format: DD/MM/YYYY (Brazilian convention)
 *   - Number format: period as thousands separator, comma as decimal
 *   - Currency: not used — all amounts shown as plain XLM numbers
 *   - Translations cover all existing strings
 */

import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { I18nextProvider } from "react-i18next";
import i18n from "../i18n";
import { NavBar } from "../components/NavBar";
import { LanguageSelector } from "../components/LanguageSelector";
import { formatDate, formatNumber } from "../i18n";
import "../components/navbar.css";

// ── Helper component ──────────────────────────────────────────────────────────

interface LocalePreviewProps {
  locale: "en-US" | "es" | "fr" | "pt-BR";
}

function LocalePreview({ locale }: LocalePreviewProps) {
  // Temporarily set locale for render
  React.useEffect(() => {
    i18n.changeLanguage(locale);
  }, [locale]);

  const sampleDate = new Date("2026-08-28");
  const sampleNumber = 1234567.89;

  return (
    <I18nextProvider i18n={i18n}>
      <div style={{ fontFamily: "sans-serif", padding: "1.5rem", background: "#0f172a", color: "#f1f5f9" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1rem", color: "#94a3b8" }}>
          Locale: <strong style={{ color: "#f1f5f9" }}>{locale}</strong>
        </h2>

        {/* NavBar rendered in this locale */}
        <NavBar
          walletAddress="GBZX4364PEPQTDICMIQDZ56K4T75QZCR4NBEYKO6PDRJAHZKGUOJPCXB"
          globalApplicationCount={11}
          unreadNotificationCount={3}
          selectedOrg={{ id: "stellar-oss", name: "stellar-oss" }}
          recentOrgs={[
            { id: "stellar-oss",    name: "stellar-oss" },
            { id: "alignmentdrips", name: "alignmentdrips" },
            { id: "soroban-tools",  name: "soroban-tools" },
          ]}
          onOrgSelect={() => {}}
          onConnectWallet={() => {}}
          onDisconnect={() => {}}
          onNotificationsOpen={() => {}}
        />

        {/* Format verification table */}
        <table style={{
          marginTop: "1.5rem",
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
        }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b", color: "#94a3b8" }}>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Format</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Input</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Rendered</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              <td style={{ padding: "0.5rem" }}>Date</td>
              <td style={{ padding: "0.5rem", fontFamily: "monospace", color: "#94a3b8" }}>
                2026-08-28
              </td>
              <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>
                {formatDate(sampleDate, locale)}
              </td>
            </tr>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              <td style={{ padding: "0.5rem" }}>Number</td>
              <td style={{ padding: "0.5rem", fontFamily: "monospace", color: "#94a3b8" }}>
                1234567.89
              </td>
              <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>
                {formatNumber(sampleNumber, locale)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "0.5rem" }}>Currency</td>
              <td style={{ padding: "0.5rem", fontFamily: "monospace", color: "#94a3b8" }}>
                N/A (XLM amounts)
              </td>
              <td style={{ padding: "0.5rem", color: "#22c55e" }}>
                ✓ Not used — plain numbers only
              </td>
            </tr>
          </tbody>
        </table>

        {/* Language selector widget */}
        <div style={{ marginTop: "1.5rem" }}>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
            Language selector widget:
          </p>
          <LanguageSelector showLabel />
        </div>
      </div>
    </I18nextProvider>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "i18n/Locale Demo",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Demonstrates all supported locales. The pt-BR story verifies Brazilian date format (DD/MM/YYYY), number format (period as thousands separator, comma as decimal), and absence of currency display.",
      },
    },
  },
};

export default meta;
type Story = StoryObj;

// ── Stories ───────────────────────────────────────────────────────────────────

export const EnglishUS: Story = {
  name: "en-US — English (United States)",
  render: () => <LocalePreview locale="en-US" />,
  parameters: {
    docs: {
      description: { story: "Baseline English locale. Date format: MM/DD/YYYY." },
    },
  },
};

export const Spanish: Story = {
  name: "es — Español",
  render: () => <LocalePreview locale="es" />,
  parameters: {
    docs: {
      description: { story: "Spanish locale. Date format: DD/MM/YYYY." },
    },
  },
};

export const French: Story = {
  name: "fr — Français",
  render: () => <LocalePreview locale="fr" />,
  parameters: {
    docs: {
      description: { story: "French locale. Date format: DD/MM/YYYY." },
    },
  },
};

export const PortugueseBrazil: Story = {
  name: "pt-BR — Português (Brasil) ✨ NEW",
  render: () => <LocalePreview locale="pt-BR" />,
  parameters: {
    docs: {
      description: {
        story: [
          "**Portuguese (Brazil)** locale added in issue #653.",
          "",
          "Verification checklist:",
          "- ✅ Date format: DD/MM/YYYY (Brazilian convention)",
          "- ✅ Number format: period as thousands separator, comma as decimal",
          "- ✅ Currency: not used — all XLM amounts shown as plain numbers",
          "- ✅ All nav, cap, issue, error, settings, and common strings translated",
          "- ⚠️ Translations pending review by a native Brazilian Portuguese speaker",
          "  (see PR description)",
        ].join("\n"),
      },
    },
  },
};
