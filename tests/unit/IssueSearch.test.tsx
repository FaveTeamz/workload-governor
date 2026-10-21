import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IssueSearch } from "../../frontend/src/components/IssueSearch";

const SAMPLE_ISSUES = [
  { id: 1, org_id: "stellar-org", title: "Fix TTL extension bug", status: "open" },
  { id: 2, org_id: "stellar-org", title: "Add prop tests for assign_issue", status: "open" },
  { id: 3, org_id: "meridian-dao", title: "Docs: storage design overview", status: "assigned" },
  { id: 4, org_id: "meridian-dao", title: "Optimize WASM binary size", status: "open" },
  { id: 5, org_id: "stellar-org", title: "Integration tests for SDK", status: "completed" },
];

describe("IssueSearch", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ issues: [] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders input with correct ARIA attributes", () => {
    render(<IssueSearch issues={SAMPLE_ISSUES} />);

    const input = screen.getByRole("combobox");
    expect(input).toBeTruthy();
    expect(input.getAttribute("aria-haspopup")).toBe("listbox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-label")).toBe("Search issues");
    expect(input.getAttribute("placeholder")).toContain("Search issues");
  });

  it("shows results matching query after debounce (200ms)", async () => {
    render(<IssueSearch issues={SAMPLE_ISSUES} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "TTL" } });

    // Wait for the 200ms debounce to fire and state to update.
    // Text may be split across <mark> elements, so check via textContent.
    await waitFor(
      () => {
        const titles = document.querySelectorAll(".issue-search__item-title");
        const match = Array.from(titles).find((el) =>
          el.textContent?.includes("Fix TTL extension bug"),
        );
        expect(match).toBeTruthy();
      },
      { timeout: 1000 },
    );
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });

  it("keyboard ArrowDown moves active index to first item", async () => {
    render(<IssueSearch issues={SAMPLE_ISSUES} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "bug" } });

    await waitFor(
      () => expect(input.getAttribute("aria-expanded")).toBe("true"),
      { timeout: 1000 },
    );

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const activeItems = document.querySelectorAll(".issue-search__item--active");
    expect(activeItems.length).toBeGreaterThan(0);
  });

  it("Escape clears query and closes dropdown", async () => {
    render(<IssueSearch issues={SAMPLE_ISSUES} />);
    const input = screen.getByRole("combobox") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "bug" } });

    await waitFor(
      () => expect(input.getAttribute("aria-expanded")).toBe("true"),
      { timeout: 1000 },
    );

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows empty state when query matches nothing", async () => {
    render(<IssueSearch issues={SAMPLE_ISSUES} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "xyzzy123notfound" } });

    await waitFor(
      () => expect(screen.getByText(/No issues found for/i)).toBeTruthy(),
      { timeout: 1000 },
    );

    expect(screen.getByText("Browse all issues")).toBeTruthy();
  });

  it("calls onSelect with null when Browse all issues is clicked", async () => {
    const onSelect = vi.fn();
    render(<IssueSearch issues={SAMPLE_ISSUES} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "xyzzy123notfound" } });

    await waitFor(
      () => expect(screen.getByText("Browse all issues")).toBeTruthy(),
      { timeout: 1000 },
    );

    fireEvent.click(screen.getByText("Browse all issues"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("shows spinner for queries longer than 3 characters", async () => {
    // Never resolve so the spinner stays visible
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<IssueSearch issues={SAMPLE_ISSUES} apiBase="/api" />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "assign" } });

    await waitFor(
      () => expect(screen.getByRole("status", { name: /loading/i })).toBeTruthy(),
      { timeout: 1000 },
    );
  });

  it("calls onSelect with issue when Enter is pressed on active item", async () => {
    const onSelect = vi.fn();
    render(<IssueSearch issues={SAMPLE_ISSUES} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "TTL" } });

    await waitFor(
      () => expect(input.getAttribute("aria-expanded")).toBe("true"),
      { timeout: 1000 },
    );

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Fix TTL extension bug" }),
    );
  });
});
