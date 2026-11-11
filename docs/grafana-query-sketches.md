# Grafana Explore query sketches

Working against Grafana OSS 12.4.15 and `couchbase-datasource` 1.2.1.

## Plugin constraints

- Every query must call `time_range(field)` or `str_time_range(field)` once in `WHERE`.
- The plugin wraps the query as `SELECT * FROM (…) AS data ORDER BY … data.<field>`.
- For **timeseries panels**, alias the bucket with `MILLIS_TO_STR(...) AS \`time\`` so Grafana
  gets a real `time` field. Leave metric columns as numbers (`COUNT(*)`, not `TO_STRING(COUNT(*))`).
- `time_range(ts_ms)` still uses the numeric field; do not rename that argument to `time`.
- Quote reserved identifiers: `` `level` ``.
- Prefer last **15m–1h** on dashboards. Wide ranges (6h+) with several GROUP BY panels can
  exceed the browser’s ~30s query timeout even when the index is healthy.

## Sketches

### 1. Events per minute by level (Analytics on)

```sql
SELECT MILLIS_TO_STR(FLOOR(ts_ms / 60000) * 60000) AS `time`,
       `level`,
       COUNT(*) AS events
FROM logs.app.events
WHERE time_range(ts_ms)
GROUP BY FLOOR(ts_ms / 60000) * 60000, `level`
```

### 2. Latest errors (Query service)

```sql
SELECT TO_STRING(ts_ms) AS ts_ms, service, exception_class, message, trace_id
FROM logs.app.events
WHERE time_range(ts_ms) AND `level` = "ERROR"
LIMIT 200
```

### 3. Search hits as log lines (Query service)

```sql
SELECT TO_STRING(e.ts_ms) AS ts_ms,
       e.message AS content,
       e.service,
       e.`level`
FROM logs.app.events AS e
WHERE time_range(ts_ms)
  AND SEARCH(e, "+service:payments message:timeout", {"index": "logs.app.events_fts"})
LIMIT 200
```
