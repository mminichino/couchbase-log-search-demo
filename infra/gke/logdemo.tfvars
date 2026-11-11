# Overrides for the existing Terraform config at TF_DIR
# (couchbase-terraform/gcp/us-central1/demo).
#
# Cluster review (phase 2) notes against the running stack:
#   - Workload Identity: enabled (couchbase-se.svc.id.goog)
#   - Nodes: 3 × n4-standard-16 (larger than plan's e2-standard-4; OK for demo)
#   - Nodes: n4-standard-16 (Hyperdisk only — pd-ssd / premium-rwo cannot attach)
#   - Storage class for this demo: dynamic-rwo (hyperdisk-balanced on N4)
#   - premium-rwo exists but is incompatible with the current machine type
#   - Regional cluster: true
#   - Operators already installed by modules gke_env + operator:
#       External Secrets (ClusterSecretStore gcsm-store), Couchbase CAO
#   - Artifact Registry: not created by this TF config — use create-registry.sh
#   - Domain zone: gcp-unix-us-com (for Discover DNS in phase 11)
#
# No Terraform variable overrides required for current sizing; charts must use
# storageClass dynamic-rwo while machine_type is n4-*.
