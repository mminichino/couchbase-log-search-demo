# Optional overrides for the existing Terraform config at TF_DIR.
#
# Review your cluster against the plan before apply:
#   - Workload Identity enabled
#   - Node size/count enough for the stack (plan tables in docs/implementation-plan.md)
#   - Storage class compatible with the node machine type (this demo uses dynamic-rwo)
#   - Operators / ClusterSecretStore may already exist from the shared Terraform stack
#   - Artifact Registry: use infra/gke/create-registry.sh if the TF config does not create it
#
# No committed overrides required for a generic install; set values locally as needed.
# Do not put live project IDs, DNS zones, or hostnames in this file.
