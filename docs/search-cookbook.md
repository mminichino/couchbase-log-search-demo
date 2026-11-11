# Search cookbook

Worked queries against the scoped Search index `logs.app.events_fts`. Sign in to the Couchbase Web Console as **`demo-analyst`**, never as Administrator.

Discover base URL: whatever `make url` prints for Discover (path `/` or `/login`).

## 1. Payment errors (payment-outage)

Query string:

```text
+service:payments +level:ERROR
```

Discover query params: `?q=%2Bservice%3Apayments+%2Blevel%3AERROR&from=now-15m`

SQL++:

```sql
SELECT META(e).id, e.ts, e.service, e.`level`, e.message, e.trace_id, e.scenario
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:payments +level:ERROR",
             {"index": "logs.app.events_fts"})
ORDER BY e.ts_ms DESC
LIMIT 50;
```

REST (`POST` body):

```json
{
  "query": { "query": "+service:payments +level:ERROR" },
  "size": 10,
  "sort": ["-ts"]
}
```

## 2. Timeout wording in payments

```text
+service:payments +level:ERROR timeout
```

Discover: `?q=%2Bservice%3Apayments+%2Blevel%3AERROR+timeout&from=now-1h`

```sql
SELECT META(e).id, e.ts, e.message, e.trace_id
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:payments +level:ERROR timeout",
             {"index": "logs.app.events_fts"})
ORDER BY e.ts_ms DESC
LIMIT 25;
```

## 3. Latency creep on catalog (slow requests)

After starting `latency-creep`:

```text
+service:catalog +duration_ms:>500
```

Discover: `?q=%2Bservice%3Acatalog+%2Bduration_ms%3A%3E500&from=now-30m`

```sql
SELECT META(e).id, e.ts, e.http_path, e.duration_ms, e.scenario
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:catalog +duration_ms:>500",
             {"index": "logs.app.events_fts"})
ORDER BY e.duration_ms DESC
LIMIT 50;
```

## 4. Auth attack failed logins

After starting `auth-attack`:

```text
+service:auth +level:WARN
```

Or narrow by path:

```text
+service:auth +http_path:/login +level:WARN
```

Discover: `?q=%2Bservice%3Aauth+%2Blevel%3AWARN&from=now-15m`

```sql
SELECT e.client_ip, COUNT(*) AS c
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:auth +level:WARN",
             {"index": "logs.app.events_fts"})
GROUP BY e.client_ip
ORDER BY c DESC
LIMIT 10;
```

## 5. Bad deploy NullPointerException

After starting `bad-deploy`:

```text
+service:orders +exception_class:java.lang.NullPointerException
```

Discover: `?q=%2Bservice%3Aorders+%2Bexception_class%3Ajava.lang.NullPointerException&from=now-30m`

```sql
SELECT e.version, e.exception_class, COUNT(*) AS c
FROM logs.app.events AS e
WHERE SEARCH(e, "+service:orders +exception_class:java.lang.NullPointerException",
             {"index": "logs.app.events_fts"})
GROUP BY e.version, e.exception_class
ORDER BY c DESC;
```

## 6. Trace drill-down

Pick a `trace_id` from any ERROR hit, then:

```text
+trace_id:<trace_id>
```

Discover path: `/trace/<trace_id>`

```sql
SELECT e.ts, e.service, e.`level`, e.message, e.http_status, e.duration_ms
FROM logs.app.events AS e
WHERE SEARCH(e, "+trace_id:<trace_id>",
             {"index": "logs.app.events_fts"})
ORDER BY e.ts_ms ASC
LIMIT 100;
```

## REST check

From a machine with cluster access:

```bash
./docs/search-rest-check.sh
```

The script authenticates as `demo-analyst`, runs query (1), and exits non-zero if there are no hits.
