#!/usr/bin/env bash
# Reserve (or release) global static IPs used by the Discover and Grafana Ingresses.
set -euo pipefail

NAMES=(logdemo-discover logdemo-grafana)
PROJECT="${PROJECT:-$(gcloud config get-value project)}"

# Allow a single-name override for callers that still pass IP_NAME.
if [[ -n "${IP_NAME:-}" ]]; then
  NAMES=("${IP_NAME}")
fi

reserve_one() {
  local name="$1"
  if gcloud compute addresses describe "${name}" --global --project="${PROJECT}" >/dev/null 2>&1; then
    local ip
    ip=$(gcloud compute addresses describe "${name}" --global --project="${PROJECT}" --format='value(address)')
    echo "Static IP ${name} already reserved: ${ip}"
    return 0
  fi
  gcloud compute addresses create "${name}" \
    --global \
    --ip-version=IPV4 \
    --project="${PROJECT}"
  local ip
  ip=$(gcloud compute addresses describe "${name}" --global --project="${PROJECT}" --format='value(address)')
  echo "Reserved ${name}=${ip}"
}

release_one() {
  local name="$1"
  if gcloud compute addresses describe "${name}" --global --project="${PROJECT}" >/dev/null 2>&1; then
    gcloud compute addresses delete "${name}" --global --project="${PROJECT}" --quiet
    echo "Released global address ${name}"
  else
    echo "Address ${name} not found; nothing to release"
  fi
}

if [[ "${1:-}" == "--release" ]]; then
  for name in "${NAMES[@]}"; do
    release_one "${name}"
  done
  exit 0
fi

for name in "${NAMES[@]}"; do
  reserve_one "${name}"
done

echo "Create DNS A records for discover.host and grafana.host pointing at these addresses."
