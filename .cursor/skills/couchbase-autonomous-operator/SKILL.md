---
name: couchbase-autonomous-operator
description: Install, configure, operate, upgrade and troubleshoot the Couchbase Autonomous Operator (CAO, also called the Couchbase Kubernetes Operator) on Kubernetes, OpenShift, EKS, GKE and AKS. Use this skill whenever someone mentions CAO, the Couchbase operator, the cao CLI, the couchbase-operator Helm chart, the admission controller (DAC), CouchbaseCluster / CouchbaseBucket / CouchbaseBackup manifests or CRDs, or asks how to run, size, scale, back up, upgrade or debug Couchbase Server on Kubernetes or OpenShift. Trigger even when the ask is indirect, such as "write a runbook for Couchbase on EKS", "why is my cbc stuck", "review this cluster YAML", "plan our 7.6 to 8.0 upgrade on k8s", or a customer PoC that will run on Kubernetes, because version compatibility and upgrade ordering are easy to get wrong from memory.
---

# Couchbase Autonomous Operator

Help the user install the Operator, deploy and run Couchbase Server clusters with it, and get unstuck when something fails. The output is usually one of: a set of commands, a manifest, a runbook, a review of someone's YAML, or a diagnosis.

Everything here comes from Couchbase's public documentation and release notes, checked against Operator 2.9.4 (October 2026). The Operator ships a maintenance release every few months, so confirm anything version-specific before putting it in front of a customer. See "Checking current facts" at the end.

## How to work

1. Establish the five facts that change the answer: platform (open source Kubernetes, EKS, GKE, AKS, OpenShift), Kubernetes or OpenShift version, Operator version (installed or target), Couchbase Server version, and whether this is evaluation or production. Ask only for the ones that are missing and that matter to the request.
2. Check the combination against the compatibility table before writing any commands. An unsupported pairing is the most common root cause of a failed install or a stuck upgrade.
3. Pick the install path (below) and stay on it. Mixing Helm-managed and kubectl-managed resources is a recurring source of drift.
4. State the versions you assumed at the top of anything you produce, and pin image tags. Never emit `latest`.
5. Generate fresh credentials or reference an existing Secret. The documentation samples use `Administrator` / `password`; do not copy them into a deliverable.

## Mental model

Three pieces, each with a different scope. Getting the scope wrong causes most install errors.

| Piece | Scope | Notes |
| --- | --- | --- |
| CRDs (`crd.yaml`) | Kubernetes cluster | Installed once. Deleting a CRD deletes every Couchbase cluster of that type. |
| Dynamic Admission Controller (DAC) | Kubernetes cluster, one instance | Validating webhook. Required. Backward compatible with older CRD versions, so run the newest one. Can be namespace-scoped for stricter security. |
| Operator | One per namespace | Manages the `CouchbaseCluster` resources in its own namespace. Per-namespace is recommended because it allows staged Operator upgrades. Cluster scope is possible with `--scope cluster`. |

The Operator is a reconciler: it compares each `CouchbaseCluster` and its related resources with reality and acts to close the gap. Pods are immutable, so any change that alters the pod spec (image, resources, TLS, volumes, scheduling) is executed as an upgrade, by default a swap rebalance.

Main resource kinds, all `apiVersion: couchbase.com/v2`: `CouchbaseCluster` (short name `cbc`), `CouchbaseBucket`, `CouchbaseEphemeralBucket`, `CouchbaseScope`, `CouchbaseCollection`, `CouchbaseUser`, `CouchbaseGroup`, `CouchbaseRoleBinding`, `CouchbaseReplication`, `CouchbaseBackup`, `CouchbaseBackupRestore`, `CouchbaseAutoscaler`, `CouchbaseEncryptionKey`.

Enterprise Edition only. The Operator and the Helm chart do not manage Community Edition.

For a laptop trial, any local Kubernetes works (kind, Minikube, K3s) with the `cao` install path below.

## Compatibility (Operator 2.9.x)

| Component | Supported |
| --- | --- |
| Couchbase Server EE | 7.2 to 8.0 |
| Open source Kubernetes | 1.31 to 1.36 |
| Red Hat OpenShift | 4.18 to 4.20 |
| Managed and other platforms | EKS, GKE, AKS, K3s, Bottlerocket OS, RKE |
| Backup image | `couchbase/operator-backup:1.6.0` (cbbackupmgr 8.0.2, Server 7.2+) |
| Fluent Bit image | 1.2.0 to 1.3.0 |
| Helm | 3.1+ |
| CPU architecture | amd64 or arm64, uniform across the cluster; mixed is unsupported |

Server 8.0 runs under Operator 2.8.1, but 8.0 features (encryption at rest, XDCR conflict logging, user enable/disable) need 2.9.x. For Server 8.0 vector workloads, schedule onto AVX2-capable nodes.

Storage: any CSI-compliant driver. Validate an unfamiliar platform or storage class with `cao certify` before committing to it.

Default resource footprint with auto resource allocation: 2 CPUs per pod, 512Mi per pod for each of Data, Index, Search and Eventing, 1Gi for Analytics, plus 25% overhead. An all-services dev pod is about 3.75Gi. Minikube needs `--cpus 2 --memory 8192` or more for the three-node example.

## Choosing an install path

| Situation | Path |
| --- | --- |
| Production, or anything that will be upgraded | `cao` CLI plus `kubectl`. Couchbase's own guidance is to manage the Operator directly for complex scenarios because it simplifies upgrades. |
| Quick evaluation, demo, or a team standardized on Helm | Helm chart `couchbase/couchbase-operator` |
| OpenShift | `cao` with Red Hat catalog images. OperatorHub is possible but does not deploy the DAC. |
| GitOps | `cao generate ...` to emit YAML, commit it, let the pipeline apply it |

## Install with cao (Kubernetes)

Download the Operator package for the platform and workstation OS from couchbase.com/downloads and unpack it. The directory contains `bin/cao`, `crd.yaml` and `couchbase-cluster.yaml`. Run as a cluster administrator; the install creates cluster-scoped resources.

```console
# 1. CRDs, once per Kubernetes cluster
kubectl apply --server-side -f crd.yaml

# 2. Admission controller, once per Kubernetes cluster
bin/cao create admission --namespace couchbase-system

# 3. Operator, in each namespace that will host Couchbase clusters
kubectl create namespace cb-prod
bin/cao create operator --namespace cb-prod

# 4. Verify: both deployments READY 1/1
kubectl get deployments -A | grep couchbase-operator
```

Use `--server-side` on the CRD apply. The `CouchbaseCluster` CRD exceeds the size limit for client-side apply as of 2.9 (K8S-4349), so plain `kubectl apply -f crd.yaml`, which the install page still shows, fails with an annotation-too-long error. If server-side apply reports ownership conflicts from an earlier client-side apply, add `--force-conflicts`.

Useful flags: `--image` and `--image-pull-secret` for private registries, `--log-level debug`, `--pod-creation-timeout 1h` on slow platforms, `--scope cluster` for a single cluster-wide Operator, `--validate-secrets=false` on the DAC when it must not read Secrets.

Uninstall is the reverse: `cao delete operator`, `cao delete admission`, and `kubectl delete -f crd.yaml` only for a complete removal, since that last step deletes all Couchbase clusters.

## Install on OpenShift

Same flow with `oc`, plus three differences:

1. Red Hat requires images from the Red Hat Container Catalog. Docker Hub images are unsupported on OpenShift. Create a pull secret and pass it to both components:

   ```console
   oc create secret docker-registry rh-catalog \
     --docker-server=registry.connect.redhat.com \
     --docker-username=<user> --docker-password=<password> --docker-email=<email>
   oc project <namespace>
   bin/cao create admission --image-pull-secret rh-catalog
   bin/cao create operator --image-pull-secret rh-catalog
   ```

2. Server images come from `registry.connect.redhat.com/couchbase/server` and carry a build suffix, for example `8.0.2-27`. Look up the exact tag in the catalog.
3. Ordinary users cannot manage Couchbase resources until granted the role: `oc create -f cluster-role-user.yaml`, then `oc create rolebinding <name> --namespace <ns> --user <user> --clusterrole couchbasecluster`.

If the Operator was installed from OperatorHub, run `cao create admission` afterwards to add the DAC.

OpenShift 4 limits a container to 1024 PIDs by default, which is too low under load. Raise `pids_limit` in both `KubeletConfig` and `ContainerRuntimeConfig`.

## Install with Helm

```console
helm repo add couchbase https://couchbase-partners.github.io/helm-charts/
helm repo update
helm install <release> --namespace <ns> --create-namespace \
  --version 2.94.0 --values values.yaml couchbase/couchbase-operator
```

Chart versions map to Operator versions by dropping the dot in the minor and patch: chart `2.94.0` is Operator 2.9.4, `2.93.0` is 2.9.3. Pin `--version`; otherwise Helm takes the newest chart.

By default the chart deploys the Operator, the DAC and a Couchbase cluster with a default bucket. Control this with the `install` block:

```yaml
install:
  couchbaseOperator: true
  admissionController: true   # false on every release after the first in a Kubernetes cluster
  couchbaseCluster: true
  syncGateway: false
```

Rules that prevent the usual Helm problems:

- One DAC per Kubernetes cluster and one Operator per namespace. A second default install in the same namespace breaks both.
- When CRDs and the DAC already exist (for example from Terraform or another namespace), install only the Operator where the CRs will live: `install.admissionController: false`, `install.couchbaseCluster: false`, `couchbaseOperator.scope: Role`. Keep the existing cluster-wide DAC.
- Helm values only override. To remove a chart default, set it to `null` explicitly, for example `cluster.buckets: null` or `cluster.servers.default: null`.
- Change Helm-managed resources with `helm upgrade`, never `kubectl edit`, or the release and the cluster diverge.
- Helm does not upgrade CRDs. Before a chart upgrade: `helm pull couchbase/couchbase-operator --version <new>`, untar, `kubectl apply --server-side -f couchbase-operator/crds/couchbase.crds.yaml`, then `helm upgrade --version <new>`.
- An Operator that was not installed with Helm cannot be adopted by Helm later.
- The DAC webhook certificate created by the chart expires after 365 days. Once expired, every Couchbase resource change is rejected. Fix by deleting the `<release>-couchbase-admission-controller` ValidatingWebhookConfiguration and Secret, then running `helm upgrade` with the same values and version.
- On OpenShift, override `couchbaseOperator.image`, `admissionController.image` and `cluster.image` to the Red Hat catalog repositories and set `imagePullSecrets`.

## Deploy a cluster

Minimal evaluation cluster. Apply with `kubectl apply -f`, then watch `kubectl get pods -w`; pods are named `<cluster>-0000`, `<cluster>-0001`, and so on.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cb-example-auth
type: Opaque
stringData:
  username: Administrator
  password: <generate>
---
apiVersion: couchbase.com/v2
kind: CouchbaseBucket
metadata:
  name: default
spec:
  memoryQuota: 128Mi
---
apiVersion: couchbase.com/v2
kind: CouchbaseCluster
metadata:
  name: cb-example
spec:
  image: couchbase/server:8.0.2
  security:
    adminSecret: cb-example-auth
  buckets:
    managed: true
  servers:
  - name: all_services
    size: 3
    services: [data, index, query, search]
```

Verify and connect:

```console
kubectl get cbc                                    # cluster resource and status
kubectl describe cbc cb-example                    # conditions and events
kubectl get pods -l couchbase_cluster=cb-example
kubectl port-forward cb-example-0000 8091          # UI at http://localhost:8091 (18091 for TLS)
```

### Production configuration

Start from the reference architecture page and adapt it. The settings that separate a production cluster from the example above:

| Setting | Why |
| --- | --- |
| `spec.antiAffinity: true` | One pod per Kubernetes node, so a node loss costs one Couchbase node. Also required for safe automated Kubernetes upgrades. |
| Dedicated nodes via `servers[].pod.spec.nodeSelector` and tolerations | Avoids noisy neighbors. Use a separate label per Couchbase cluster, since anti-affinity is scoped to one cluster. |
| One server class per service (MDS) | Independent scaling and smaller blast radius. |
| `volumeClaimTemplates` plus `servers[].volumeMounts.default` | Persistent volumes are mandatory for a supportable production cluster. |
| `spec.serverGroups` | Spread across availability zones. Keep equal pod counts per group and more groups than replicas. |
| `spec.autoResourceAllocation.enabled: true` or explicit `resources` | Guarantees memory and CPU for the configured service quotas. |
| `spec.networking.tls` with cert-manager | Encrypted traffic and policy-based rotation. |
| `spec.buckets.selector` and `spec.security.rbac.selector` | See the label warning below. |
| `spec.cluster.autoFailoverTimeout` and related | Tune per cluster instead of leaving the defaults. |
| `spec.cluster.autoCompaction` | Recommended in production. |
| `spec.mirWatchdog.enabled: true` | Surfaces states the Operator cannot fix on its own. |

Label warning: with `buckets.managed: true` or `security.rbac.managed: true` and no selector, a cluster adopts every bucket, user and group resource in its namespace. Two clusters in one namespace will then share and fight over them. Always label the resources and set `selector.matchLabels`.

Leave `spec.buckets.synchronize` off in production and do not load sample buckets. The DAC warns about non-production values but does not block them.

Node preparation is outside the Operator's control: NTP on every node, transparent huge pages set to `never` (a privileged DaemonSet is the usual method), and raised ulimits (`nofile` 40960, unlimited `core` and `memlock`) for heavy load.

### Buckets on Server 8.0

New buckets default to Magma with 128 vBuckets. Couchbase recommends 1024 vBuckets for high-throughput workloads. The DAC still assumes Couchstore as the default backend (K8S-4497), so set `storageBackend` explicitly on every bucket to avoid ambiguity. Do not change bucket settings, eviction policy or start a Server upgrade while a storage backend migration is running; several known issues leave the cluster unreconcilable.

### Persistent volumes

```yaml
spec:
  # Pod-level context. fsGroup belongs here (or under security.podSecurityContext
  # when the CRD version exposes it). Do NOT put fsGroup under
  # security.securityContext — that object is container SecurityContext and the
  # DAC / API reject unknown fields such as fsGroup.
  securityContext:
    fsGroup: 1000              # needed on non-OpenShift platforms so volumes are writable
    fsGroupChangePolicy: Always
    runAsUser: 1000
    runAsNonRoot: true
  volumeClaimTemplates:
  - metadata:
      name: couchbase
    spec:
      storageClassName: <fast-ssd-class>
      resources:
        requests:
          storage: 100Gi
  servers:
  - name: data
    size: 3
    services: [data]
    volumeMounts:
      default: couchbase
```

- `default` mount: required for Data, Index and Analytics, strongly advised for Search. Allows pod recovery with delta recovery instead of a full rebalance.
- `logs` mount: acceptable for Query-only or Eventing-only classes. Logs survive a crash; the pod is not recoverable.
- `default` and `logs` are mutually exclusive per class. If one class is supportable, all must be.
- Use a storage class with `volumeBindingMode: WaitForFirstConsumer` so volumes land in the same zone as their pods.
- Match the storage class to the node machine type. On GKE, `n4-*` nodes cannot attach `pd-ssd` (`premium-rwo`); use a Hyperdisk class such as `dynamic-rwo`. A wrong class shows up as `FailedAttachVolume` with a GCP `badRequest` about disk type, and the Operator may recreate the pod in a loop.
- Without a writable `fsGroup`, init fails with `Could not set the storage path. It must be a directory writable by 'couchbase' user` (and the same for analytics paths under `/mnt`).
- Resizing a template triggers a rolling upgrade. Set `spec.enableOnlineVolumeExpansion: true` to grow in place when the storage class supports expansion.
- Ephemeral clusters (no volumes) suit cache-only use. Set `spec.recoveryPolicy: PrioritizeUptime` so the Operator can force failover, and expect no logs after a crash.

### Networking and client connections

| Client location | Approach | Connection string |
| --- | --- | --- |
| Same Kubernetes cluster | Nothing extra; uses the `<cluster>-srv` headless service | `couchbases://<cluster>-srv.<namespace>?network=default` |
| Another Kubernetes cluster with routed pod networking | Forward the remote namespace DNS zone, usually with CoreDNS | Same, fully qualified: `...<namespace>.svc.cluster.local` |
| Outside Kubernetes or over the internet | Public networking: LoadBalancer services, External DNS, mandatory TLS | `couchbases://console.<dns-domain>?network=external` |
| NodePort | Last resort. No TLS, IP-based, HTTP bootstrap. | `http://<node-ip>:<nodeport>?network=external` |

Use `couchbase://` instead of `couchbases://` only when TLS is off. Always include the `network=` parameter with SDK 3.x and later; automatic network selection is inconsistent across clients.

Public networking needs `networking.exposeAdminConsole`, `exposedFeatures: [client]`, both service templates set to `LoadBalancer`, `networking.dns.domain`, and a server certificate whose SANs include `*.<dns-domain>`. Kubernetes Ingress is not supported for SDK traffic. An Ingress in front of the admin console works only with cookie-based session affinity.

Server certificate SANs for cluster `<c>` in namespace `<ns>`: `*.<c>`, `*.<c>.<ns>`, `*.<c>.<ns>.svc`, `*.<c>.<ns>.svc.cluster.local`, `<c>-srv`, `<c>-srv.<ns>`, `<c>-srv.<ns>.svc`, `*.<c>-srv.<ns>.svc.cluster.local`, `localhost`. A missing SAN is the usual cause of TLS failures after moving a manifest to a different namespace.

Service type pitfalls (easy to hit on demos that only need in-cluster access):

- `networking.adminConsoleServiceType` and `networking.exposedFeatureServiceType` accept only `NodePort` or `LoadBalancer`. `ClusterIP` is rejected by the CRD enum.
- Setting `exposedFeatures` while forcing `exposedFeatureServiceTemplate.spec.type: ClusterIP` still leaves `externalTrafficPolicy: Local` on the per-pod Service. Kubernetes then rejects the Service (`externalTrafficPolicy: Local` is only valid on externally accessible types) and reconciliation sticks on `ErrorEncountered`.
- For in-cluster-only demos, omit `exposedFeatures` entirely. Clients use `<cluster>-srv` for the SDK; Query / Search / Analytics HTTP APIs are reached via the headless Service named `<cluster>` (all management ports) or `<pod>.<cluster>.<ns>.svc`. The `<cluster>-srv` Service typically advertises only KV ports (`11210` / `11207`).
- Strategic merge patches and Helm upgrades do not remove list/map fields. To drop `exposedFeatures` or a service template from a live cluster, use a JSON patch with `op: remove`.

## Day-2 operations

### Change and scale

Edit the manifest and apply it, or `kubectl edit cbc <name>`. Scale by changing `servers[].size`. Never rename a server class in place: the name is how the Operator tracks pods, so a rename removes every pod in the class and creates new ones. Rename only when deliberately changing the services of a class, and change both in the same edit.

Pause reconciliation with `spec.paused: true` before any manual intervention on the cluster, and unpause afterwards.

### Upgrade Couchbase Server

Change `spec.image`. The default is a swap rebalance, one pod at a time. Control it under `spec.upgrade`; the older top-level `upgradeProcess`, `upgradeStrategy` and `rollingUpgrade` fields are deprecated in 2.9.

```yaml
spec:
  image: couchbase/server:8.0.2
  upgrade:
    upgradeProcess: SwapRebalance        # or InPlaceUpgrade
    upgradeStrategy: RollingUpgrade      # or ImmediateUpgrade
    rollingUpgrade:
      maxUpgradable: 1
    stabilizationPeriod: 5m              # pause between cycles to check health
    previousVersionPodCount: 0           # hold N pods on the old version
    upgradeOrderType: Services           # Nodes | ServerGroups | ServerClasses | Services
    upgradeOrder: [data, index, query]
```

- SwapRebalance needs spare capacity. With anti-affinity on, that means one extra Kubernetes node, or one per zone with server groups.
- InPlaceUpgrade reuses the pod name and volume. It runs one pod at a time, needs at least two Data nodes, and cannot be used on a single-node cluster.
- Rollback works only while some pods still run the old version: set `spec.image` back. After the last pod upgrades there is no rollback.
- While two versions coexist the cluster is in Mixed Mode. Sidecar changes and bucket backend migrations are disabled and several known issues apply, so keep this window short and do not create buckets or enable new-version features during it.
- Follow Couchbase Server's supported upgrade paths; the Operator does not add shortcuts.

### Upgrade the Operator

Upgrade the Operator before upgrading Couchbase Server. Read the release notes for the target version first.

1. Confirm no cluster is hibernated and no Server upgrade is in progress. Upgrading the Operator mid-upgrade makes it finish the Server upgrade immediately (K8S-4436).
2. With the old package: `cao delete operator`, `cao delete admission`. Use the uninstaller from the version that was installed. Running clusters keep serving; they are unmanaged for the duration.
3. With the new package: `kubectl apply --server-side -f crd.yaml`. Never delete CRDs.
4. Add any newly exposed fields to existing resources if they were set by hand in Couchbase, or the Operator will reset them to defaults.
5. With the new package: `cao create admission`, then `cao create operator` in each namespace.

Operator rollback is supported only between maintenance releases of the same minor (2.9.3 to 2.9.1, not 2.9 to 2.8). Procedure: hibernate the clusters (`spec.hibernate: true`, which takes them offline), change the Operator deployment image, then wake them.

### Upgrade Kubernetes underneath

The Operator creates a PodDisruptionBudget of N-1 per cluster and a readiness gate that clears only when the cluster is balanced, so automated node upgrades evict one Couchbase pod at a time provided anti-affinity is on. For manual drains, wait for `Balanced` to return to `True` before draining the next node. Keep spare node capacity for the replacement pod, and never upgrade Kubernetes while a cluster is hibernated.

### Backup and restore

```console
bin/cao create backup -n <namespace>     # ServiceAccount and Role for backup jobs
```

```yaml
# in the CouchbaseCluster
spec:
  backup:
    managed: true
    image: couchbase/operator-backup:1.6.0
---
apiVersion: couchbase.com/v2
kind: CouchbaseBackup
metadata:
  name: nightly
spec:
  strategy: full_incremental
  full:
    schedule: "0 3 * * 0"
  incremental:
    schedule: "0 3 * * 1-6"
  size: 100Gi
```

Strategies: `full_only`, `full_incremental`, periodic merge (new in 2.9), and `immediate_full` or `immediate_incremental` for one-off runs. The Operator creates CronJobs and a PVC named after the resource. Backups can also target S3, GCS, Azure or S3-compatible object stores. Set `fsGroup` on non-OpenShift platforms or jobs fail on volume permissions.

Restore with a `CouchbaseBackupRestore` naming the `backup`, optionally the `repo` (listed in the `CouchbaseBackup` status), and a `start`/`end` range. It runs once. To change it, delete and recreate it; edits are ignored after the Job exists.

For development clusters where buckets, scopes and collections are created by hand, `cao save` and `cao restore` capture and reapply the data topology as Kubernetes resources.

### Monitoring and logging

- Metrics: Server 7.0+ exposes a Prometheus endpoint on port 8091 of every pod with no cluster configuration. Create one Service selecting `couchbase_cluster=<name>` and a `ServiceMonitor` with the admin credentials. The Operator exposes its own metrics, including `cluster_manual_intervention`.
- Logs: enable `spec.logging.server` to add a Fluent Bit sidecar. It needs a persistent volume.
- Autoscaling: set `servers[].autoscaleEnabled: true` on a server class; the Operator creates a `CouchbaseAutoscaler` for a HorizontalPodAutoscaler to target.
- Hibernation: `spec.hibernate: true` deletes the pods and keeps the volumes. The spec cannot be changed while hibernated.

### Migrate an existing cluster into Kubernetes

Create a `CouchbaseCluster` that mirrors the source cluster's server classes and set `spec.migration.unmanagedClusterHost`. The Operator swap-rebalances each source node into a new pod. It requires node-to-pod network reachability in both directions. Tune with `stabilizationPeriod`, `numUnmanagedNodes` and `maxConcurrentMigrations`. Introduced as a preview in 2.8; confirm its support status for the target version.

## Troubleshooting

Work from the outside in:

```console
kubectl get deployments -n <ns>                         # operator and DAC ready?
kubectl describe cbc <name> -n <ns>                     # conditions and events
kubectl logs deployment/couchbase-operator -n <ns> --tail=200
kubectl get pods,pvc -n <ns> -l couchbase_cluster=<name>
kubectl describe pod <pod> -n <ns>                      # scheduling, image pull, volume errors
cao collect-logs --couchbase-cluster <name>             # support bundle; add --collectinfo for Server logs
```

Without `--collectinfo --collectinfo-collect=all` the bundle has no Couchbase Server logs. `cao collect-logs --log-level 0` redacts sensitive data and is the right default when the bundle leaves the organisation. Use the `cao` binary from the same release as the deployed Operator. `cbopinfo` is deprecated in favour of this command.

Cluster conditions to read first: `Available`, `Balanced`, `Rebalancing`, `Scaling`, `Upgrading`, `MixedMode`, `BucketMigrating`, `Hibernating`, `ClusterUnreconcilable`, `ManualInterventionRequired`.

| Symptom | Likely cause and fix |
| --- | --- |
| `kubectl apply -f crd.yaml` fails with "metadata.annotations: Too long" | CRD too large for client-side apply. Use `--server-side`. |
| Applying a manifest fails with a webhook connection or x509 error | DAC not running, missing, or its certificate expired. Check the `couchbase-operator-admission` deployment; reinstall the DAC or rotate the Helm webhook certificate. |
| Manifest rejected with a validation message | The DAC is doing its job. The message names the field. Common ones: missing Secret or storage class, immutable field changed, invalid service combination. |
| DAC rejects create: `secret … referenced by spec.security.adminSecret must exist` | Apply and sync the admin Secret first (External Secrets / Sealed Secrets / manual). Helm may create the `CouchbaseCluster` before the Secret if both are in the same release without a hook or pre-step. |
| Admin Secret rejected for password characters | Operator requires keys `username` and `password`. Password must be at least 6 characters and must not contain `()<>,;:\"/[]?={}`. Base64 padding `=` is in that set — strip it when generating random passwords. |
| `cbc` created, no pods appear | No Operator in that namespace, or Operator lacks RBAC. An Operator only watches its own namespace unless installed with `--scope cluster`. |
| Operator logs `cannot list resource couchbaseclusters … at the cluster scope` after setting `WATCH_NAMESPACE=""` | Empty watch needs ClusterRole bindings. A Role-scoped Helm install cannot be flipped to all-namespaces by env alone. Install a second Operator in the target namespace, or reinstall with `couchbaseOperator.scope: ClusterRole`. |
| Operator already runs in namespace A, cluster manifests are in namespace B | Expected no-op. Install another Operator release in B with `install.admissionController: false` and `install.couchbaseCluster: false`, or move the CRs. |
| Reconciliation fails: `persistent secret does not exist` on first create | Transient while the Operator creates the Secret named after the cluster. Re-check after the admin Secret exists and the Operator has secret `get/create/update` RBAC. Persistent failure usually means RBAC or a deleted cluster Secret mid-reconcile. |
| Pods `Pending` | Insufficient CPU or memory for the requests, anti-affinity with too few nodes, unsatisfied nodeSelector or taint, or a PVC that cannot bind. |
| `FailedAttachVolume` / GCP `pd-ssd … cannot be used by n4-…` | Storage class incompatible with the node disk family. Change `volumeClaimTemplates` to a Hyperdisk (or otherwise supported) class and recreate the PVCs; storage is immutable on existing claims. |
| `ImagePullBackOff` on OpenShift | Missing `rh-catalog` pull secret, or a Docker Hub image reference. |
| Pod starts, then Server fails writing to disk | Missing pod-level `fsGroup` (see Persistent volumes). Confirm `/mnt/*` is group-writable by uid 1000 inside the pod. |
| `Service "<pod>" is invalid: externalTrafficPolicy: Local` | `exposedFeatures` with a ClusterIP service template. Remove `exposedFeatures` (JSON patch) or use NodePort/LoadBalancer for exposed feature services. |
| Cluster stuck unbalanced, repeated rebalance failures | Check Server logs via the UI. With the MIR watchdog on, the cluster enters `ManualInterventionRequired` after three failed reconcile loops. Fix the cause, then the condition clears. |
| Operator logs authentication errors | Admin password changed in Couchbase without updating the Secret. Rotate through the Secret. A new password that violates the cluster password policy locks the Operator out (K8S-4499). |
| TLS errors after rotation or namespace change | SANs missing from the server certificate, or an expired chain with no valid alternative. |
| Buckets, users or XDCR settings revert | The resource is managed and the change was made in the UI. Change the Kubernetes resource instead, or turn management off for that type. |
| Unexpected buckets or users appear on a cluster | No label selector; the cluster adopted every resource in the namespace. |
| `CouchbaseGroup` rejected: `bucket for cluster role.<name> is a forbidden property` | Roles such as `analytics_reader` and `ro_admin` are cluster-scoped; omit `bucket` / scope / collection on those role entries. |
| A pod created with `cao create pod` disappears | The Operator must be paused first, or it treats the pod as foreign and removes it. |
| IPv6-only cluster pods fail to launch | Known issue K8S-4471. Patch the cluster Service to `PreferDualStack`. |
| Pod restarts or stays unready and Server logs show it cannot resolve its own hostname | Pod started before its DNS record existed. Check cluster DNS health, then raise `--pod-readiness-delay` on the Operator (default 10s). |
| Pods fail to join on a slow platform | Raise `--pod-creation-timeout` on the Operator. |
| Cluster will not accept spec changes | It is hibernated or paused. |
| Init Job / curl to Query works but Search REST against `<cluster>-srv:8094` fails | Use the headless Service named `<cluster>` (or the pod DNS name). `<cluster>-srv` is KV-oriented. |

When a symptom is not in the table, search the known issues in the release notes for the installed minor version before theorising. Each `K8S-nnnn` key there links to a public ticket at `jira.issues.couchbase.com/browse/K8S-nnnn`. If the problem persists and the user has a support agreement, the next step is a Couchbase Support ticket with a `cao collect-logs` bundle. Many reconcile failures in 2.9 are documented interactions between Mixed Mode, bucket backend migration and concurrent setting changes.

## Checking current facts

Every Operator documentation page is available as Markdown by replacing `.html` with `.md`:

- Index of all pages: `https://docs.couchbase.com/llms-kubernetes-operator.txt`
- Current release: `https://docs.couchbase.com/operator/current/<page>.md`
- A specific release: `https://docs.couchbase.com/operator/<major.minor>/<page>.md`

Pages worth fetching before answering:

| Need | Page |
| --- | --- |
| Supported versions | `prerequisite-and-setup` |
| Fixed and known issues | `release-notes`, `whats-new` |
| Install | `install-kubernetes`, `install-openshift`, `helm-setup-guide`, `helm-managing-guide` |
| Every `CouchbaseCluster` field | `resource/couchbasecluster` (large; search it, do not read it whole) |
| Production manifest | `reference-reference-architecture`, `best-practices` |
| Upgrades | `howto-operator-upgrade`, `concept-upgrade`, `howto-couchbase-upgrade`, `concept-kubernetes-upgrade` |
| Networking and clients | `concept-couchbase-networking`, `howto-client-sdks`, `howto-public-networking`, `tutorial-tls` |
| Storage | `concept-persistent-volumes`, `howto-persistent-volumes` |
| Backup | `howto-backup` |
| CLI flags | `tools/cao` |
| Conditions and events | `reference-couchbasecluster-conditions`, `reference-couchbasecluster-events` |
| Helm values | `helm-couchbase-config` (very large; search it) |

Helm chart versions: the `index.yaml` of the `couchbase-partners/helm-charts` repository lists each chart version with its `appVersion`.

Re-verify before stating as fact: the supported version ranges, the latest maintenance release, backup and Fluent Bit image tags, and whether a known issue is still open.
