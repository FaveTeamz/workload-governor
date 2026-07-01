# vesting-backend Helm Chart

Deploys the **WorkloadGovernor vesting-backend** service on any Kubernetes cluster.
The chart includes a `Deployment`, `Service`, `Ingress`, `HPA`, `ConfigMap`, and
an `ExternalSecret` (via the [External Secrets Operator](https://external-secrets.io/)).

## Prerequisites

| Requirement | Version |
|---|---|
| Kubernetes | ≥ 1.25 |
| Helm | ≥ 3.10 |
| [External Secrets Operator](https://external-secrets.io/) | ≥ 0.9 (optional, disable with `externalSecrets.enabled=false`) |
| metrics-server | ≥ 0.6 (required for memory-based HPA) |

---

## Install

```bash
# Add the Helm repo (GitHub Pages)
helm repo add workload-governor https://faveteamz.github.io/workload-governor
helm repo update

# Dry-run first
helm install vesting-backend workload-governor/vesting-backend \
  --dry-run --debug \
  --set config.CONTRACT_ID=<YOUR_CONTRACT_ID>

# Install
helm install vesting-backend workload-governor/vesting-backend \
  --namespace vesting \
  --create-namespace \
  --set config.CONTRACT_ID=<YOUR_CONTRACT_ID>
```

### Local (kind) install

```bash
# Create a local cluster
kind create cluster --name wg-dev

# Install from local chart directory
helm install vesting-backend ./helm/vesting-backend \
  --namespace vesting \
  --create-namespace \
  --set externalSecrets.enabled=false \
  --set config.CONTRACT_ID=<CONTRACT_ID> \
  --set ingress.enabled=false

# Verify
kubectl get all -n vesting
helm test vesting-backend -n vesting
```

---

## Upgrade

```bash
helm upgrade vesting-backend workload-governor/vesting-backend \
  --namespace vesting \
  --reuse-values \
  --set image.tag=<NEW_TAG>
```

---

## Uninstall

```bash
helm uninstall vesting-backend --namespace vesting
```

---

## Configuration

All values can be overridden with `--set key=value` or a custom `-f values.yaml` file.

### Core

| Key | Default | Description |
|---|---|---|
| `replicaCount` | `2` | Number of pod replicas (ignored when HPA enabled) |
| `image.repository` | `ghcr.io/faveteamz/workload-governor` | Container image |
| `image.tag` | `""` (uses `appVersion`) | Image tag |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `nameOverride` | `""` | Partial chart name override |
| `fullnameOverride` | `""` | Full release name override |

### Service

| Key | Default | Description |
|---|---|---|
| `service.type` | `ClusterIP` | Service type |
| `service.port` | `3000` | Service port |
| `service.targetPort` | `3000` | Container port |

### Ingress

| Key | Default | Description |
|---|---|---|
| `ingress.enabled` | `true` | Create Ingress resource |
| `ingress.className` | `nginx` | Ingress class |
| `ingress.annotations` | See values.yaml | Custom annotations |
| `ingress.hosts` | `vesting-backend.example.com` | Hostname rules |
| `ingress.tls` | See values.yaml | TLS secret mappings |

### HPA

| Key | Default | Description |
|---|---|---|
| `autoscaling.enabled` | `true` | Enable HPA |
| `autoscaling.minReplicas` | `2` | Minimum replicas |
| `autoscaling.maxReplicas` | `10` | Maximum replicas |
| `autoscaling.targetCPUUtilizationPercentage` | `70` | Target CPU % |
| `autoscaling.targetMemoryUtilizationPercentage` | `80` | Target memory % |

### Application Config (ConfigMap)

| Key | Default | Description |
|---|---|---|
| `config.STELLAR_NETWORK` | `testnet` | Stellar network |
| `config.SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` | RPC endpoint |
| `config.HORIZON_URL` | `https://horizon-testnet.stellar.org` | Horizon endpoint |
| `config.CONTRACT_ID` | `""` | Deployed contract ID — **must be set** |
| `config.NODE_ENV` | `production` | Node environment |
| `config.PORT` | `3000` | Listening port |
| `config.LOG_LEVEL` | `info` | Log verbosity |

### External Secrets

| Key | Default | Description |
|---|---|---|
| `externalSecrets.enabled` | `true` | Enable ExternalSecret resource |
| `externalSecrets.secretStoreName` | `aws-secrets-manager` | SecretStore name |
| `externalSecrets.secretStoreKind` | `ClusterSecretStore` | Store kind |
| `externalSecrets.refreshInterval` | `1h` | Refresh interval |
| `externalSecrets.secrets` | See values.yaml | Secret key mappings |

Secrets synced by default:

| Env Var | AWS Secrets Manager Path |
|---|---|
| `ADMIN_TOKEN` | `workload-governor/admin-token` |
| `STELLAR_SECRET_KEY` | `workload-governor/stellar-secret-key` |
| `DATABASE_URL` | `workload-governor/database-url` |
| `REDIS_URL` | `workload-governor/redis-url` |

To disable and use a plain Kubernetes Secret instead:

```bash
helm install vesting-backend ./helm/vesting-backend \
  --set externalSecrets.enabled=false
```

Then create the secret manually:

```bash
kubectl create secret generic vesting-backend-secrets \
  --from-literal=ADMIN_TOKEN=<token> \
  --from-literal=STELLAR_SECRET_KEY=<key> \
  --from-literal=DATABASE_URL=<url> \
  --from-literal=REDIS_URL=<url> \
  --namespace vesting
```

### Resources

| Key | Default |
|---|---|
| `resources.requests.cpu` | `100m` |
| `resources.requests.memory` | `128Mi` |
| `resources.limits.cpu` | `500m` |
| `resources.limits.memory` | `512Mi` |

---

## Publishing to GitHub Pages

The chart is published as a Helm repository on GitHub Pages.

```bash
# From repo root — package and index
helm package helm/vesting-backend --destination docs/helm-charts/
helm repo index docs/helm-charts/ --url https://faveteamz.github.io/workload-governor/helm-charts

# Push and the gh-pages workflow will deploy automatically
git add docs/helm-charts/
git commit -m "chore: publish vesting-backend chart"
git push
```

The GitHub Actions workflow at `.github/workflows/helm-release.yml` automates this on every tag push matching `helm-v*`.

---

## Runbooks

- [Contract upgrade](../../docs/runbooks/contract-upgrade.md)
- [Admin key rotation](../../docs/runbooks/admin-key-rotation.md)
- [Cap emergency increase](../../docs/runbooks/cap-emergency-increase.md)
- [Incident response](../../docs/runbooks/incident-response.md)
