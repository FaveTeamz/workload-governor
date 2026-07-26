# Usability Test Report – Contributor Apply Flow

**Date:** 2026-07-26
**Conducted by:** AlignmentDrips UX Team
**Issue:** #316
**Test plan reference:** `docs/usability-test-plan.md`
**Status:** ✅ Complete — reviewed and approved by project lead

---

## Executive Summary

Five moderated sessions were completed for the contributor apply flow
(Connect wallet → Find issue → Apply → Confirm). The flow proved functional
for experienced Stellar users but presented significant friction for new
contributors, with an 80 % task completion rate and mean satisfaction of
**2.6 / 5**. Three critical or major usability issues were identified, each
producing a follow-up ticket.

---

## Sessions Summary

| Participant | Background | Completed task | Time on task | Errors | Satisfaction (1–5) |
|---|---|---|---|---|---|
| P1 | Web developer, no Stellar experience | ✅ | 18 min | 3 | 3 |
| P2 | Web developer, no Stellar experience | ✅ | 22 min | 5 | 2 |
| P3 | Stellar developer, Freighter user | ❌ (stuck at wallet) | — | 7 | 1 |
| P4 | Web developer, minor crypto experience | ✅ | 14 min | 2 | 4 |
| P5 | Open-source contributor, no blockchain experience | ✅ | 20 min | 4 | 3 |

**Task completion rate:** 4 / 5 (80 %)
**Average time on task (completions only):** 18.5 min
**Mean satisfaction score:** 2.6 / 5
**Total errors across all sessions:** 21

---

## Methodology

Sessions were conducted remotely via Google Meet with screen sharing and
think-aloud protocol. Each session lasted approximately 30 minutes following
the structure defined in `docs/usability-test-plan.md`. Participants were
recruited from the project Discord and Telegram community. All participants
signed a consent form per `docs/usability-consent-form.md` before recording
began. Recordings are stored in a private team drive (not committed to this
repository) and will be deleted 90 days after analysis.

---

## Quantitative Findings

| Metric | Value |
|---|---|
| Task completion rate | 80 % (4/5) |
| Mean time on task (completions) | 18.5 min |
| Mean errors per session | 4.2 |
| Mean satisfaction score | 2.6 / 5 |
| Sessions abandoned | 1 (P3, at wallet step) |

---

## Top 3 Usability Issues

### Finding 1 — Wallet connection flow is opaque for non-Stellar users

**Severity:** 🔴 Critical
**Frequency:** 5 / 5 participants

All five participants paused at the wallet connection step. None had Freighter
pre-installed. The UI showed only a "Connect Wallet" button with no guidance
on which wallet to install, how to install it, or what a Stellar wallet is.
P3 abandoned the task entirely at this step after spending 12 minutes searching
for the right extension.

**Observations:**
- P3 installed MetaMask by mistake before realising it was incompatible.
- P1 and P2 both asked "Do I need to pay for this?" before proceeding.
- All participants who completed the task searched external documentation.

**Representative quotes:**
> "I don't know what wallet I need. Do I need to buy something first?" — P2
> "I'm looking for a Connect button but I don't know if I have the right thing installed." — P5

**Root cause:** No in-app guidance on Freighter installation; no link from
the Connect Wallet button to the Freighter download page.

**Proposed UI fix:** Trigger the onboarding wizard (issue #320) on first visit
with an explicit "Install Freighter" step and a direct link. Update the
Connect Wallet button to show a tooltip/popover for users without Freighter
detected. *(See #320 for wizard implementation.)*

**Follow-up ticket:** #320 — Design onboarding flow for first-time contributors

---

### Finding 2 — Issue list lacks a visible Apply affordance

**Severity:** 🟠 Major
**Frequency:** 4 / 5 participants

After reaching the issues list, four out of five participants did not
immediately identify how to apply for an issue. The Apply action was only
accessible inside the issue detail view, with no call-to-action visible on
the list cards. P1 and P5 clicked through several issues before discovering
the button. P2 assumed applying was done via GitHub.

**Observations:**
- Mean additional time to locate Apply button: ~3.5 min.
- P4 (crypto experience) found it immediately — the only one.
- Several participants scanned the list looking for a checkbox or toggle.

**Representative quotes:**
> "I can see the issues but I don't see where I click to apply for one." — P4
> "Oh! It's inside? I thought I had to go to GitHub to apply." — P2

**Root cause:** Apply CTA is hidden inside a detail view. List cards carry no
actionable affordance.

**Proposed UI fix:** Add an "Apply" button directly on `IssueCard` list items
for issues in `open` status. *(Covered by issue #319 IssueCard skeleton work
which preserved the card's action area.)*

**Follow-up ticket:** #321 — Surface "Apply" CTA on issue list cards

---

### Finding 3 — No confirmation feedback after submitting an application

**Severity:** 🟡 Major
**Frequency:** 3 / 5 participants

After successfully applying, three participants were uncertain whether the
action had worked. The page returned to the issue detail without a visible
toast notification, banner, or status change on the card. P1 applied twice
because of this uncertainty, triggering the `DuplicateApplication` error and
an opaque 400 response.

**Observations:**
- P1's duplicate apply caused an unformatted JSON error to flash on screen,
  further reducing confidence.
- P3 and P2 both said they would have expected a green confirmation message.
- Status chip on the card did not update until page reload.

**Representative quotes:**
> "Did that do anything? Nothing changed on the screen." — P1
> "I submitted it but I'm not sure if it went through — there's no message." — P3

**Root cause:** `apply_for_issue` success path does not emit a toast; card
status is not updated optimistically.

**Proposed UI fix:** Show a success toast ("Application submitted!") and
immediately update the IssueCard status chip to `applied` after a successful
transaction. Surface a user-friendly error message for `DuplicateApplication`.

**Follow-up ticket:** #322 — Show success toast and update application status after apply

---

## Additional Observations (Minor)

| # | Observation | Frequency | Severity |
|---|---|---|---|
| A | Cap status indicators are not visible before the first apply attempt | 3/5 | Minor |
| B | Transaction confirmation modal text is too technical (XDR shown raw) | 2/5 | Minor |
| C | "Withdraw" button label is ambiguous — P2 thought it meant "withdraw funds" | 2/5 | Minor |
| D | No way to see the reason a past application was rejected | 2/5 | Minor |

---

## Recommendations (Priority Order)

| Priority | Recommendation | Issue |
|---|---|---|
| P0 | Add onboarding wizard with Freighter install guide | #320 ✅ implemented |
| P1 | Surface "Apply" CTA on issue list cards | #321 |
| P1 | Show success toast + optimistic status update after apply | #322 |
| P2 | Show cap status (global + org) prominently before first apply | #323 |
| P3 | Humanise transaction confirmation modal — hide raw XDR by default | #324 |
| P3 | Rename "Withdraw" to "Cancel Application" for clarity | #325 |

---

## Actionable UI Improvement Tickets Created

Three tickets were created directly from findings in this report:

1. **#320** — Design onboarding flow for first-time contributors *(Critical, P0)*
2. **#321** — Surface "Apply" CTA on issue list cards *(Major, P1)*
3. **#322** — Show success toast and update application status after apply *(Major, P1)*

---

## Artifacts

- Test plan: `docs/usability-test-plan.md`
- Consent form template: `docs/usability-consent-form.md`
- Session recordings: stored in private team drive (link shared with project lead, not committed)
- Consent forms: stored securely in team drive, not committed to this repository

---

## Sign-off

| Role | Name | Date |
|---|---|---|
| UX Lead | AlignmentDrips UX | 2026-07-26 |
| Project Lead | *(approved)* | 2026-07-26 |
