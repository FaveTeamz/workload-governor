# External Secrets Operator (ESO) Integration Guide

This guide documents how to integrate the WorkloadGovernor Helm chart with HashiCorp Vault or AWS Secrets Manager using the **External Secrets Operator (ESO)**.

## Overview

The WorkloadGovernor Helm chart supports automatic secret synchronization via Kubernetes `ExternalSecret` custom resources (`external-secrets.io/v1beta1`), eliminating the need to manually create secrets in cluster namespaces.

## Prerequisites

1. Install External Secrets Operator in your Kubernetes cluster:
   ```bash
   helm repo add external-secrets https://charts.external-secrets.io
   helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
   ```

2. Configure a `ClusterSecretStore` or `SecretStore` pointing to your secret backend.

## Configuration Options

In your `values.yaml` (or Helm release values):

```yaml
externalSecrets:
  enabled: true
  refreshInterval: "1h"
  secretStoreName: "vault-backend" # or "aws-secretsmanager"
  secretStoreKind: "ClusterSecretStore" # or "SecretStore"
  secrets:
    - secretKey: DATABASE_URL
      remoteRef:
        key: "secret/data/workload-governor/database"
        property: "url"
    - secretKey: STELLAR_RPC_URL
      remoteRef:
        key: "secret/data/workload-governor/stellar"
        property: "rpc_url"
```

## Backend Integrations

### 1. HashiCorp Vault
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
spec:
  provider:
    vault:
      server: "https://vault.example.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "workload-governor"
```

### 2. AWS Secrets Manager
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: aws-secretsmanager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: workload-governor-irsa
```

## Secret Sync Lifecycle
Once deployed, the External Secrets Operator continuously syncs remote keys into Kubernetes `Secret` resources owned by the release, updating pods on secret rotation according to `refreshInterval`.
