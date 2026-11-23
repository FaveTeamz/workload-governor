# Branch: feat/issue-1307-external-secrets

This Helm chart supports both External Secrets Operator synchronization and standard Kubernetes Secrets.

## External Secrets Operator

Set `externalSecrets.enabled=true` and configure a `SecretStore` or `ClusterSecretStore`:

```bash
helm template workload-governor ./helm/vesting-backend \
  --set externalSecrets.enabled=true \
  --set externalSecrets.secretStoreRef.name=aws-secretsmanager \
  --set externalSecrets.secretStoreRef.kind=ClusterSecretStore \
  --set externalSecrets.remoteKey=workload-governor/production
```

The chart creates an `external-secrets.io/v1beta1` `ExternalSecret` and synchronizes these target keys:

| Kubernetes Secret key | Remote property |
|---|---|
| `DATABASE_URL` | `DATABASE_URL` |
| `ADMIN_SECRET_KEY` | `ADMIN_SECRET_KEY` |
| `GITHUB_WEBHOOK_SECRET` | `GITHUB_WEBHOOK_SECRET` |

For AWS Secrets Manager, store the remote values as JSON properties under the configured `remoteKey`.

For Vault, configure the store for your Vault provider and use a KV path as `remoteKey`; set the matching `property` values in `externalSecrets.secrets` when the KV secret is an object.

## Standard Kubernetes Secret fallback

With `externalSecrets.enabled=false` (the default), the chart creates a standard Kubernetes `Secret` from `values.secrets`:

```yaml
secrets:
  databasePassword: ""
  adminSecretKey: ""
  githubWebhookSecret: ""
```

Do not commit populated values. Empty values are omitted. For production, prefer supplying values from an encrypted or non-repository deployment mechanism.

The fallback secret is named `<release>-vesting-backend-secrets` and is injected into the workload with `envFrom.secretRef`.
