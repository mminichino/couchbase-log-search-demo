#!/usr/bin/env bash
# Create GSA logdemo-eso, grant Secret Manager access on the seven secrets only,
# and bind Workload Identity to a Kubernetes SA used by a namespace SecretStore.
#
# The cluster's existing ClusterSecretStore "gcsm-store" uses external-secrets-sa →
# gke-sa (project-wide secretAccessor). This script adds a least-privilege path for
# the demo without changing that store. Phase 5 can use either store.
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project)}"
GSA_NAME="${GSA_NAME:-logdemo-eso}"
GSA_EMAIL="${GSA_NAME}@${PROJECT}.iam.gserviceaccount.com"
KSA_NAMESPACE="${KSA_NAMESPACE:-logdemo}"
KSA_NAME="${KSA_NAME:-logdemo-eso}"

SECRETS=(
  logdemo-cb-admin-password
  logdemo-cb-sink-password
  logdemo-cb-grafana-password
  logdemo-cb-analyst-password
  logdemo-cb-discover-password
  logdemo-discover-admin-password
  logdemo-grafana-admin-password
)

if ! gcloud iam service-accounts describe "${GSA_EMAIL}" --project="${PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${GSA_NAME}" \
    --project="${PROJECT}" \
    --display-name="Logdemo External Secrets"
  echo "Created ${GSA_EMAIL}"
else
  echo "GSA ${GSA_EMAIL} already exists"
fi

for name in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "${name}" \
    --project="${PROJECT}" \
    --member="serviceAccount:${GSA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
done
echo "Granted secretAccessor on seven logdemo secrets"

gcloud iam service-accounts add-iam-policy-binding "${GSA_EMAIL}" \
  --project="${PROJECT}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT}.svc.id.goog[${KSA_NAMESPACE}/${KSA_NAME}]" \
  --quiet >/dev/null
echo "Bound workloadIdentityUser for ${KSA_NAMESPACE}/${KSA_NAME}"

# Create the namespace and KSA early so WI is ready before helm install.
kubectl get ns "${KSA_NAMESPACE}" >/dev/null 2>&1 || kubectl create ns "${KSA_NAMESPACE}"
if ! kubectl -n "${KSA_NAMESPACE}" get sa "${KSA_NAME}" >/dev/null 2>&1; then
  kubectl -n "${KSA_NAMESPACE}" create sa "${KSA_NAME}"
fi
kubectl -n "${KSA_NAMESPACE}" annotate sa "${KSA_NAME}" \
  iam.gke.io/gcp-service-account="${GSA_EMAIL}" \
  --overwrite

echo "IAM setup complete (GSA ${GSA_EMAIL} → ${KSA_NAMESPACE}/${KSA_NAME})"
echo "Note: existing ClusterSecretStore gcsm-store still works via gke-sa."
