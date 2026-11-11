# Grafana OSS with the unsigned Couchbase data source plugin baked in.
# Plugin ZIP from Couchbase's Grafana plugin repo (dist/ at archive root).
ARG GRAFANA_VERSION=12.4.15
ARG PLUGIN_VERSION=1.2.1

FROM grafana/grafana:${GRAFANA_VERSION}

ARG PLUGIN_VERSION
USER root
RUN mkdir -p /var/lib/grafana/plugins/couchbase-datasource \
 && curl -fsSL \
      "https://gfp.prod.cbdevx.com/plugins/couchbase-datasource/versions/${PLUGIN_VERSION}/download" \
      -o /tmp/couchbase-datasource.zip \
 && unzip -q /tmp/couchbase-datasource.zip -d /var/lib/grafana/plugins/couchbase-datasource \
 && rm -f /tmp/couchbase-datasource.zip \
 && chown -R grafana:root /var/lib/grafana/plugins/couchbase-datasource
USER grafana

ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=couchbase-datasource \
    GF_PATHS_PLUGINS=/var/lib/grafana/plugins
