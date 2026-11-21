/**
 * NavBar.test.tsx — closes #814
 *
 * Covers:
 *  - Tab does not escape the open drawer (focus trap active)
 *  - Shift+Tab wraps within the drawer
 *  - Escape closes the drawer and restores focus to the hamburger button
 *  - Focus trap is inactive when the drawer is closed
 *  - Hamburger button toggles the menu open/closed
 *  - Clicking a nav link closes the menu
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NavBar } from "./NavBar";

// useFocusTrap calls requestAnimationFrame — stub it so tests run synchronously.
beforeEach(() => {
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    cb(0);
    return 0;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  // Reset any scroll-lock applied by useFocusTrap
  document.body.style.overflow = "";
});

function renderNavBar(props: Partial<React.ComponentProps<typeof NavBar>> = {}) {
  return render(<NavBar {...props} />);
}

function getHamburger() {
  return screen.getByTestId("hamburger-btn");
}

function getMenu() {
  return screen.getByTestId("navbar-menu");
}

// ---------------------------------------------------------------------------
// Hamburger toggle
// ---------------------------------------------------------------------------

describe("NavBar — hamburger toggle", () => {
  it("hamburger button is rendered", () => {
    renderNavBar();
    expect(getHamburger()).toBeInTheDocument();
  });

  it("clicking hamburger opens the menu (aria-expanded becomes true)", () => {
    renderNavBar();
    const btn = getHamburger();
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking hamburger a second time closes the menu", () => {
    renderNavBar();
    const btn = getHamburger();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking a nav link closes the menu", () => {
    renderNavBar();
    fireEvent.click(getHamburger());
    const link = screen.getByText("Activity");
    fireEvent.click(link);
    expect(getHamburger()).toHaveAttribute("aria-expanded", "false");
  });
});

// ---------------------------------------------------------------------------
// Escape closes drawer and restores focus
// ---------------------------------------------------------------------------

describe("NavBar — Escape key", () => {
  it("Escape closes the drawer", () => {
    renderNavBar();
    fireEvent.click(getHamburger());
    expect(getHamburger()).toHaveAttribute("aria-expanded", "true");

    act(() => {
      fireEvent.keyDown(getMenu(), { key: "Escape", bubbles: true });
    });

    expect(getHamburger()).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape restores focus to the hamburger button", () => {
    renderNavBar();
    const hamburger = getHamburger();
    fireEvent.click(hamburger);

    act(() => {
      fireEvent.keyDown(getMenu(), { key: "Escape", bubbles: true });
    });

    expect(document.activeElement).toBe(hamburger);
  });
});

// ---------------------------------------------------------------------------
// Focus trap — Tab stays within the drawer
// ---------------------------------------------------------------------------

describe("NavBar — focus trap", () => {
  it("focus trap is inactive when drawer is closed (body overflow not locked)", () => {
    renderNavBar();
    // With drawer closed, useFocusTrap should not lock scroll
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("focus trap locks body scroll while drawer is open", () => {
    renderNavBar();
    act(() => {
      fireEvent.click(getHamburger());
    });
    // useFocusTrap sets overflow:hidden when active
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("focus trap unlocks body scroll when drawer is closed via Escape", () => {
    renderNavBar();
    act(() => {
      fireEvent.click(getHamburger());
    });
    expect(document.body.style.overflow).toBe("hidden");

    act(() => {
      fireEvent.keyDown(getMenu(), { key: "Escape", bubbles: true });
    });
    expect(document.body.style.overflow).toBe("");
  });

  it("Tab key inside open drawer does not move focus outside the menu", () => {
    renderNavBar({ walletAddress: null });
    act(() => {
      fireEvent.click(getHamburger());
    });

    const menu = getMenu();
    const focusableInMenu = Array.from(
      menu.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusableInMenu.length).toBeGreaterThan(0);

    // Simulate Tab on the last focusable element — the trap handler should
    // wrap focus back to the first element (preventDefault + first.focus()).
    const last = focusableInMenu[focusableInMenu.length - 1];
    last.focus();

    const first = focusableInMenu[0];
    const focusSpy = vi.spyOn(first, "focus");

    act(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: false, bubbles: true });
    });

    expect(focusSpy).toHaveBeenCalled();
  });

  it("Shift+Tab on the first element in the drawer wraps to the last", () => {
    renderNavBar({ walletAddress: null });
    act(() => {
      fireEvent.click(getHamburger());
    });

    const menu = getMenu();
    const focusableInMenu = Array.from(
      menu.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusableInMenu.length).toBeGreaterThan(0);

    const first = focusableInMenu[0];
    first.focus();

    const last = focusableInMenu[focusableInMenu.length - 1];
    const focusSpy = vi.spyOn(last, "focus");

    act(() => {
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true, bubbles: true });
    });

    expect(focusSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Wallet states
// ---------------------------------------------------------------------------

describe("NavBar — wallet states", () => {
  it("shows Connect Wallet button when wallet not connected", () => {
    renderNavBar({ walletAddress: null });
    expect(screen.getByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("shows Install Freighter link when wallet extension missing", () => {
    renderNavBar({ walletAddress: null, walletError: "Please install the Freighter extension" });
    expect(screen.getByRole("link", { name: /install freighter/i })).toBeInTheDocument();
  });

  it("shows wallet address and Disconnect button when connected", () => {
    renderNavBar({ walletAddress: "GABCDEF000000000WXYZ" });
    expect(screen.getByRole("button", { name: /disconnect wallet/i })).toBeInTheDocument();
  });

  it("shows network warning when networkMismatch is true", () => {
    renderNavBar({ walletAddress: "GABCDEF000000000WXYZ", networkMismatch: true });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
