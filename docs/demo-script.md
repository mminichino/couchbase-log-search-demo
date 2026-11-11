# Demo script

Presenter walkthrough for the Couchbase log analytics demo. Assumes the stack is already up (`make up`) and DNS points Discover, Grafana, and the Couchbase UI at the HAProxy LoadBalancer IP (`make url`).

Data is synthetic. Self-signed TLS will show a browser warning — proceed past it.

## Before the audience arrives

1. Confirm pods: `make status` (generator, Logstash, Connect, Couchbase, Grafana, Discover Ready).
2. Print URLs: `make url`.
3. Fetch passwords (do not put them in slides):

   ```bash
   gcloud secrets versions access latest --secret=logdemo-grafana-admin-password
   gcloud secrets versions access latest --secret=logdemo-discover-admin-password
   ```

4. Open two browser tabs:
   - Grafana → folder **Logdemo** → **Executive overview** (time range **Last 15 minutes**, refresh **30s**).
   - Discover → sign in as `admin`.
5. Optional third tab: Couchbase Web Console (`make url` → Couchbase UI) signed in as **`demo-analyst`**, never Administrator.

## Story in one sentence

A five-service shop emits structured JSON logs through Logstash and Kafka into Couchbase; Grafana shows operational charts with SQL++, and Discover searches the same events with Couchbase Search.

## Act 1 — Healthy baseline (Grafana)

1. On **Executive overview**, show **Events per minute by level** (mostly INFO).
2. Note **Error count (window)** is non-zero but modest in normal traffic.
3. Optionally open **Service health** (4xx/5xx by service) and **Incident review** (exception table) so the audience sees the three provisioned dashboards.

Talking point: one document shape end to end — the JSON the generator logs is what Couchbase stores and what both UIs read.

## Act 2 — Inject an incident

From a terminal (not in the browser):

```bash
make scenario name=payment-outage
```

This calls the generator API to run `payment-outage` for ten minutes (payments 503s; orders retries/failures).

Within about a minute on **Executive overview** (15m range, 30s refresh):

- **Error count** rises.
- **Errors by service** highlights `payments` (and related `orders` noise).
- **Events per minute by level** shows a larger ERROR band.

If panels look empty, set the time picker to **Last 15 minutes** (wide ranges are slower under the demo’s indexer settings).

Other scenarios for follow-ups: `latency-creep`, `auth-attack`, `bad-deploy` (same `make scenario name=…` form).

## Act 3 — Search the incident (Discover)

Optional: show **Data view** `logs.app.events`, add a column from Selected fields, click a column header to sort, open a row (detail stays put on Refresh), then **Save** a session.

1. In Discover, query:

   ```text
   +service:payments +level:ERROR
   ```

   Time range: last 15 minutes. Show hits, histogram spike, and field facets (`service`, `level`, `scenario`).

2. Expand one document — point out `trace_id`, `http_status`, `scenario=payment-outage`.
3. Open **Trace** for that `trace_id` — events across multiple services for one failed request.
4. Optional cookbook queries: see [`search-cookbook.md`](search-cookbook.md) (timeouts, auth WARN burst, bad-deploy exceptions).

Talking point: Search index `events_fts` powers Discover; the same corpus backs Grafana SQL++.

## Act 4 — Power-user path (optional, two minutes)

In the Query workbench as `demo-analyst`:

```sql
SELECT e.ts, e.service, e.`level`, e.message, e.trace_id
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:payments +level:ERROR",
             {"index": "logs.app.events_fts"})
ORDER BY e.ts_ms DESC
LIMIT 20;
```

Or Grafana **Explore** with a sketch from [`grafana-query-sketches.md`](grafana-query-sketches.md) (always include `time_range(ts_ms)`; for charts use `MILLIS_TO_STR(...) AS \`time\`` and numeric `COUNT(*)`).

## Act 5 — Close

- One pipeline: generator → Logstash → Kafka → Couchbase.
- Two lenses: Grafana (aggregates) and Discover (search + trace).
- Incidents are scripted and repeatable: `make scenario name=payment-outage`.

Teardown when finished with the environment: `make down` (or `make destroy` only if you intend to tear down the Terraform cluster).

## Timing guide (~12 minutes)

| Minutes | Beat |
| --- | --- |
| 0–2 | Architecture one-liner + open Executive overview |
| 2–4 | Baseline charts |
| 4–6 | `make scenario name=payment-outage` + watch ERROR rise |
| 6–10 | Discover query + document + trace |
| 10–12 | Optional SQL++ / Explore; wrap-up |
