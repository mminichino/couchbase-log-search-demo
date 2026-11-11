# Couchbase log analytics demo
# Releases install into namespace logdemo unless NAMESPACE is overridden.
# Optional local overrides: copy .env.example → .env (gitignored).

-include .env
export

NAMESPACE      ?= logdemo
# Local path to the existing GKE Terraform config (required for make cluster / destroy).
TF_DIR         ?=
PROJECT        ?= $(shell gcloud config get-value project 2>/dev/null)
REGION         ?= us-central1
# Your GKE cluster name (required for make cluster).
CLUSTER_NAME   ?=
REGISTRY       ?= $(REGION)-docker.pkg.dev/$(PROJECT)/logdemo
# Public Ingress hostnames (optional; also settable in charts/20-apps/values.yaml).
DISCOVER_HOST      ?=
GRAFANA_HOST       ?=
COUCHBASE_UI_HOST  ?=




CHARTS         := charts/00-operators charts/10-platform charts/20-apps
HELM_TIMEOUT   ?= 15m

.PHONY: help cluster images up down destroy status ui url scenario lint test

help:
	@echo "Targets: cluster images up down destroy status ui url scenario lint test"
	@echo "  TF_DIR=$(TF_DIR)"
	@echo "  NAMESPACE=$(NAMESPACE)"
	@echo "  REGISTRY=$(REGISTRY)"

# --- Phase 2+ infrastructure -------------------------------------------------

# Set SKIP_TF=1 when the GKE cluster already exists (common for this demo).
SKIP_TF ?= 0

cluster:
	@test -d "$(TF_DIR)" || (echo "TF_DIR not found: $(TF_DIR)"; exit 1)
ifeq ($(SKIP_TF),0)
	cd "$(TF_DIR)" && terraform apply -auto-approve
else
	@echo "SKIP_TF=1: leaving Terraform state untouched"
endif
	gcloud container clusters get-credentials "$(CLUSTER_NAME)" --region "$(REGION)" --project "$(PROJECT)"
	./infra/gke/create-registry.sh
	./infra/gke/create-ingress-ip.sh
	./infra/gke/create-secrets.sh
	./infra/gke/setup-iam.sh

# Always target linux/amd64 — Apple Silicon defaults to arm64 and GKE nodes reject it.
PLATFORM ?= linux/amd64

# Prefer Homebrew OpenJDK 21 when present (Apple Silicon / GKE images are amd64).
JAVA_HOME_21 ?= /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home

images:
	docker buildx build --platform "$(PLATFORM)" \
		-t "$(REGISTRY)/kafka-connect-couchbase:4.3.7" \
		-f images/kafka-connect-couchbase/Dockerfile images/kafka-connect-couchbase --push
	@if [ -d "$(JAVA_HOME_21)" ]; then export JAVA_HOME="$(JAVA_HOME_21)"; export PATH="$$JAVA_HOME/bin:$$PATH"; fi; \
	mvn -f generator/pom.xml -q compile jib:build \
		-Djib.to.image="$(REGISTRY)/generator:0.1.0" \
		-Djib.from.platforms=linux/amd64
	docker buildx build --platform "$(PLATFORM)" \
		-t "$(REGISTRY)/discover:0.1.0" \
		-f discover/Dockerfile discover --push
	docker buildx build --platform "$(PLATFORM)" \
		-t "$(REGISTRY)/grafana-couchbase:12.4.15-cb1.2.1" \
		-f images/grafana-couchbase/Dockerfile images/grafana-couchbase --push

# --- Helm stack --------------------------------------------------------------

up: lint
	kubectl get ns "$(NAMESPACE)" >/dev/null 2>&1 || kubectl create ns "$(NAMESPACE)"
	helm upgrade --install logdemo-operators charts/00-operators \
		--namespace "$(NAMESPACE)" --create-namespace --wait --timeout "$(HELM_TIMEOUT)"
	helm upgrade --install logdemo-platform charts/10-platform \
		--namespace "$(NAMESPACE)" --wait --timeout "$(HELM_TIMEOUT)"
	helm upgrade --install logdemo-apps charts/20-apps \
		--namespace "$(NAMESPACE)" --wait --timeout "$(HELM_TIMEOUT)" \
		$(if $(DISCOVER_HOST),--set discover.host=$(DISCOVER_HOST),) \
		$(if $(GRAFANA_HOST),--set grafana.host=$(GRAFANA_HOST),) \
		$(if $(COUCHBASE_UI_HOST),--set couchbaseUi.host=$(COUCHBASE_UI_HOST),)

down:
	-helm uninstall logdemo-apps --namespace "$(NAMESPACE)"
	-helm uninstall logdemo-platform --namespace "$(NAMESPACE)"
	-helm uninstall logdemo-operators --namespace "$(NAMESPACE)"

destroy: down
	@echo "Waiting for Ingress load balancer and PVCs to clear..."
	-kubectl -n "$(NAMESPACE)" wait --for=delete ingress --all --timeout=10m 2>/dev/null || true
	-kubectl -n "$(NAMESPACE)" delete pvc --all --wait=true 2>/dev/null || true
	./infra/gke/create-ingress-ip.sh --release || true
	@test -d "$(TF_DIR)" || (echo "TF_DIR not found: $(TF_DIR)"; exit 1)
	cd "$(TF_DIR)" && terraform destroy -auto-approve

status:
	@echo "== Nodes =="
	kubectl get nodes -o wide
	@echo "== Namespace $(NAMESPACE) =="
	-kubectl -n "$(NAMESPACE)" get pods,svc,ingress,kafka,kafkanodepool,kafkaconnect,kafkaconnector,couchbasecluster 2>/dev/null
	@echo "== Helm releases =="
	-helm list -n "$(NAMESPACE)"

ui:
	@echo "Port-forwarding generator :8080 (Ctrl-C to stop)"
	@echo "Discover, Grafana, and Couchbase UI are public HTTPS when hosts are set — use: make url"
	@echo "(Couchbase UI port-forward still available: kubectl -n $(NAMESPACE) port-forward svc/cb-logdemo-ui 8091:8091)"
	kubectl -n "$(NAMESPACE)" port-forward svc/generator 8080:8080

url:
	@HAP=$$(kubectl -n haproxy-ingress get svc -o jsonpath='{.items[0].status.loadBalancer.ingress[0].ip}' 2>/dev/null || true); \
	echo "== HAProxy LoadBalancer =="; \
	echo "IP: $${HAP:-pending}  (point Discover + Grafana + Couchbase UI DNS A records here)"; \
	echo "== Discover =="; \
	HOST=$$(kubectl -n "$(NAMESPACE)" get ingress discover -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || true); \
	CLASS=$$(kubectl -n "$(NAMESPACE)" get ingress discover -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true); \
	CERT=$$(kubectl -n "$(NAMESPACE)" get certificate discover-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true); \
	echo "host: $${HOST:-unset}"; \
	echo "ingressClassName: $${CLASS:-unset}"; \
	echo "Certificate Ready: $${CERT:-n/a}"; \
	if [ -n "$$HOST" ]; then echo "URL: https://$$HOST/login"; fi; \
	echo "== Grafana =="; \
	GHOST=$$(kubectl -n "$(NAMESPACE)" get ingress grafana -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || true); \
	GCLASS=$$(kubectl -n "$(NAMESPACE)" get ingress grafana -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true); \
	GCERT=$$(kubectl -n "$(NAMESPACE)" get certificate grafana-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true); \
	echo "host: $${GHOST:-unset}"; \
	echo "ingressClassName: $${GCLASS:-unset}"; \
	echo "Certificate Ready: $${GCERT:-n/a}"; \
	if [ -n "$$GHOST" ]; then echo "URL: https://$$GHOST"; fi; \
	echo "== Couchbase UI =="; \
	CHOST=$$(kubectl -n "$(NAMESPACE)" get ingress couchbase-ui -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || true); \
	CCLASS=$$(kubectl -n "$(NAMESPACE)" get ingress couchbase-ui -o jsonpath='{.spec.ingressClassName}' 2>/dev/null || true); \
	CCERT=$$(kubectl -n "$(NAMESPACE)" get certificate couchbase-ui-tls -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true); \
	echo "host: $${CHOST:-unset}"; \
	echo "ingressClassName: $${CCLASS:-unset}"; \
	echo "Certificate Ready: $${CCERT:-n/a}"; \
	if [ -n "$$CHOST" ]; then echo "URL: https://$$CHOST"; fi

scenario:
	@test -n "$(name)" || (echo "usage: make scenario name=<scenario>"; exit 1)
	kubectl -n "$(NAMESPACE)" exec deploy/generator -- \
		curl -sf -X POST "http://localhost:8080/scenarios/$(name)/start?durationMinutes=10"

# --- Quality gates -----------------------------------------------------------

lint:
	@for c in $(CHARTS); do echo "helm lint $$c"; helm lint $$c; done

test:
	@if [ -d "$(JAVA_HOME_21)" ]; then export JAVA_HOME="$(JAVA_HOME_21)"; export PATH="$$JAVA_HOME/bin:$$PATH"; fi; \
	mvn -f generator/pom.xml test
	@echo "Discover tests: phase 10"
