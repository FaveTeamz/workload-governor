import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import i18n from "./i18n";
import { formatDate } from "./utils/formatDate";
import { SettingsPage } from "./components/SettingsPage";
import { MemoryRouter } from "react-router-dom";

describe("i18n Infrastructure", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("initializes with English as default language", () => {
    expect(i18n.language).toBe("en");
    expect(i18n.t("common.appName")).toBe("WorkloadGovernor");
  });

  it("switches language dynamically to Spanish and back", async () => {
    await act(async () => {
      await i18n.changeLanguage("es");
    });
    expect(i18n.language).toBe("es");
    expect(i18n.t("common.appName")).toBe("WorkloadGovernor");
    expect(i18n.t("settings.title")).toBe("Configuración");
    expect(i18n.t("settings.account")).toBe("Cuenta");

    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(i18n.language).toBe("en");
    expect(i18n.t("settings.title")).toBe("Settings");
    expect(i18n.t("settings.account")).toBe("Account");
  });

  it("handles pluralization correctly for count strings in English", () => {
    expect(i18n.t("counts.slot", { count: 1 })).toBe("1 slot");
    expect(i18n.t("counts.slot", { count: 3 })).toBe("3 slots");

    expect(i18n.t("counts.application", { count: 1 })).toBe("1 application");
    expect(i18n.t("counts.application", { count: 2 })).toBe("2 applications");
  });

  it("formats dates using Intl.DateTimeFormat respecting selected locale", () => {
    const testDate = new Date("2026-06-20T00:00:00Z");
    
    const formattedEn = formatDate(testDate, { year: "numeric", month: "short", day: "numeric" }, "en");
    expect(formattedEn).toContain("Jun");
    expect(formattedEn).toContain("2026");

    const formattedEs = formatDate(testDate, { year: "numeric", month: "long", day: "numeric" }, "es");
    expect(formattedEs.toLowerCase()).toContain("junio");
    expect(formattedEs).toContain("2026");
  });

  it("changes displayed language via SettingsPage language dropdown", async () => {
    const mockWallet = {
      address: "GBXXX1ABCDEFGHIJKLMNO12345",
      publicKey: "GBXXX1ABCDEFGHIJKLMNO12345",
      error: null,
      networkMismatch: false,
      connect: () => Promise.resolve(),
      disconnect: () => {},
    };

    let currentSettings = {
      theme: "system" as const,
      language: "en" as const,
      defaultOrg: "",
      hideApplied: false,
      emailNotifications: false,
    };

    const mockSettingsHook = {
      settings: currentSettings,
      updateSetting: (key: string, val: any) => {
        (currentSettings as any)[key] = val;
      },
      resetSettings: () => {},
    };

    render(
      <MemoryRouter>
        <SettingsPage wallet={mockWallet as any} settingsHook={mockSettingsHook as any} />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings");

    const select = screen.getByLabelText(/interface language/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "es" } });
    });

    expect(i18n.language).toBe("es");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Configuración");
  });
});
