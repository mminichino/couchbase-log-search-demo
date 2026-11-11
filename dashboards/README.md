# Grafana dashboards

JSON dashboards provisioned into Grafana (folder **Logdemo**) via the `grafana-dashboards` ConfigMap in `charts/20-apps`.

| File | Dashboard |
| --- | --- |
| `executive-overview.json` | Events/hour by level, error rate, errors by service, slow-share |
| `service-health.json` | 4xx/5xx by service, slowest endpoints, region/version |
| `incident-review.json` | Exceptions, versions, top IPs, latest errors |

Source of truth for demos and docs. Keep `charts/20-apps/dashboards/` in sync (Helm packages only files under the chart). After editing, copy into the chart path and `helm upgrade logdemo-apps`.
