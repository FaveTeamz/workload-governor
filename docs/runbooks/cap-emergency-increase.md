Cap emergency increase runbook

Purpose

When a wave experiences an unexpectedly high surge of contributors joining simultaneously, the global pending-application cap may block legitimate contributors from participating. This runbook documents when and how to use an emergency cap increase, the approval process, rollback steps, and monitoring/alerts.

When to use

- Use only when monitoring or operator reports show a sudden, sustained supply-side blockage (many contributors unable to apply) that impacts wave throughput.
- Do NOT use for routine tuning or to workaround bugs in contributor clients.
- Confirm incident characteristics: a) spike in failed application attempts; b) application backlog increasing; c) normal operator interventions (e.g., TTL) don't resolve quickly.

Approval process

- Owner: protocol operators / on-call.
- Emergency cap changes require one admin to approve and execute the emergency_set_global_cap(admin, new_cap) contract call.
- When possible, notify the broader ops on-call and an engineering lead before change; if not possible due to urgency, execute and document immediately afterwards.

How to execute

1. Choose a conservative temporary cap increase (e.g. from 15 to 30) — prefer the smallest change that restores flow.
2. Call the on-chain function emergency_set_global_cap(admin, new_cap) from the admin address.
   - This function requires admin auth and immediately changes the cap.
   - It emits an EmergencyCapUpdated event for monitoring.
3. Record rationale, chosen cap, expected duration, and who approved in the incident log.

Rollback procedure

- Monitor the system for the desired throughput improvement.
- When the surge subsides, rollback to the previous cap using set_global_cap(admin, previous_value) (normal operator path) or emergency_set_global_cap if immediate rollback is required.
- Document the rollback time, actor, and reason.

Monitoring and alerts

- Emergency cap updates emit an `EmergencyCapUpdated` event. Monitor the event stream for unexpected cap usage.
- Add an alert: trigger if the global cap has been changed more than twice in a 24-hour window. Criteria:
  - Count both normal (`GlobalCapUpdated`) and emergency (`EmergencyCapUpdated`) updates.
  - If > 2 changes in 24h, page on-call and create an incident ticket to investigate root cause (frequent manual changes indicate oscillation or underlying issue).

Post-incident actions

- After rollback, run a short post-mortem: why did the surge occur, was the cap change effective, any client or infra fixes required?
- If the incident required more than two emergency adjustments in 24 hours, escalate to platform engineering for a permanent fix.

Notes

- The on-chain cap is range-limited to 0..=100 to prevent misconfiguration.
- Emergency changes take effect immediately and are designed to unblock contributors during active waves; prefer narrowly-scoped, short-duration changes.
