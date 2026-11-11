# Couchbase log analytics demo

GKE demo that generates scenario-driven structured logs, stores them in Couchbase, and replaces Kibana with **Grafana** dashboards plus a Next.js **Discover** page on Couchbase Search.

Pipeline: Java generator → Logstash (TCP) → Kafka → Couchbase sink → Search (`events_fts`) and Query/Analytics. Discover serves ad hoc search; Grafana serves Explore/dashboards over SQL++ via the Couchbase data source plugin.

Full design: [`docs/implementation-plan.md`](docs/implementation-plan.md).

## Status

Running on GKE (`usc1-demo-gke`, namespace `logdemo`).

| Phase | Status |
| --- | --- |
| 1–12 Skeleton → Grafana Explore + public Ingress | done |
| 13 Dashboards (three Grafana dashboards as code) | done |
| 14 Demo script | next |

| Surface | URL |
| --- | --- |
| Discover | https://discover.usc1-demo.gcp.unix.us.com/login |
| Grafana | https://logdemo-grafana.usc1-demo.gcp.unix.us.com |

TLS is **cert-manager self-signed** on the cluster **HAProxy** Ingress (`ingressClassName: haproxy`). Browsers will warn on the certificate. Point both DNS A records at the HAProxy LoadBalancer IP (`make url`).

## Quick start

Prerequisites: `gcloud`, `kubectl`, `helm`, Docker buildx, Maven (Java 21), Node.js for Discover builds, access to the existing Terraform config, and the cluster’s cert-manager + HAProxy Ingress (already installed by that Terraform).

```bash
# Path to the shared GKE Terraform root (do not fork into this repo)
export TF_DIR=/Users/michael/IdeaProjects/couchbase-terraform/gcp/us-central1/demo

# Cluster already exists? Skip terraform apply.
make cluster SKIP_TF=1

# Build/push Connect, generator, Discover, Grafana images (linux/amd64)
make images

# Operators → platform → apps
make up

make status
make url
```

Sign-in:

```bash
# Discover admin
gcloud secrets versions access latest --secret=logdemo-discover-admin-password

# Grafana admin
gcloud secrets versions access latest --secret=logdemo-grafana-admin-password
```

Trigger an incident scenario (from inside the cluster):

```bash
make scenario name=payment-outage
```

Port-forward Couchbase UI and generator only (`make ui`). Discover and Grafana are public — use `make url`.

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
| `dashboards/` | Grafana dashboard JSON (phase 13) |
| `docs/` | Implementation plan, search cookbook, Grafana sketches |

## Secrets

Seven Google Secret Manager names (values never in the repo). Created by `infra/gke/create-secrets.sh`. Synced by External Secrets via ClusterSecretStore `gcsm-store`.

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
