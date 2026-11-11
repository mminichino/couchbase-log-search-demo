FROM quay.io/strimzi/kafka:1.3.1-kafka-4.3.2

USER root
ENV CONNECTOR_VERSION=4.3.7
RUN mkdir -p /opt/kafka/plugins/couchbase \
 && curl -fsSL \
      "https://packages.couchbase.com/clients/kafka/${CONNECTOR_VERSION}/couchbase-kafka-connect-couchbase-${CONNECTOR_VERSION}.zip" \
      -o /tmp/cb-connect.zip \
 && unzip -q /tmp/cb-connect.zip -d /tmp/cb-connect \
 && PLUGIN_DIR=$(find /tmp/cb-connect -type d -name lib | head -1) \
 && cp -a "${PLUGIN_DIR}/." /opt/kafka/plugins/couchbase/ \
 && rm -rf /tmp/cb-connect /tmp/cb-connect.zip \
 && chown -R 1001:0 /opt/kafka/plugins/couchbase

USER 1001
