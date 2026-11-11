#!/usr/bin/env bash
# Create Artifact Registry Docker repository "logdemo" unless it already exists.
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-logdemo}"

if gcloud artifacts repositories describe "${REPO}" \
  --location="${REGION}" --project="${PROJECT}" >/dev/null 2>&1; then
  echo "Artifact Registry ${REGION}-docker.pkg.dev/${PROJECT}/${REPO} already exists"
  exit 0
fi

gcloud artifacts repositories create "${REPO}" \
  --repository-format=docker \
  --location="${REGION}" \
  --project="${PROJECT}" \
  --description="Couchbase log analytics demo images"

echo "Created ${REGION}-docker.pkg.dev/${PROJECT}/${REPO}"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
