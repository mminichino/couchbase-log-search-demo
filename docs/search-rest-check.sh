#!/usr/bin/env bash
# Phase 9 acceptance: demo-analyst Search REST + SQL++ SEARCH() return hits.
set -euo pipefail

NAMESPACE="${NAMESPACE:-logdemo}"
QUERY="${QUERY:-+service:payments +level:ERROR}"
MIN_HITS="${MIN_HITS:-1}"

ANALYST_PASS="$(kubectl -n "$NAMESPACE" get secret cb-user-demo-analyst -o jsonpath='{.data.password}' | base64 -d)"

BODY="$(QUERY="$QUERY" python3 -c 'import json,os; print(json.dumps({"query":{"query":os.environ["QUERY"]},"size":5,"sort":["-ts"]}))')"

echo "Query: $QUERY"
kubectl -n "$NAMESPACE" exec cb-logdemo-0000 -c couchbase-server -- \
  curl -sf -u "demo-analyst:${ANALYST_PASS}" \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  'http://127.0.0.1:8094/api/bucket/logs/scope/app/index/events_fts/query' \
  > /tmp/logdemo-fts-check.json

MIN_HITS="$MIN_HITS" python3 - <<'PY'
import json, os
min_hits = int(os.environ["MIN_HITS"])
doc = json.load(open("/tmp/logdemo-fts-check.json"))
total = doc.get("total_hits") or doc.get("totalHits") or 0
status = doc.get("status") or {}
failed = status.get("failed", 0) if isinstance(status, dict) else 0
print(f"total_hits={total} failed={failed}")
if failed:
    raise SystemExit(f"Search reported failed partitions: {status}")
if total < min_hits:
    raise SystemExit(f"expected at least {min_hits} hits, got {total}")
hits = doc.get("hits") or []
if hits:
    print(f"sample_id={hits[0].get('id')}")
print("SEARCH_REST_OK")
PY

echo "SQL++ SEARCH() check..."
SQL="$(QUERY="$QUERY" python3 -c 'import json,os; q=os.environ["QUERY"]; print(json.dumps({"statement":"SELECT META(e).id, e.service, e.`level`, e.message FROM logs.app.events AS e WHERE SEARCH(e, "+json.dumps(q)+", {\"index\": \"logs.app.events_fts\"}) LIMIT 3"}))')"

kubectl -n "$NAMESPACE" exec cb-logdemo-0000 -c couchbase-server -- \
  curl -sf -u "demo-analyst:${ANALYST_PASS}" \
  -H 'Content-Type: application/json' \
  http://127.0.0.1:8093/query/service \
  -d "$SQL" \
  > /tmp/logdemo-sql-check.json

python3 - <<'PY'
import json
doc = json.load(open("/tmp/logdemo-sql-check.json"))
if doc.get("status") != "success":
    raise SystemExit(doc)
results = doc.get("results") or []
if not results:
    raise SystemExit("SQL++ SEARCH returned zero rows")
print(f"sql_rows={len(results)} sample={results[0]}")
print("SEARCH_SQL_OK")
PY
