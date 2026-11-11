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
cp .env.example .env   # set TF_DIR, CLUSTER_NAME, DISCOVER_HOST, GRAFANA_HOST
# Cluster already exists? SKIP_TF=1 in .env or on the command line.
make cluster SKIP_TF=1

# Build/push Connect, generator, Discover, Grafana images (linux/amd64)
make images

# Operators → platform → apps
make up

make status
make url
```

`.env` is gitignored; keep live hostnames and paths only there (or pass `DISCOVER_HOST` / `GRAFANA_HOST` on the command line). Do not put them in committed files — this repo is public.

Sign-in passwords (never committed; read from Secret Manager):

```bash
gcloud secrets versions access latest --secret=logdemo-discover-admin-password
gcloud secrets versions access latest --secret=logdemo-grafana-admin-password
```

### Run the demo

Presenter steps (sign-in, dashboards, inject `payment-outage`, Discover search/trace): [`docs/demo-script.md`](docs/demo-script.md).

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

- [`docs/demo-script.md`](docs/demo-script.md) — live presenter walkthrough
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — end-state plan for harnesses
- [`docs/search-cookbook.md`](docs/search-cookbook.md) — Discover / Search queries
- [`docs/grafana-query-sketches.md`](docs/grafana-query-sketches.md) — working Explore SQL++ sketches
