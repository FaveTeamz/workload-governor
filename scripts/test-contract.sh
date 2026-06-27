#!/bin/bash
# WorkloadGovernor Contract Test Script

CONTRACT_ID="CA..."  # Replace with actual contract ID
ADMIN="G..."         # Replace with admin address

echo "Testing WorkloadGovernor functions..."

# Test 1: Get admin
echo "1. Testing get_admin..."
stellar contract invoke \
  --network testnet \
  --id $CONTRACT_ID \
  -- \
  get_admin

# Test 2: Submit workload
echo "2. Testing submit_workload..."
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $CONTRACT_ID \
  -- \
  submit_workload \
  --workload_id "test-001" \
  --description "Test workload"

# Test 3: Get workload
echo "3. Testing get_workload..."
stellar contract invoke \
  --network testnet \
  --id $CONTRACT_ID \
  -- \
  get_workload \
  --workload_id "test-001"

# Test 4: Complete workload
echo "4. Testing complete_workload..."
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $CONTRACT_ID \
  -- \
  complete_workload \
  --workload_id "test-001"

# Test 5: Verify workload
echo "5. Testing verify_workload..."
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $CONTRACT_ID \
  -- \
  verify_workload \
  --workload_id "test-001"

echo "All tests completed!"
