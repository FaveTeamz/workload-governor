# ADR-008: Multi-signature Threshold Governance for Emergency Cap Modifications

## Status
Accepted

## Date
2026-09-28

## Context
Sensitive administrative operations on the WorkloadGovernor smart contract—specifically contract upgrades and emergency cap modifications—were previously controlled by a single admin account key. A single compromised or unavailable admin key poses significant operational risk (single point of failure or compromise). Conversely, full on-chain DAO voting introduces multi-day latency that is impractical during security incidents or rapid wave reconfigurations.

## Decision
We adopt a multi-signature $k$-of-$n$ threshold governance model for administrative actions on the Soroban smart contract.
- Authorized administrative signers are registered on-chain with assigned voting weights.
- Critical operations (`set_admin_threshold`, `set_org_cap`, and contract bytecode upgrades) require signatures exceeding the configured threshold weight $k$.
- Key rotation and signer addition/removal must itself pass threshold verification.

## Reasons
1. **Mitigates Single Point of Failure**: Loss of a single private key does not lock out administrative controls.
2. **Reduces Insider Threat & Key Compromise Risk**: An attacker gaining access to one key cannot unilaterally alter organization caps or upgrade contract logic.
3. **Emergency Responsiveness**: Unlike multi-day token voting delays, a $k$-of-$n$ threshold can be achieved within minutes when signers coordinate during emergencies.

## Consequences
- **Positive**: Enhanced security posture aligned with institutional governance best practices.
- **Negative**: Administrative invocations require collecting multiple authorization signatures, slightly increasing transaction construction complexity.

## Alternatives Considered
1. **Single-Key Admin**: Rejected due to high risk of key loss or single-point compromise.
2. **Full Token-Weighted DAO Governance**: Rejected due to latency constraints during emergency response.
