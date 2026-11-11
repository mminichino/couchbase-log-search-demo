# Couchbase log analytics demo: implementation plan

This document is the end-state specification for the demo. Feed it to a coding harness one phase at a time; advance only when that phase’s acceptance check passes. Keep this file, `README.md`, and `.cursor/rules/couchbase-log-search-demo.mdc` aligned whenever the design changes.

## Decisions

The demo runs on GKE, generates logs with a scenario-driven Java simulator, and replaces Kibana with two things: Grafana for dashboards and Explore, and a Next.js Discover page on Couchbase Search for ad hoc log search.

- **Kubernetes: yes, on GKE Standard.** The cluster comes from the existing Terraform config at `couchbase-terraform/gcp/us-central1/demo`. The Couchbase Autonomous Operator deploys and manages the cluster, bucket and users. Strimzi runs Kafka. One `make up` reproduces the stack from a single GitHub repo.
- **Synthetic logs: simulate a system, not random lines.** A seeded simulator models five services handling user requests. Each request emits a correlated chain of structured JSON events through a real logging stack (SLF4J, Logback, logstash-logback-encoder). Injectable incident scenarios give the dashboards a story, and a backfill mode writes 48 hours of history so charts are full when the demo starts.
- **Dashboards: Grafana OSS with the Couchbase data source plugin.** Grafana fits live operational views and Explore-style SQL++. The official plugin is community-supported and unsigned, so the image must allow that plugin id. Apache Superset is out of scope: do not add it, its Postgres/Redis footprint, or `couchbase-sqlalchemy` bootstrap jobs.
- **Ad hoc search: a Next.js Discover page on Couchbase Search.** The cluster runs the Search service with an index on the log message and key fields. A small Next.js app gives the Kibana Discover layout: query bar, time picker, hit histogram, field sidebar and an expandable document table. The Couchbase Web Console and SQL++ `SEARCH()` remain for power users.
- **Access: Discover, Grafana, and the Couchbase Web Console are public over HTTPS.** Each has an Ingress on the cluster’s **HAProxy** IngressClass, a cert-manager **self-signed** Certificate, and its own hostname. Self-signed is acceptable for this demo (browsers warn). The Discover app keeps its own users (`admin` / `viewer`) in Couchbase. Grafana uses its admin secret from Secret Manager. The console Ingress targets CAO Service `cb-logdemo-ui` with HAProxy cookie persistence on that Service; presenters sign in as **`demo-analyst`**, never Administrator. The generator API stays behind `kubectl port-forward` (`make ui`). Do not enable CAO `exposedFeatures` / LoadBalancer public networking for SDK clients unless explicitly requested. Do not use GCE `ManagedCertificate` for these apps.
- **Secrets: Google Secret Manager.** External Secrets Operator syncs them into the cluster through Workload Identity. No secret value is stored in the repo.

One cost to state up front: the Discover page is custom code this repo owns. It covers the Discover features listed in its spec below, plus login and basic user management, and nothing else.

| Layer | Choice | Version to pin | Deployed by |
| --- | --- | --- | --- |
| Platform | GKE Standard in `us-central1`, Workload Identity on | regular release channel | existing Terraform config, applied by `make cluster` |
| Secrets | Google Secret Manager with [External Secrets Operator](https://external-secrets.io/latest/provider/google-secrets-manager) | current chart; prefer existing `ClusterSecretStore` `gcsm-store` when the Terraform stack already provides it | Helm, in the operators / platform releases |
| Log source | Java 21 Spring Boot generator | own image in Artifact Registry | local chart |
| Shipper | Logstash, TCP in, Kafka out | 8.15.x | Deployment in local chart |
| Stream | Apache Kafka, KRaft, single node | Strimzi default aligned with Kafka 4.3.x | Strimzi operator |
| Sink | Kafka Connect with the [Couchbase sink connector](https://docs.couchbase.com/kafka-connector/current/release-notes.html) | 4.3.7 | Strimzi `KafkaConnect`, custom image |
| Store and search | Couchbase Server Enterprise: data, index, query, search, analytics | 8.0.x | Couchbase Autonomous Operator 2.9.x |
| Dashboards | Grafana OSS with [couchbase-datasource](https://www.couchbase.com/blog/grafana-couchbase-plugin-beta-released/) | Grafana 12.4.x, plugin 1.2.x | custom image in Artifact Registry, local chart |
| External access | HAProxy IngressClass + cert-manager self-signed Certificates; HTTP redirected to HTTPS | cert-manager and HAProxy already on the cluster (Terraform) | local chart (`Issuer`, `Certificate`, Ingress) |
| Log search UI | Next.js Discover page using the [Couchbase Node.js SDK](https://docs.couchbase.com/nodejs-sdk/current/howtos/full-text-searching-with-sdk.html) | Next.js 15.x, SDK 4.x, a Node.js LTS the SDK supports | own image in Artifact Registry, local chart |

## Architecture

```text
generator (structured JSON over TCP)
    → Logstash :5000
    → Kafka topic logs.app.v1
    → Kafka Connect couchbase-sink
    → Couchbase logs.app.events (TTL 1d)
         ├─ Search index events_fts     → Discover
         ├─ Query / Analytics (+ GSI)   → Grafana
         └─ logs.discover.users|sessions → Discover auth
```

The event keeps one shape end to end: the JSON the generator logs is the document Couchbase stores. Inside Couchbase, Query and Analytics feed Grafana; the Search index feeds the Discover page. All of it runs in one GKE namespace (`logdemo`), with credentials synced from Secret Manager. Discover, Grafana, and the Couchbase console are reachable from outside the cluster; the generator API stays port-forwarded.

## Synthetic log pattern

The best pattern is a stateful simulation of a small system, logged through a real logging framework, with deterministic seeds and scripted incidents. Random independent lines produce flat charts and no drill-down story.

The simulated system is a fictional shop with five services: `gateway`, `auth`, `catalog`, `orders`, `payments`. One simulated user request becomes 3 to 8 events that share a `trace_id` as the request crosses services.

Design rules for the generator:

1. **Real logging path.** Events are emitted with SLF4J and Logback using `logstash-logback-encoder`, with fields set through MDC and structured arguments. The output is what a production Java app would send to Logstash.
2. **Event time is simulated.** Every event carries its own `ts` from a simulation clock. Logstash and Couchbase never substitute ingest time, so backfill and live data look the same.
3. **Realistic distributions.** Poisson arrivals, a day and night traffic curve, log-normal latency per endpoint, and a level mix near 88% INFO, 8% WARN, 3% ERROR, 1% DEBUG in normal operation.
4. **Deterministic.** One `seed` value reproduces the same stream, so a dashboard built today shows the same shapes next week.
5. **Scripted incidents.** Named scenarios shift the distributions for a time window. The demo presenter triggers them over REST and watches the dashboards react.
6. **Two modes.** `backfill` writes 48 hours of history at an average of 5 events per second, about 864,000 documents, then switches to `live` at 20 events per second.

| Scenario | What changes | What the dashboard shows |
| --- | --- | --- |
| `payment-outage` | `payments` returns 503 for 60% of calls; `orders` logs retries and failures | Error rate spike on two services, linked by trace |
| `latency-creep` | `catalog` p95 latency triples over 10 minutes | Latency chart climbs with no error change |
| `auth-attack` | Burst of failed logins from a few IPs in one region | WARN spike, top client IP table changes |
| `bad-deploy` | New `version` value on `orders` with a NullPointerException in 15% of requests | Errors grouped by version and exception class |

Event schema, flat so it maps cleanly to SQL++ and Search. Field names avoid `@` and dots so identifiers need minimal escaping (still quote `` `level` `` in SQL++).

| Field | Type | Example |
| --- | --- | --- |
| `event_id` | string, UUID | document key in Couchbase |
| `ts` | string, ISO-8601 UTC with millis | `2026-11-10T14:03:22.418Z` |
| `ts_ms` | number, epoch millis | `1794319402418` |
| `level` | string | `ERROR` |
| `service`, `version`, `env` | string | `payments`, `2.4.1`, `demo` |
| `host`, `region` | string | `payments-7c9d-x2k`, `us-east` |
| `logger`, `thread` | string | `c.d.payments.ChargeService` |
| `message` | string | `Charge declined by upstream` |
| `trace_id`, `span_id` | string | correlates events of one request |
| `http_method`, `http_path`, `http_status` | string, string, number | `POST`, `/api/orders`, `503` |
| `duration_ms` | number | `412` |
| `user_id`, `client_ip` | string | synthetic values only |
| `exception_class`, `stack_trace` | string, present on errors | `java.net.SocketTimeoutException` |
| `scenario` | string, present during incidents | `payment-outage` |

## Couchbase design

Each log event is one JSON document in `logs.app.events`, keyed by `event_id`, expiring after 1 day. Grafana reads the collection (and optionally Analytics view `events_v`) with SQL++. Discover reads Search hits and hydrates full documents by key.

The Couchbase Autonomous Operator deploys the cluster: **three** pods (default `couchbase.servers: 3`), each running the data, index, query, search and analytics services. Bucket, scope, collection and users are declared as operator resources. GSI indexes, the Search index and Analytics objects are created by a one-shot init Job.

| Object | Definition | Why |
| --- | --- | --- |
| Bucket `logs` | Magma, 1 GB quota, 0 replicas | Magma is the 8.0 default and suits append-heavy data |
| Collection `app.events` | `maxTTL` 1 day | Retention, the equivalent of an ILM delete phase |
| Scope `discover`, collections `users`, `sessions`, `data_views`, `saved_searches` | No collection TTL. Auth session documents carry their own 12-hour expiry | Discover accounts, sign-in sessions, data views, and saved Discover sessions |
| Document key | `event_id` from the event body | Kafka redelivery becomes an idempotent upsert |
| Index `idx_events_ts_ms_num` | `(TO_NUMBER(ts_ms), level, service, region)` | Required for Grafana (`time_range` → `TO_NUMBER(ts_ms)`). On MOI, this is the only events GSI — adding `idx_events_trace` / `idx_events_time` pauses the indexer under demo volume |
| Index `idx_events_trace` / `idx_events_time` | optional | Add only after switching indexer storage to plasma or raising index RAM enough that indexes stay Ready |
| Index `idx_discover_users` | Primary index on `logs.discover.users` | Lets the user admin screen list accounts |
| Search index `events_fts` | `message` as analysed text, stored with term vectors for highlighting. `service`, `level`, `region`, `host`, `version`, `scenario`, `client_ip`, `http_path`, `trace_id`, `exception_class` as keywords with docvalues. `ts` as datetime. `http_status`, `duration_ms` as numbers. Dynamic mapping off. | Search, field counts and the histogram for the Discover page, with a bounded index size |
| Analytics collection | Shadow of `logs.app.events` | Aggregations can run on Analytics when useful |
| Analytics view `events_v` | Typed columns, `ts` as datetime | Optional typed dataset; Grafana primarily uses Query service + `time_range()` |
| User `kafka-sink` | Data writer/reader on `logs.app.events` | Used only by Kafka Connect |
| User `grafana-ro` | `query_select`, `fts_searcher`, `query_use_sequential_scans` on `logs.app`, plus cluster `analytics_reader` | Used only by Grafana. Sequential scans are required because the plugin wraps queries with `ORDER BY` on the time field |
| User `discover-app` | Search Reader and Data Reader on `logs.app`. Data Reader, Data Writer and Query Select on `logs.discover` | Used only by the Discover page. It can write accounts and sessions but not log events |
| User `demo-analyst` | Read-only console, query and search access on `logs` | The person running ad hoc searches in the console |

Storage: use the cluster’s default dynamic SSD/Hyperdisk class (on current N4 demo nodes that is `dynamic-rwo`). Do not hard-require `premium-rwo` if the node pool cannot attach it.

Sink connector settings, as the `config` of a Strimzi `KafkaConnector`. Property names are from the [4.3 sink reference](https://docs.couchbase.com/kafka-connector/current/sink-configuration-options.html). Inject Couchbase credentials with Strimzi’s `${strimzienv:CB_USERNAME}` / `${strimzienv:CB_PASSWORD}` (plain `${env:…}` does not authenticate correctly with this Connect image).

```yaml
connector.class: com.couchbase.connect.kafka.CouchbaseSinkConnector
tasks.max: 2
topics: logs.app.v1
couchbase.seed.nodes: cb-logdemo-srv
couchbase.bucket: logs
couchbase.default.collection: app.events
couchbase.document.id: ${/event_id}
couchbase.document.expiration: 1d
couchbase.username: ${strimzienv:CB_USERNAME}
couchbase.password: ${strimzienv:CB_PASSWORD}
key.converter: org.apache.kafka.connect.storage.StringConverter
value.converter: org.apache.kafka.connect.json.JsonConverter
value.converter.schemas.enable: false
errors.tolerance: all
errors.deadletterqueue.topic.name: logs.app.dlq
errors.deadletterqueue.topic.replication.factor: 1
```

Size the Connect pod at about **2 Gi** memory; 1 Gi OOMs under sink load.

Analytics setup sketch (confirm type names against Couchbase Server 8.0 before finalising):

```sql
ALTER COLLECTION logs.app.events ENABLE ANALYTICS;

CREATE OR REPLACE ANALYTICS VIEW logs.app.events_v (
  event_id STRING, ts DATETIME, level STRING, service STRING, version STRING,
  env STRING, host STRING, region STRING, logger STRING, message STRING,
  trace_id STRING, http_method STRING, http_path STRING, http_status BIGINT,
  duration_ms BIGINT, user_id STRING, client_ip STRING,
  exception_class STRING, scenario STRING
) DEFAULT NULL PRIMARY KEY (event_id) NOT ENFORCED
AS SELECT e.event_id, datetime(e.ts) AS ts, e.level, e.service, e.version,
          e.env, e.host, e.region, e.logger, e.message, e.trace_id,
          e.http_method, e.http_path, e.http_status, e.duration_ms,
          e.user_id, e.client_ip, e.exception_class, e.scenario
   FROM logs.app.events e;
```

Search index: the init Job creates `events_fts` through the Search REST API on port 8094, as a scoped index under `logs.app`. Only the fields in the table are indexed; `stack_trace` is left out. Only `message` is stored in the index; the Discover page reads full documents by key. Example ad hoc query:

```sql
SELECT e.ts, e.service, e.level, e.message, e.trace_id
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:payments +level:ERROR message:timeout",
             {"index": "logs.app.events_fts"})
ORDER BY e.ts_ms DESC
LIMIT 50;
```

## Dashboards and search

### Grafana

Grafana is the Kibana Lens / dashboard replacement and the place for live Explore queries. Build a custom image from `grafana/grafana:<version>` that downloads the `couchbase-datasource` plugin zip into `/var/lib/grafana/plugins/couchbase-datasource` and sets:

```text
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=couchbase-datasource
```

Provision at deploy time:

- Admin user from Secret `grafana-admin` (GSM `logdemo-grafana-admin-password`).
- Data source `Couchbase` of type `couchbase-datasource`, host `couchbase://cb-logdemo-srv`, username `grafana-ro`, password from Secret `cb-user-grafana-ro`.
- `GF_SERVER_ROOT_URL` / `GF_SERVER_DOMAIN` from chart values (`publicScheme` + `host`).
- File dashboard provider mounting `/var/lib/grafana/dashboards` (phase 13 fills JSON).

Plugin query rules the harness must honour (also documented in `docs/grafana-query-sketches.md`):

- Every query must call `time_range(field)` or `str_time_range(field)` once in `WHERE`.
- A result column used as Grafana time must be an RFC3339 **string**. Prefer `TO_STRING(ts_ms) AS ts_ms` (or similar). A numeric `time` column panics the plugin.
- Quote reserved identifiers: `` `level` ``.
- Keep the `time_range` argument among the selected columns when practical.

Working Explore sketches to prove the data source before building dashboards:

```sql
-- Events per minute by level
SELECT TO_STRING(FLOOR(ts_ms / 60000) * 60000) AS ts_ms,
       `level`,
       TO_STRING(COUNT(*)) AS events
FROM logs.app.events
WHERE time_range(ts_ms)
GROUP BY FLOOR(ts_ms / 60000) * 60000, `level`
```

```sql
-- Latest errors
SELECT TO_STRING(ts_ms) AS ts_ms, service, exception_class, message, trace_id
FROM logs.app.events
WHERE time_range(ts_ms) AND `level` = "ERROR"
LIMIT 200
```

```sql
-- Search hits as log lines
SELECT TO_STRING(e.ts_ms) AS ts_ms,
       e.message AS content,
       e.service,
       e.`level`
FROM logs.app.events AS e
WHERE time_range(ts_ms)
  AND SEARCH(e, "+service:payments message:timeout", {"index": "logs.app.events_fts"})
LIMIT 200
```

Dashboards to build, each with a time range filter and filters for service, level and region:

| Dashboard | Charts | Kibana feature it replaces |
| --- | --- | --- |
| Executive overview | Events per hour by level, stacked area. Error rate as a big number with trend. Errors by service, bar. Share of requests slower than 500 ms by service, line. | Lens dashboard |
| Service health | HTTP status mix by service, stacked bar. Slowest endpoints with average and max duration, table. Events by region and by version, bars. | Lens dashboard with controls |
| Incident review | Errors by exception class and by version, bars. Top client IPs, table. Latest 200 errors with `trace_id` and message, table. | Discover saved search |

Dashboards are kept as code: build once in the UI (or by hand as JSON), store under `dashboards/`, and load through Grafana’s file provisioning ConfigMap so `make down` then `make up` restores them with no manual step. Auto-refresh on the order of 30 seconds so a started scenario appears quickly in the demo.

### Ad hoc search

Ad hoc log search uses the Couchbase Search service, not Grafana. The Discover page is the main surface and the one the presenter shows. The console and SQL++ stay available.

| Where | How | Good for |
| --- | --- | --- |
| Discover page at `https://<discover.host>` | Query bar, time picker, histogram, field filters, expandable rows, trace view. Spec below. | The demo itself, and anyone used to Kibana Discover |
| Grafana Explore | SQL++ sketches above | Operational drill-down beside dashboards |
| Couchbase Web Console, Search page | Query string against `events_fts` | Quick lookups during the demo |
| Query workbench | SQL++ with `SEARCH()`, plus follow-up by `trace_id` | Pulling every event of one failed request |
| Search REST API on port 8094 | JSON query sent with `curl` | Scripted checks and acceptance tests |

`docs/search-cookbook.md` holds six worked searches, at least one per incident scenario, each with its Discover page link. In the Web Console the presenter signs in as `demo-analyst`, never as the administrator.

## GKE and Helm layout

The stack is three Helm releases installed in order by a Makefile, all in namespace `logdemo` on a GKE Standard cluster. The split exists because operator CRDs must be registered before the resources that use them. Every asset except the cluster’s Terraform config lives in one GitHub repo.

- **Cluster.** GKE Standard in `us-central1`, created by the existing Terraform config pointed at by `TF_DIR`. This repo does not copy or fork it. The config must give: regular release channel, Workload Identity enabled, enough CPU/memory for the table below, and the HTTP load balancing add-on GKE Ingress needs. Override through `infra/gke/logdemo.tfvars` when variables exist. Set `SKIP_TF=1` on `make cluster` when the cluster already exists.
- **Storage.** Dynamic block storage through `dynamic-rwo` (or the cluster’s Hyperdisk-capable default). Couchbase data 50 Gi, index and search 20 Gi each, analytics 50 Gi. Kafka 20 Gi.
- **Images.** One Artifact Registry Docker repository, `logdemo`, holds the generator, Kafka Connect, Grafana and Discover images. Always build for **`linux/amd64`** (Apple Silicon hosts default to arm64 and GKE nodes reject those digests).
- **Access.** Discover at `https://<discover.host>`, Grafana at `https://<grafana.host>`, and the Couchbase console at `https://<couchbaseUi.host>` through separate Ingresses with `ingressClassName: haproxy`. Chart values (or `DISCOVER_HOST` / `GRAFANA_HOST` / `COUCHBASE_UI_HOST`) supply the hostnames — never commit live values. **Choose Grafana and console hostnames that cannot collide** (for example `logdemo-grafana.<domain>` and `logdemo-cb.<domain>`). All DNS A records must point at the **HAProxy LoadBalancer IP** (shared). cert-manager Issuer `logdemo-selfsigned` issues Secrets `discover-tls`, `grafana-tls`, and `couchbase-ui-tls`; Ingress `spec.tls` references those Secrets. Annotate Ingresses with `haproxy.org/ssl-redirect: "true"` and `haproxy.org/ssl-redirect-port: "443"`. On `cb-logdemo-ui`, set Service annotation `haproxy.org/cookie-persistence` via CAO `adminConsoleServiceTemplate` so console sessions stick.

```text
couchbase-log-search-demo/     # one GitHub repo
  README.md
  Makefile
  .github/workflows/ci.yaml
  .cursor/rules/
  infra/gke/
    logdemo.tfvars
    create-registry.sh
    create-ingress-ip.sh       # reserves logdemo-discover and logdemo-grafana
    create-secrets.sh
    setup-iam.sh
  charts/
    00-operators/     # Strimzi, Couchbase Autonomous Operator, External Secrets
    10-platform/      # ExternalSecrets, Kafka, Connect, Couchbase, init Job
    20-apps/          # Logstash, generator, sink connector, Grafana, Discover
  images/
    kafka-connect-couchbase/Dockerfile
    grafana-couchbase/Dockerfile
  generator/          # Maven project
  discover/           # Next.js project and Dockerfile
  dashboards/         # Grafana dashboard JSON
  docs/
    implementation-plan.md
    demo-script.md
    search-cookbook.md
    grafana-query-sketches.md
```

| Release | Contents | Ready when |
| --- | --- | --- |
| `00-operators` | Strimzi. Couchbase Autonomous Operator (admission controller; prefer namespaced watch for `logdemo`). External Secrets Operator if not already cluster-wide. | Operator Deployments Available; CRDs present |
| `10-platform` | `ExternalSecret` resources against `gcsm-store` (or a chart-managed store). `Kafka` + `KafkaNodePool` (one KRaft combined node). Topics `logs.app.v1` (3 partitions) and `logs.app.dlq`. `KafkaConnect` with the custom image. `CouchbaseCluster` with five services, bucket/scope/collection, users/groups/role bindings. Init Job for GSI, Search, Analytics. | Synced Secrets exist; Kafka Ready; Couchbase Available; init Job Complete |
| `20-apps` | Logstash Deployment, pipeline ConfigMap, Service on 5000. Generator Deployment and Service on 8080. `KafkaConnector` for the sink. Grafana Deployment/Service with provisioning ConfigMaps. Discover Deployment/Service. cert-manager Issuer + Certificates. HAProxy Ingresses for Discover, Grafana, and Couchbase UI (`cb-logdemo-ui:8091`) with TLS Secrets and SSL redirect. | Connector RUNNING; document count rising; Certificates Ready; `https://<discover.host>/login`, `https://<grafana.host>`, and `https://<couchbaseUi.host>` load (self-signed) |

Resource names: Kafka cluster `logdemo` → bootstrap `logdemo-kafka-bootstrap:9092`. Couchbase cluster `cb-logdemo` → seed `cb-logdemo-srv`.

### Logstash pipeline

Preserve the event schema exactly. A line codec puts the TCP payload in `[message]`; rename that field into metadata **before** the `json` filter so `remove_field` cannot drop the event’s own `message` property.

```text
input  { tcp { port => 5000 codec => line } }
filter {
  mutate { rename => { "message" => "[@metadata][raw]" } }
  json   { source => "[@metadata][raw]" remove_field => ["[@metadata][raw]"] }
  mutate { remove_field => ["@version", "@timestamp", "port"] }
}
output {
  kafka {
    bootstrap_servers => "logdemo-kafka-bootstrap:9092"
    topic_id          => "logs.app.v1"
    message_key       => "%{trace_id}"
    codec             => json
  }
}
```

### Ingress and TLS procedure

1. Confirm cert-manager and HAProxy Ingress are installed on the cluster (provided by the shared Terraform stack).
2. Create Issuer `logdemo-selfsigned` (`spec.selfSigned: {}`) and a Certificate per hostname whose `secretName` matches Ingress `spec.tls`.
3. Create Ingresses with `ingressClassName: haproxy`, TLS hosts/secrets, and SSL-redirect annotations (`haproxy.org/ssl-redirect` + `ssl-redirect-port: "443"` so redirects do not target HAProxy’s internal 8443). Couchbase UI Ingress backends to `cb-logdemo-ui:8091`; cookie persistence is a Service annotation on that UI Service (`adminConsoleServiceTemplate`).
4. Point Discover, Grafana, and Couchbase UI DNS A records at the HAProxy LoadBalancer IP (`make url` / `kubectl -n haproxy-ingress get svc`).
5. Set Grafana `publicScheme: https` so `GF_SERVER_ROOT_URL` matches the public URL.
6. Prefer `helm upgrade` for Ingress changes.

### Resources

Memory requests leave room on a three-node `e2-standard-4`-class pool for system pods:

| Component | Pods | Memory | CPU |
| --- | --- | --- | --- |
| Couchbase Server (data 1024 / index 3072 / search 1024 / analytics 1024 MB quotas; MOI) | 3 | 8 Gi each | 2 each |
| Kafka | 1 | 1.5 Gi | 1 |
| Logstash | 1 | 1.5 Gi | 1 |
| Kafka Connect | 1 | 2 Gi | 0.5 |
| Grafana | 1 | 0.5 Gi | 0.25 |
| Operators, admission, External Secrets | ~6 | 1 Gi | 0.5 |
| Generator | 1 | 0.5 Gi | 0.5 |
| Discover page | 1 | 0.5–1 Gi | 0.1 |

Makefile targets: `cluster` (optional `terraform apply`, credentials, `infra/gke` scripts), `images`, `up`, `status`, `ui` (generator :8080), `url` (prints Discover, Grafana, and Couchbase UI hosts, HAProxy IP, cert status), `scenario name=<scenario>`, `down`, `destroy` (releases first, wait for Ingress/PVCs, release IPs, then `terraform destroy`), `lint`, `test`.

### Secrets

Seven secrets live in Google Secret Manager and reach the cluster as Kubernetes Secrets through External Secrets. The repo holds secret names only.

| Secret Manager name | Kubernetes Secret | Used by |
| --- | --- | --- |
| `logdemo-cb-admin-password` | `cb-logdemo-auth` | `CouchbaseCluster` admin secret, init Job |
| `logdemo-cb-sink-password` | `cb-user-kafka-sink` | `CouchbaseUser` `kafka-sink`, Kafka Connect |
| `logdemo-cb-grafana-password` | `cb-user-grafana-ro` | `CouchbaseUser` `grafana-ro`, Grafana data source |
| `logdemo-cb-analyst-password` | `cb-user-demo-analyst` | `CouchbaseUser` `demo-analyst` |
| `logdemo-cb-discover-password` | `cb-user-discover-app` | `CouchbaseUser` `discover-app`, Discover page |
| `logdemo-discover-admin-password` | `discover-admin` | First password of the Discover `admin` user |
| `logdemo-grafana-admin-password` | `grafana-admin` | Grafana admin login |

Couchbase Operator rejects passwords containing `()<>,;:\"/[]?={}`. Generate alphanumeric values for all `logdemo-cb-*` secrets.

Setup:

1. Enable Secret Manager, Kubernetes Engine and Artifact Registry APIs.
2. Run `create-secrets.sh` (pipe random values into `gcloud secrets create`; never write values to disk).
3. Run `setup-iam.sh` for the ESO Google service account and Workload Identity binding on these secrets.
4. Install `10-platform` so ExternalSecrets sync.
5. Read a password with `gcloud secrets versions access latest --secret=<name>`.

Usernames are plain chart values. Kafka uses an internal plaintext listener (demo simplification). CI runs a secret scanner on every push.

## Java generator spec

The generator is one Spring Boot 3 service on Java 21, built with Maven and Jib. It runs the simulation and logs through Logback’s TCP appender to Logstash.

| Package | Responsibility |
| --- | --- |
| `sim.clock` | `SimClock`: virtual time. Backfill runs faster than real time; live follows the wall clock. |
| `sim.model` | Services, endpoints and request flows with base latency and error rates, loaded from `topology.yaml`. |
| `sim.engine` | `TrafficEngine`: Poisson arrivals shaped by the daily curve. Walks a request flow and produces `LogEvent` records. |
| `sim.scenario` | `Scenario` interface, the four scenarios, and a `ScenarioManager` holding active time windows. |
| `emit` | `EventEmitter`: sets MDC, calls an SLF4J logger named after the simulated class, applies the send-rate limit. |
| `api` | REST controller for scenarios and rate. |
| `config` | `@ConfigurationProperties` for everything below. |

Logging configuration in `logback-spring.xml`:

- Simulated events use loggers under the `synthetic.` prefix with additivity off. They go only to a `LogstashTcpSocketAppender` pointed at `logstash:5000`.
- The encoder is a `LoggingEventCompositeJsonEncoder` whose providers write exactly the schema field names. It must not emit the default `@timestamp`, `@version` or `level_value`.
- The generator’s own operational logs go to the console only.
- The TCP appender drops events when its ring buffer fills. Size the buffer for the backfill rate and expose a dropped-events counter.

| Property | Default | Meaning |
| --- | --- | --- |
| `generator.seed` | `42` | Reproduces the stream |
| `generator.mode` | `backfill-then-live` | Also `live` or `backfill` alone |
| `generator.backfill.hours` | `48` | History window ending now |
| `generator.backfill.avg-eps` | `5` | Simulated average rate |
| `generator.backfill.max-send-eps` | `2000` | Send throttle |
| `generator.live.eps` | `20` | Live average rate |
| `generator.logstash.host`, `.port` | `logstash`, `5000` | TCP destination |

| Endpoint | Effect |
| --- | --- |
| `POST /scenarios/{name}/start?durationMinutes=10` | Activates a scenario for a window |
| `POST /scenarios/{name}/stop` | Ends it early |
| `GET /scenarios` | Lists scenarios and which are active |
| `POST /rate?eps=50` | Changes the live rate |
| `GET /actuator/health`, `GET /actuator/prometheus` | Health and counters |

Event ids: backfill ids are derived from the seed and sequence number so a pod restart overwrites the same documents. Live ids are random UUIDs.

Dependencies: `spring-boot-starter-web`, `spring-boot-starter-actuator`, `micrometer-registry-prometheus`, `logstash-logback-encoder`, `datafaker`.

Tests:

- Same seed produces the same first 1,000 backfill events.
- Every event validates against `schema/log-event.schema.json`.
- Over 100,000 normal events, the level mix is within 2 points of the target.
- With `payment-outage` active, the `payments` error share exceeds 50%.

## Discover page spec

The Discover page is one Next.js app, App Router and TypeScript, that serves the UI and a small server-side API. The browser never talks to Couchbase: route handlers use the Couchbase Node.js SDK as `discover-app`. The page is public over HTTPS, and every page and route except sign-in and the health check needs a signed-in user.

| Kibana Discover feature | How the page provides it |
| --- | --- |
| Query bar | Search query string syntax, passed through unchanged |
| Time picker | Quick ranges (15m–7d) plus absolute start/end; default 15 minutes; date range on `ts` |
| Hit histogram | Date range facet on `ts`, at most 60 buckets; fixed interval ladder; drag to zoom |
| Field sidebar | Term facets (top 10) for service, level, region, host, version, scenario, exception_class, http_path, client_ip; numeric range facet for http_status classes |
| Document table | Selected columns (default ts, level, service, message); sortable headers for indexed fields; 50 rows, load more up to 500; message highlighting |
| Expanded document | Right-hand detail panel; selection preserved across refresh when the hit remains |
| Surrounding documents | Trace view at `/trace/{trace_id}` |
| Data views | Named Search source bindings in `logs.discover.data_views` (bootstrap `logs.app.events` → `events_fts`) |
| Saved sessions | Save/Open query, filters, columns, sort, time range, refresh, dataViewId in `logs.discover.saved_searches` |
| URL state | Shareable mirror of the active session (`q`, `from`/`to`, `filter`, `columns`, `sort`, `refresh`, `dataView`) |
| Refresh | Manual Refresh button; interval Off / 5 / 10 / 30 seconds (snapshot replace, not live scroll) |
| Inspect | Shows Search request JSON, total hits, Search service time |

Each page load sends one Search request to `events_fts` (query string + time range + filters + facets, sort from URL default `-ts`, limit 50). The route handler then reads those documents by key from the data service.

| Route | Returns |
| --- | --- |
| `GET /api/search` | `total`, `tookMs`, `hits`, `histogram`, `facets`, `request` |
| `GET /api/trace/{traceId}` | Up to 100 events for that trace, oldest first |
| `GET/POST /api/data-views`, `GET/PATCH/DELETE /api/data-views/{id}` | Data view CRUD (bootstrap view is not deletable) |
| `GET/POST /api/saved-searches`, `GET/PATCH/DELETE /api/saved-searches/{id}` | Saved Discover sessions |
| `GET /api/healthz` | 200 when the cluster connection is ready (no auth; LB health check) |
| `POST /api/auth/login`, `POST /api/auth/logout` | Session cookie |
| `POST /api/account/password` | Change own password; end other sessions |
| `GET/POST /api/users`, `PATCH/DELETE /api/users/{username}` | Admin only |

| Path in `discover/` | Responsibility |
| --- | --- |
| `app/page.tsx` | Discover page from URL search parameters |
| `app/trace/[traceId]/page.tsx` | Trace view |
| `app/login/page.tsx`, `app/account/page.tsx` | Sign-in and change-password |
| `app/users/page.tsx` | User admin (admin only) |
| `app/api/*/route.ts` | Node.js route handlers, never cached |
| `lib/couchbase.ts` / SDK helper | One cluster connection per process on `globalThis` |
| `lib/auth.ts` | Hashing, sessions, `requireUser` / `requireAdmin` |
| `lib/users.ts` | Accounts in `logs.discover.users`; first-start `admin` bootstrap |
| `lib/search-request.ts` | URL state → Search JSON (Inspect shows the same object) |
| `lib/fields.ts` | Default columns, sortable allowlist, column/sort parsers |
| `lib/data-views.ts` / `lib/saved-searches.ts` | Couchbase CRUD for Discover config objects |
| `lib/time.ts` | Relative ranges and bucket ladder |
| `components/` | QueryBar, TimePicker, Histogram, FieldSidebar, DocTable, DocDetail, DataViewControls, InspectPanel, UserTable |

Build and runtime rules:

- Tailwind CSS and Recharts only for UI charting.
- List `couchbase` in `serverExternalPackages`, `output: 'standalone'`, same Debian-slim Node base for build and runtime so the native binary matches. Prefer `createRequire` if ESM interop with the SDK fails.
- Environment: `CB_CONNSTR=couchbase://cb-logdemo-srv`, credentials from `cb-user-discover-app`, bucket/scope/collection/index names, `DISCOVER_ADMIN_PASSWORD` from `discover-admin`.
- Search and trace routes are read-only. Writes only to `logs.discover`.
- Cap `limit` at 50 and `skip + limit` at 500. Reject unknown filter fields.
- Highlight fragments are HTML from Search: split on mark tags and render text nodes; do not inject raw HTML.
- Avoid fetching Google Fonts at build time in locked-down CI/network environments; ship local font stacks.

### Access and user management

Accounts are local to the Discover page: no self-registration and no external IdP. An admin creates every other user.

| Area | Rule |
| --- | --- |
| Roles | `admin` searches and manages users. `viewer` searches only. Both can change their own password. |
| First admin | On start, if `user::admin` does not exist, insert it from `DISCOVER_ADMIN_PASSWORD` (KV insert so two pods cannot both create it). Changing the secret later does not change an existing account. |
| Admin recovery | Delete `user::admin` and restart the pod. |
| Passwords | scrypt via Node `crypto`, random salt, minimum 12 characters. Admin-set passwords must change at next sign-in. |
| Sessions | Random 256-bit token in `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Server stores SHA-256 as the sessions document key; 12-hour expiry. |
| Revocation | `tokenVersion` on the user; password change / disable / delete bumps it. |
| Lockout | Five failed sign-ins → 15 minute lock. Errors never reveal whether the username exists. |
| Admin safety | Last enabled admin cannot be disabled, demoted or deleted. |
| Request checks | Every handler calls `requireUser` or `requireAdmin`. State-changing routes check `Origin`. |
| Audit | Sign-ins, failures and user changes to pod logs as JSON without secrets. |

| Document | Key | Fields |
| --- | --- | --- |
| User | `user::<username>` in `logs.discover.users` | username, role, passwordHash, disabled, mustChangePassword, tokenVersion, failedLogins, lockedUntil, createdAt, lastLoginAt |
| Session | SHA-256 of cookie token in `logs.discover.sessions` | username, tokenVersion, createdAt, 12h expiry |
| Data view | `dataview::<id>` in `logs.discover.data_views` | title, searchIndex, timeField, defaultColumns, availableFields, bootstrap |
| Saved search | `saved::<id>` in `logs.discover.saved_searches` | title, dataViewId, q, filters, columns, sort, from/to, refresh, owner |

Exposure: TLS ends at HAProxy using the cert-manager Secret. HTTP redirects to HTTPS. The Discover Ingress routes only to the Discover Service.

Tests (Vitest or equivalent): histogram bucket caps; URL → Search JSON; relative ranges with injected clock; rejected query → 400; authz 401/403 matrix; password hash verify; tokenVersion invalidation; lockout; last-admin protection; admin bootstrap once.

## README and sizing hints

The README is the single entry point: prerequisites, `TF_DIR`, GCP setup, DNS for Discover and Grafana, secrets list, install, first sign-in and admin recovery, link to the demo script, teardown, and sizing Couchbase for real log volume.

Sizing section must cover: volume from eps × retention; data disk with compression headroom; Magma full eviction working set; narrow Search mapping; Analytics as a second copy; cheap narrow GSIs (never index `message` in GSI); separate server classes beyond the demo; matching Kafka partitions and `tasks.max` to ingest.

Worked volumes at 1 KB per event and 1 day retention, before compression:

| Average events per second | Documents retained | Raw data per copy |
| --- | --- | --- |
| 20 (this demo live) | 1.7 million | 1.7 GB |
| 500 | 43 million | 43 GB |
| 5,000 | 432 million | 432 GB |

Show how to calibrate from bucket statistics on the running demo.

## Build phases

Give the coding assistant one phase at a time with this document as context, and move on only when the acceptance check passes. Each phase leaves a working cluster.

| # | Phase | Deliverables | Acceptance check |
| --- | --- | --- | --- |
| 1 | Skeleton | Repo layout, Makefile, three chart scaffolds, CI workflow | `helm lint` on all charts; secret scan clean |
| 2 | GKE and secrets | Review Terraform against cluster requirements, `logdemo.tfvars` if needed, `infra/gke` scripts, Artifact Registry, reserved IPs, seven secrets, IAM | `make cluster` (or `SKIP_TF=1`) yields Ready nodes with Workload Identity; `gcloud secrets list` shows the seven names; no secret values in git |
| 3 | Operators | `00-operators` with pinned chart versions | Strimzi, Couchbase and External Secrets CRDs present; operator pods Ready |
| 4 | Kafka | `Kafka`, `KafkaNodePool`, both topics | Console producer/consumer round-trip on `logs.app.v1` |
| 5 | Couchbase | ExternalSecrets, cluster with five services, bucket/scope/collection, users including `grafana-ro`, init Job | Synced Secrets exist; `SELECT COUNT(*) FROM logs.app.events` returns 0; `events_v` and `events_fts` exist |
| 6 | Sink | Connect amd64 image, `KafkaConnect` (≥2 Gi), `KafkaConnector` with `strimzienv` | Hand-produced JSON appears as a document keyed by `event_id`; malformed record lands in `logs.app.dlq` |
| 7 | Logstash | Deployment, rename-before-json pipeline, Service | One JSON line via TCP to :5000 arrives in Couchbase with schema fields intact (including `message`) |
| 8 | Generator | Maven project, tests, Jib amd64 image, Deployment | Tests pass; after backfill, document count within 1% of emitted counter and `ts` spans 48 hours |
| 9 | Search | `docs/search-cookbook.md`, REST check script | As `demo-analyst`, `+service:payments +level:ERROR` returns hits in the console and via SQL++ `SEARCH()` |
| 10 | Discover page | `discover/` app, search/trace features, tests, image, Deployment/Service, cookbook links | Via port-forward with `payment-outage` running: query shows hits, histogram spike and field counts matching a direct Search REST count; trace view spans ≥2 services |
| 11 | Discover access | Auth, users UI, HAProxy Ingress, cert-manager Certificate, HTTPS redirect, DNS → HAProxy IP | From outside: HTTPS login works (self-signed); HTTP redirects to HTTPS; unauthenticated `/api/search` is 401; admin creates viewer; viewer cannot open users; disable ends session |
| 12 | Grafana | Custom image, chart, provisioned data source, Explore sketches, HAProxy Ingress (unique hostname), cert-manager Certificate | Explore sketches return rows without plugin panic; external HTTPS serves `/login` and `/api/health`; admin secret logs in |
| 13 | Dashboards | Three dashboards in `dashboards/` (and `charts/20-apps/dashboards/`), loaded by Grafana file provisioning into folder Logdemo | `make down` then `make up` shows Executive overview, Service health, and Incident review populated with no manual import |
| 14 | README and demo script | Full README; `docs/demo-script.md`; `make scenario` | A new engineer reaches dashboards from the README alone; starting `payment-outage` shows an error spike on Executive overview within 60 seconds |

All fourteen phases are complete for the current stack. Presenter walkthrough: [`docs/demo-script.md`](demo-script.md).

## Risks and checks before building

- [ ] **Licence.** CAO and Analytics need Couchbase Enterprise Edition. Confirm terms cover this demo.
- [ ] **Analytics in the pinned build.** Confirm `ENABLE ANALYTICS` and tabular views on Server 8.0.x.
- [ ] **Datetime parsing.** Confirm `datetime()` accepts `ts` with a `Z` suffix; otherwise convert from `ts_ms` in the view.
- [ ] **Percentiles.** Prefer “share over 500 ms” unless Analytics percentile aggregates are confirmed.
- [ ] **Versions.** Pin exact patches of Strimzi, Kafka, Logstash, Grafana, plugin, CAO chart, Next.js and the Node SDK.
- [ ] **Terraform config.** Confirm Workload Identity, release channel, node capacity, storage class, HTTP LB add-on, and whether Artifact Registry already exists. Confirm `make destroy` will not wipe unrelated workloads sharing that state.
- [ ] **DNS names.** Pick Discover and Grafana hostnames you control. Grafana must not collide with cluster monitoring. Both A records must target the HAProxy LoadBalancer IP.
- [ ] **cert-manager / HAProxy.** Confirm the shared Terraform stack installed them before phase 11.
- [ ] **Public endpoints.** Sign-in pages face the internet; data is synthetic. Self-signed certs require accepting a browser warning.

- [ ] **Teardown order.** Remove Helm releases and wait for Ingress LBs before `terraform destroy`.
- [ ] **Discover facets.** Confirm 60-range date facet + term facets + `-ts` sort + message highlighting on Server 8.0.
- [ ] **Node.js SDK in the image.** Confirm the prebuilt binary loads in the Next.js standalone image.
- [ ] **Search lag.** A started scenario should appear on Discover within one 5-second refresh.
- [ ] **Scope of claims.** Three Couchbase pods show the pattern, not production performance. Say so in the demo script.
- [ ] **Cost.** Nodes, disks, load balancers and reserved IPs bill while they exist.

Open question: should Elasticsearch and Kibana also run for a side-by-side comparison? That adds roughly 4 Gi of memory and a second Logstash output. Out of scope unless explicitly requested.

## Sources

- [Couchbase Kafka Connector release notes](https://docs.couchbase.com/kafka-connector/current/release-notes.html)
- [Couchbase Kafka Connector sink configuration options](https://docs.couchbase.com/kafka-connector/current/sink-configuration-options.html)
- [Couchbase Kubernetes Operator](https://docs.couchbase.com/operator/current/whats-new.html)
- [Couchbase Server sizing guidelines](https://docs.couchbase.com/server/current/install/sizing-general.html)
- [External Secrets Operator, GSM provider](https://external-secrets.io/latest/provider/google-secrets-manager)
- [Couchbase blog: Grafana plugin](https://www.couchbase.com/blog/grafana-couchbase-plugin-beta-released/)
- [Couchbase Node.js SDK, Search](https://docs.couchbase.com/nodejs-sdk/current/howtos/full-text-searching-with-sdk.html)
- [Couchbase Server, Search request JSON](https://docs.couchbase.com/server/current/search/search-request-params.html)
- [Next.js documentation](https://nextjs.org/docs)
- [cert-manager documentation](https://cert-manager.io/docs/)
- [HAProxy Kubernetes Ingress](https://www.haproxy.com/documentation/kubernetes-ingress/)
