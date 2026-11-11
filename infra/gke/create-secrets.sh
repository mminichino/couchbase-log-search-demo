#!/usr/bin/env bash
# Generate random values and create the seven Secret Manager secrets.
# Values are piped into gcloud and never written to disk or the repo.
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project)}"

SECRETS=(
  logdemo-cb-admin-password
  logdemo-cb-sink-password
  logdemo-cb-grafana-password
  logdemo-cb-analyst-password
  logdemo-cb-discover-password
  logdemo-discover-admin-password
  logdemo-grafana-admin-password
)

# Couchbase Operator rejects passwords containing: ()<>,;:\"/[]?={}
# Use alphanumeric for CB secrets; broader charset for app/session keys.
rand_alnum() {
  openssl rand -base64 48 | tr -d '\n+/=' | tr -d '()<>,;:\\"/[]?={}' | head -c 32
}
rand_app() {
  openssl rand -base64 32 | tr -d '\n' | tr '+/' '-_' | tr -d '='
}
rand_for() {
  case "$1" in
    logdemo-cb-*) rand_alnum ;;
    *) rand_app ;;
  esac
}

for name in "${SECRETS[@]}"; do
  if gcloud secrets describe "${name}" --project="${PROJECT}" >/dev/null 2>&1; then
    echo "Secret ${name} already exists; leaving current versions unchanged"
    continue
  fi
  rand_for "${name}" | gcloud secrets create "${name}" \
    --project="${PROJECT}" \
    --replication-policy=automatic \
    --data-file=-
  echo "Created secret ${name}"
done

echo "Done. Read a value with: gcloud secrets versions access latest --secret=<name>"
