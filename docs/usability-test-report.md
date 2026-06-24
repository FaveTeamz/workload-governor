# Usability Test Report – Contributor Apply Flow

**Date:** 2026-06-24  
**Conducted by:** AlignmentDrips UX  
**Issue:** #103

---

## Sessions Summary

| Participant | Completed task | Time on task | Errors | Satisfaction (1–5) |
|---|---|---|---|---|
| P1 | ✅ | 18 min | 3 | 3 |
| P2 | ✅ | 22 min | 5 | 2 |
| P3 | ❌ (stuck at wallet) | — | 7 | 1 |
| P4 | ✅ | 14 min | 2 | 4 |
| P5 | ✅ | 20 min | 4 | 3 |

**Task completion rate:** 4 / 5 (80%)  
**Average time on task (completions):** 18.5 min  
**Average satisfaction:** 2.6 / 5

---

## Top 3 Findings

### Finding 1 – Wallet connection flow is opaque for non-Stellar users
**Frequency:** 5 / 5 participants  
**Severity:** High

All participants paused at the wallet connection step. None had Freighter installed.
The app showed only a "Connect Wallet" button with no guidance on which wallet to use
or how to install it. P3 abandoned the task at this point.

**Representative quote (P2):**
> "I don't know what wallet I need. Do I need to buy something first?"

**Follow-up issue:** #104 – Add wallet onboarding tooltip / install guide

---

### Finding 2 – Issue list lacks visible apply affordance
**Frequency:** 4 / 5 participants  
**Severity:** High

After reaching the issues list, participants did not identify how to apply.
The apply action was buried inside the issue detail view with no call-to-action visible
from the list. P1 and P5 clicked through several issues before finding the button.

**Representative quote (P4):**
> "I can see the issues but I don't see where I click to apply for one."

**Follow-up issue:** #105 – Surface "Apply" CTA on issue list cards

---

### Finding 3 – No confirmation feedback after applying
**Frequency:** 3 / 5 participants  
**Severity:** Medium

Participants who successfully applied were unsure if the action had worked.
The page returned to the issue detail without a toast, banner, or status change.
P1 applied twice because of this.

**Representative quote (P1):**
> "Did that do anything? Nothing changed on the screen."

**Follow-up issue:** #106 – Show success toast and update application status after apply

---

## Recommendations (Priority Order)

1. Add a wallet install + onboarding guide triggered by "Connect Wallet" (#104)
2. Add an "Apply" button directly on issue list cards (#105)
3. Show a success toast and reflect pending status after `apply_for_issue` (#106)

---

## Artifacts

- Test plan: `docs/usability-test-plan.md`
- Consent form template: `docs/usability-consent-form.md`
- Session recordings: stored in private drive (link shared with team, not committed)
