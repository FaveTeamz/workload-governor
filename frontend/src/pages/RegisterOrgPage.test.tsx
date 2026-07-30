import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RegisterOrgPage } from "./RegisterOrgPage";

// ---------------------------------------------------------------------------
// Mock react-router-dom navigate
// vi.mock is hoisted, so we can't reference a let-variable inside the factory.
// Instead we store navigate on a module-level object and reset per test.
// ---------------------------------------------------------------------------

const _nav = { fn: vi.fn() };

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => _nav.fn,
  };
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STELLAR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockCheckGitHub(status: "found" | "not_found" | "error") {
  return vi.fn().mockResolvedValue(status);
}

function mockFetch(body: unknown, status = 201) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function renderPage(
  props: Partial<React.ComponentProps<typeof RegisterOrgPage>> = {},
  initialApiKey: string | null = "test-api-key",
) {
  if (initialApiKey) {
    localStorage.setItem("wg_admin_api_key", initialApiKey);
  } else {
    localStorage.removeItem("wg_admin_api_key");
  }
  return render(
    <MemoryRouter initialEntries={["/admin/register-org"]}>
      <Routes>
        <Route path="/admin/register-org" element={<RegisterOrgPage {...props} />} />
        <Route path="/orgs/:org_id" element={<div data-testid="org-detail">OrgDetail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

describe("RegisterOrgPage — auth guard", () => {
  beforeEach(() => {
    localStorage.clear();
    _nav.fn = vi.fn();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows access denied and API key form when no key is stored", () => {
    renderPage({}, null);
    expect(screen.getByText(/access denied/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/enter your admin api key/i)).toBeTruthy();
  });

  it("shows an error when submitting an empty API key", async () => {
    renderPage({}, null);
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/cannot be empty/i),
    );
  });

  it("stores the key and shows step 1 after entering a valid key", async () => {
    renderPage({}, null);
    const input = screen.getByPlaceholderText(/enter your admin api key/i);
    await userEvent.type(input, "my-secret-key");
    fireEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 1/i })).toBeTruthy(),
    );
    expect(localStorage.getItem("wg_admin_api_key")).toBe("my-secret-key");
  });

  it("shows step 1 immediately when API key already in localStorage", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /step 1/i })).toBeTruthy();
  });

  it("clears key and returns to access denied on 'Clear key' click", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /clear api key/i }));
    await waitFor(() => expect(screen.getByText(/access denied/i)).toBeTruthy());
    expect(localStorage.getItem("wg_admin_api_key")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Step 1 — GitHub org lookup
// ---------------------------------------------------------------------------

describe("RegisterOrgPage — Step 1: GitHub Org Lookup", () => {
  beforeEach(() => localStorage.setItem("wg_admin_api_key", "key"));
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders step 1 heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: /step 1/i })).toBeTruthy();
  });

  it("Next button is disabled before a GitHub result", () => {
    renderPage();
    const btn = screen.getByRole("button", { name: /next.*maintainers/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("shows 'Checking GitHub…' while check is in flight", async () => {
    const slowCheck = vi.fn().mockReturnValue(new Promise(() => {}));
    renderPage({ checkGitHubOrg: slowCheck });
    const input = screen.getByLabelText(/github organisation name/i);
    await userEvent.type(input, "stellar");
    await waitFor(() => expect(screen.getByText(/checking github/i)).toBeTruthy());
  });

  it("shows found status when org exists", async () => {
    renderPage({ checkGitHubOrg: mockCheckGitHub("found") });
    const input = screen.getByLabelText(/github organisation name/i);
    await userEvent.type(input, "stellar");
    await waitFor(() => expect(screen.getByText(/exists on github/i)).toBeTruthy());
  });

  it("shows not_found status and keeps Next disabled", async () => {
    renderPage({ checkGitHubOrg: mockCheckGitHub("not_found") });
    const input = screen.getByLabelText(/github organisation name/i);
    await userEvent.type(input, "does-not-exist");
    await waitFor(() => expect(screen.getByText(/no github organisation/i)).toBeTruthy());
    expect(
      screen.getByRole("button", { name: /next.*maintainers/i }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("shows error status on network failure", async () => {
    renderPage({ checkGitHubOrg: mockCheckGitHub("error") });
    const input = screen.getByLabelText(/github organisation name/i);
    await userEvent.type(input, "stellar");
    await waitFor(() => expect(screen.getByText(/could not reach github/i)).toBeTruthy());
  });

  it("enables Next when org is found", async () => {
    renderPage({ checkGitHubOrg: mockCheckGitHub("found") });
    const input = screen.getByLabelText(/github organisation name/i);
    await userEvent.type(input, "stellar");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /next.*maintainers/i }).hasAttribute("disabled"),
      ).toBe(false),
    );
  });

  it("advances to step 2 after clicking Next", async () => {
    renderPage({ checkGitHubOrg: mockCheckGitHub("found") });
    const input = screen.getByLabelText(/github organisation name/i);
    await userEvent.type(input, "stellar");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /next.*maintainers/i }).hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /next.*maintainers/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 2/i })).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Helper: advance from step 1 → step 2
// ---------------------------------------------------------------------------

async function advanceToStep2(checkGitHubOrg = mockCheckGitHub("found")) {
  renderPage({ checkGitHubOrg });
  const input = screen.getByLabelText(/github organisation name/i);
  await userEvent.type(input, "stellar");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /next.*maintainers/i }).hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: /next.*maintainers/i }));
  await waitFor(() => screen.getByRole("heading", { name: /step 2/i }));
}

// ---------------------------------------------------------------------------
// Step 2 — Maintainers
// ---------------------------------------------------------------------------

describe("RegisterOrgPage — Step 2: Maintainers", () => {
  beforeEach(() => {
    localStorage.setItem("wg_admin_api_key", "key");
    _nav.fn = vi.fn();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows step 2 heading", async () => {
    await advanceToStep2();
    expect(screen.getByRole("heading", { name: /step 2/i })).toBeTruthy();
  });

  it("Next is disabled with no maintainers", async () => {
    await advanceToStep2();
    expect(
      screen.getByRole("button", { name: /next.*cap/i }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("rejects an invalid Stellar address", async () => {
    await advanceToStep2();
    const input = screen.getByLabelText(/stellar address/i);
    await userEvent.type(input, "INVALID_ADDRESS");
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/invalid stellar address/i),
    );
  });

  it("rejects an empty address", async () => {
    await advanceToStep2();
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/cannot be empty/i),
    );
  });

  it("accepts a valid Stellar address and lists it", async () => {
    await advanceToStep2();
    const input = screen.getByLabelText(/stellar address/i);
    await userEvent.type(input, VALID_STELLAR);
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => expect(screen.getByText(VALID_STELLAR)).toBeTruthy());
  });

  it("enables Next after adding a valid address", async () => {
    await advanceToStep2();
    const input = screen.getByLabelText(/stellar address/i);
    await userEvent.type(input, VALID_STELLAR);
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /next.*cap/i }).hasAttribute("disabled"),
      ).toBe(false),
    );
  });

  it("can remove an added address", async () => {
    await advanceToStep2();
    const input = screen.getByLabelText(/stellar address/i);
    await userEvent.type(input, VALID_STELLAR);
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => screen.getByText(VALID_STELLAR));
    fireEvent.click(screen.getByRole("button", { name: /remove maintainer/i }));
    await waitFor(() => expect(screen.queryByText(VALID_STELLAR)).toBeNull());
  });

  it("rejects a duplicate address", async () => {
    await advanceToStep2();
    const input = screen.getByLabelText(/stellar address/i);
    await userEvent.type(input, VALID_STELLAR);
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() => screen.getByText(VALID_STELLAR));
    await userEvent.clear(input);
    await userEvent.type(input, VALID_STELLAR);
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/already been added/i),
    );
  });

  it("can add address via Enter key", async () => {
    await advanceToStep2();
    const input = screen.getByLabelText(/stellar address/i);
    await userEvent.type(input, VALID_STELLAR + "{Enter}");
    await waitFor(() => expect(screen.getByText(VALID_STELLAR)).toBeTruthy());
  });

  it("Back button returns to step 1", async () => {
    await advanceToStep2();
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 1/i })).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Helper: advance to step 3
// ---------------------------------------------------------------------------

async function advanceToStep3() {
  await advanceToStep2();
  const input = screen.getByLabelText(/stellar address/i);
  await userEvent.type(input, VALID_STELLAR);
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /next.*cap/i }).hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: /next.*cap/i }));
  await waitFor(() => screen.getByRole("heading", { name: /step 3/i }));
}

// ---------------------------------------------------------------------------
// Step 3 — Cap
// ---------------------------------------------------------------------------

describe("RegisterOrgPage — Step 3: Cap", () => {
  beforeEach(() => {
    localStorage.setItem("wg_admin_api_key", "key");
    _nav.fn = vi.fn();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows step 3 heading", async () => {
    await advanceToStep3();
    expect(screen.getByRole("heading", { name: /step 3/i })).toBeTruthy();
  });

  it("defaults cap to 4", async () => {
    await advanceToStep3();
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("4");
  });

  it("shows impact description for default cap (balanced)", async () => {
    await advanceToStep3();
    expect(screen.getByText(/balanced/i)).toBeTruthy();
  });

  it("shows 'very strict' description for cap = 1", async () => {
    await advanceToStep3();
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText(/very strict/i)).toBeTruthy());
  });

  it("shows error for cap = 0 (below minimum)", async () => {
    await advanceToStep3();
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "0" } });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/between 1 and 20/i),
    );
  });

  it("shows error for cap = 21 (above maximum)", async () => {
    await advanceToStep3();
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "21" } });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/between 1 and 20/i),
    );
  });

  it("Next is disabled when there is a cap error", async () => {
    await advanceToStep3();
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "0" } });
    await waitFor(() => screen.getByRole("alert"));
    expect(
      screen.getByRole("button", { name: /next.*review/i }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("Next advances to step 4 with valid cap", async () => {
    await advanceToStep3();
    fireEvent.click(screen.getByRole("button", { name: /next.*review/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 4/i })).toBeTruthy(),
    );
  });

  it("Back returns to step 2", async () => {
    await advanceToStep3();
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 2/i })).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Helper: advance to step 4
// ---------------------------------------------------------------------------

async function advanceToStep4() {
  await advanceToStep3();
  fireEvent.click(screen.getByRole("button", { name: /next.*review/i }));
  await waitFor(() => screen.getByRole("heading", { name: /step 4/i }));
}

// ---------------------------------------------------------------------------
// Step 4 — Review & Submit
// ---------------------------------------------------------------------------

describe("RegisterOrgPage — Step 4: Review & Submit", () => {
  beforeEach(() => {
    localStorage.setItem("wg_admin_api_key", "test-api-key");
    _nav.fn = vi.fn();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the org name in the summary", async () => {
    await advanceToStep4();
    expect(screen.getByText("stellar")).toBeTruthy();
  });

  it("shows the maintainer address in the summary", async () => {
    await advanceToStep4();
    expect(screen.getAllByText(VALID_STELLAR).length).toBeGreaterThan(0);
  });

  it("shows the cap value in the summary", async () => {
    await advanceToStep4();
    // Default cap is 4 — appears in the review DD
    const strong = document.querySelector(".review-list__row dd strong");
    expect(strong?.textContent).toBe("4");
  });

  it("shows a masked API key", async () => {
    await advanceToStep4();
    // "test-api-key" → masked with bullets for middle chars
    const dd = Array.from(document.querySelectorAll(".review-list__row dd code")).pop();
    expect(dd?.textContent).toMatch(/test/i);
  });

  it("submits successfully and navigates to org detail page", async () => {
    mockFetch({ org_id: "stellar", maintainers: [VALID_STELLAR], cap: 4 }, 201);
    await advanceToStep4();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register organisation/i }));
    });
    await waitFor(() => expect(_nav.fn).toHaveBeenCalledWith("/orgs/stellar"));
  });

  it("shows submit error on server error response", async () => {
    mockFetch({ error: "Org already exists" }, 409);
    await advanceToStep4();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register organisation/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/org already exists/i),
    );
  });

  it("clears key and shows access denied on 401 response", async () => {
    mockFetch({ error: "unauthorized" }, 401);
    await advanceToStep4();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register organisation/i }));
    });
    await waitFor(() => expect(screen.getByText(/access denied/i)).toBeTruthy());
    expect(localStorage.getItem("wg_admin_api_key")).toBeNull();
  });

  it("shows submit error on network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    await advanceToStep4();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register organisation/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/network error/i),
    );
  });

  it("shows Registering… while in flight", async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    await advanceToStep4();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /register organisation/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /registering/i })).toBeTruthy(),
    );
  });

  it("Back returns to step 3", async () => {
    await advanceToStep4();
    fireEvent.click(screen.getByRole("button", { name: /← back/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /step 3/i })).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

describe("RegisterOrgPage — step bar", () => {
  beforeEach(() => localStorage.setItem("wg_admin_api_key", "key"));
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("marks step 1 as active on load", () => {
    renderPage();
    const active = document.querySelector(".step-bar__item--active");
    expect(active?.textContent).toMatch(/1/);
  });

  it("marks step 1 as done and step 2 as active after advancing", async () => {
    await advanceToStep2();
    expect(document.querySelectorAll(".step-bar__item--done").length).toBe(1);
    const active = document.querySelector(".step-bar__item--active");
    expect(active?.textContent).toMatch(/2/);
  });
});
