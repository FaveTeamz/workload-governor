import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OrgSelector, Org } from "./OrgSelector";

const mockOrgs: Org[] = [
  { id: "stellar-org", name: "Stellar Org", activeIssueCount: 5 },
  { id: "meridian-dao", name: "Meridian DAO", activeIssueCount: 2 },
  { id: "soroban-labs", name: "Soroban Labs", activeIssueCount: 8 },
];

function renderOrgSelector(props: Partial<Parameters<typeof OrgSelector>[0]> = {}) {
  return render(
    <MemoryRouter>
      <OrgSelector orgs={mockOrgs} {...props} />
    </MemoryRouter>
  );
}

describe("OrgSelector (Issue #853 / FE-018)", () => {
  it("renders with proper ARIA combobox attributes", () => {
    renderOrgSelector();
    const combobox = screen.getByRole("combobox");
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute("aria-expanded", "false");
    expect(combobox).toHaveAttribute("aria-autocomplete", "list");
    expect(combobox).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("opens dropdown and focuses first item on ArrowDown when closed", () => {
    renderOrgSelector();
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(input).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();

    const options = screen.getAllByRole("option");
    expect(options.length).toBe(mockOrgs.length + 1); // "All Orgs" + 3 mock orgs
    expect(options[0]).toHaveClass("org-selector__option--active");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
  });

  it("navigates down and up using ArrowDown and ArrowUp keys", () => {
    renderOrgSelector();
    const input = screen.getByRole("combobox");

    // Open with ArrowDown -> highlights index 0 ("All Orgs")
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveClass("org-selector__option--active");

    // Next -> index 1 (stellar-org)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[1]).toHaveClass("org-selector__option--active");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);

    // Next -> index 2 (meridian-dao)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(options[2]).toHaveClass("org-selector__option--active");

    // Up -> back to index 1 (stellar-org)
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(options[1]).toHaveClass("org-selector__option--active");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
  });

  it("selects highlighted org and closes dropdown when Enter is pressed", () => {
    const handleSelect = vi.fn();
    renderOrgSelector({ onSelect: handleSelect });
    const input = screen.getByRole("combobox");

    // Open dropdown
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Move to first org (index 1: stellar-org)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Press Enter to select
    fireEvent.keyDown(input, { key: "Enter" });

    expect(handleSelect).toHaveBeenCalledWith("stellar-org");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects highlighted org and closes dropdown when Tab is pressed", () => {
    const handleSelect = vi.fn();
    renderOrgSelector({ onSelect: handleSelect });
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" }); // opens at index 0
    fireEvent.keyDown(input, { key: "ArrowDown" }); // index 1: stellar-org
    fireEvent.keyDown(input, { key: "ArrowDown" }); // index 2: meridian-dao
    fireEvent.keyDown(input, { key: "Tab" });

    expect(handleSelect).toHaveBeenCalledWith("meridian-dao");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes dropdown without changing selection when Escape is pressed", () => {
    const handleSelect = vi.fn();
    renderOrgSelector({ onSelect: handleSelect });
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it("sets aria-selected='true' on the currently selected option", () => {
    renderOrgSelector();
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    // Initially "All Orgs" (id: "") is selected
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");

    // Select second option
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    // Reopen dropdown
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const updatedOptions = screen.getAllByRole("option");
    expect(updatedOptions[1]).toHaveAttribute("aria-selected", "true");
    expect(updatedOptions[0]).toHaveAttribute("aria-selected", "false");
  });
});
