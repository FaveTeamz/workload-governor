# Operational Runbooks

This directory contains production operations runbooks for the WorkloadGovernor infrastructure, smart contracts, and backend services.

## Runbook Index

| Runbook | Category | Description |
|---|---|---|
| [Admin Key Rotation](admin-key-rotation.md) | Security | Procedure for rotating contract admin keys and updating multisig signers. |
| [Cap Emergency Increase](cap-emergency-increase.md) | Operations | Emergency procedures for raising global application and contributor caps. |
| [Contract Upgrade](contract-upgrade.md) | Smart Contract | Step-by-step WASM hash calculation, upgrade deployment, and storage migration. |
| [Database Migration](database-migration.md) | Database | Running zero-downtime PostgreSQL schema migrations with flyway/knex. |
| [Database Rollback](db-rollback.md) | Database | Disaster recovery and rollback steps for failed database migrations. |
| [Environment Promotion](environment-promotion.md) | Infrastructure | Promoting Terraform infrastructure changes from staging to production. |
| [Horizon & RPC Node Migration](horizon-migration.md) | Infrastructure | Zero-downtime migration of Stellar Horizon and Soroban RPC endpoints. |
| [Incident Response](incident-response.md) | SRE | On-call triage, severity classification, and escalation playbooks. |
| [Mainnet Deployment Checklist](mainnet-deployment-checklist.md) | Release | Pre-flight verification checklist for mainnet contract deployment. |
