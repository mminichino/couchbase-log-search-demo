# Couchbase log analytics demo

GKE demo that generates scenario-driven structured logs, stores them in Couchbase, and replaces Kibana with **Grafana** dashboards plus a Next.js **Discover** page on Couchbase Search.

Pipeline: Java generator → Logstash (TCP) → Kafka → Couchbase sink → Search (`events_fts`) and Query/Analytics. Discover serves ad hoc search; Grafana serves Explore/dashboards over SQL++ via the Couchbase data source plugin.

Full design: [`docs/implementation-plan.md`](docs/implementation-plan.md).

## What you get

| Surface | Role |
| --- | --- |
| Discover | Kibana-like search UI over Couchbase Search (HTTPS Ingress) |
| Grafana | Explore + provisioned Logdemo dashboards over SQL++ |
| Generator | Scenario-driven synthetic traffic (`make scenario name=…`) |

TLS uses **cert-manager self-signed** certificates on the cluster **HAProxy** Ingress (`ingressClassName: haproxy`). Browsers will warn on the certificate. Point Discover and Grafana DNS A records at the HAProxy LoadBalancer IP (`make url` prints the live values for your cluster).

Default Kubernetes namespace: `logdemo` (overridable via `NAMESPACE`).

## Quick start

Prerequisites: `gcloud`, `kubectl`, `helm`, Docker buildx, Maven (Java 21), Node.js for Discover builds, a GKE cluster from your Terraform config (with cert-manager and HAProxy Ingress available), and Artifact Registry / Secret Manager access.

```bash
# Path to your GKE Terraform root (not part of this repo)
export TF_DIR=/path/to/couchbase-terraform/gcp/.../demo

# Cluster already exists? Skip terraform apply.
make cluster SKIP_TF=1

# Build/push Connect, generator, Discover, Grafana images (linux/amd64)
make images

# Operators → platform → apps
make up

make status
make url
```

Set `discover.host` and `grafana.host` in `charts/20-apps/values.yaml` (or Helm `--set`) to hostnames you control before relying on public Ingress.

Sign-in passwords (never committed; read from Secret Manager):

```bash
gcloud secrets versions access latest --secret=logdemo-discover-admin-password
gcloud secrets versions access latest --secret=logdemo-grafana-admin-password
```

Trigger an incident scenario:

```bash
make scenario name=payment-outage
```

Port-forward Couchbase UI and generator with `make ui`. Discover and Grafana are intended to be public — use `make url` for the addresses on your cluster.

Teardown releases: `make down`. Full destroy (releases, Ingress, IP release, terraform destroy): `make destroy`.

## Layout

| Path | Role |
| --- | --- |
| `charts/00-operators` | Strimzi, Couchbase Autonomous Operator, External Secrets |
| `charts/10-platform` | Kafka, Connect, Couchbase cluster/users/init, ExternalSecrets |
| `charts/20-apps` | Logstash, generator, sink connector, Grafana, Discover, cert-manager Certificates, HAProxy Ingresses |
| `infra/gke/` | Registry, optional reserved IPs, GSM secrets, IAM |
| `generator/` | Java 21 Spring Boot simulator (Jib) |
| `discover/` | Next.js Discover UI |
| `images/` | `kafka-connect-couchbase`, `grafana-couchbase` |
| `dashboards/` | Grafana dashboard JSON |
| `docs/` | Implementation plan, search cookbook, Grafana sketches |

## Secrets

Seven Google Secret Manager names (values never in the repo). Created by `infra/gke/create-secrets.sh`. Synced by External Secrets via ClusterSecretStore `gcsm-store` (or your chart-configured store).

| Secret Manager | Kubernetes Secret |
| --- | --- |
| `logdemo-cb-admin-password` | `cb-logdemo-auth` |
| `logdemo-cb-sink-password` | `cb-user-kafka-sink` |
| `logdemo-cb-grafana-password` | `cb-user-grafana-ro` |
| `logdemo-cb-analyst-password` | `cb-user-demo-analyst` |
| `logdemo-cb-discover-password` | `cb-user-discover-app` |
| `logdemo-discover-admin-password` | `discover-admin` |
| `logdemo-grafana-admin-password` | `grafana-admin` |

## Useful docs

- [`docs/implementation-plan.md`](docs/implementation-plan.md) — end-state plan for harnesses
- [`docs/search-cookbook.md`](docs/search-cookbook.md) — Discover / Search queries
- [`docs/grafana-query-sketches.md`](docs/grafana-query-sketches.md) — working Explore SQL++ sketches
