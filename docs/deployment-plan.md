# WorkloadGovernor Deployment Plan

## Overview
This document outlines the deployment process for the WorkloadGovernor contract to Stellar testnet.

## Prerequisites

### 1. Install Stellar CLI
```bash
cargo install stellar-cli --features opt
stellar keys generate --network testnet deployer
# Get the address
stellar keys address deployer

# Fund it using friendbot
curl "https://friendbot.stellar.org/?addr=G..."
cd contracts/workload_governor
stellar contract build --optimize
stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm target/wasm32-unknown-unknown/release/workload_governor.wasm
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id CONTRACT_ID \
  -- \
  initialize \
  --admin G...
