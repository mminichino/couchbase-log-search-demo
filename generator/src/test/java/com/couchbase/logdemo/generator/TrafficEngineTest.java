package com.couchbase.logdemo.generator;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.couchbase.logdemo.generator.sim.clock.SimClock;
import com.couchbase.logdemo.generator.sim.engine.TrafficEngine;
import com.couchbase.logdemo.generator.sim.model.LogEvent;
import com.couchbase.logdemo.generator.sim.model.Topology;
import com.couchbase.logdemo.generator.sim.model.TopologyLoader;
import com.couchbase.logdemo.generator.sim.scenario.ScenarioManager;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.InputStream;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class TrafficEngineTest {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private Topology topology;
  private JsonSchema schema;

  @BeforeEach
  void setUp() throws Exception {
    topology = TopologyLoader.load("classpath:topology.yaml");
    try (InputStream in =
        getClass().getResourceAsStream("/schema/log-event.schema.json")) {
      schema =
          JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(in);
    }
  }

  private TrafficEngine engine(long seed) {
    SimClock clock = new SimClock();
    clock.startBackfill(Instant.parse("2026-11-08T00:00:00Z"));
    ScenarioManager scenarios = new ScenarioManager(new SimpleMeterRegistry());
    TrafficEngine engine = new TrafficEngine(topology, clock, scenarios, "demo", seed);
    engine.setDeterministicIds(true);
    return engine;
  }

  @Test
  void sameSeedProducesIdenticalFirst1000Events() {
    List<LogEvent> a = engine(42).generateEvents(1000);
    List<LogEvent> b = engine(42).generateEvents(1000);
    assertEquals(1000, a.size());
    assertEquals(1000, b.size());
    for (int i = 0; i < 1000; i++) {
      LogEvent x = a.get(i);
      LogEvent y = b.get(i);
      assertEquals(x.eventId(), y.eventId(), "event_id at " + i);
      assertEquals(x.ts(), y.ts(), "ts at " + i);
      assertEquals(x.tsMs(), y.tsMs(), "ts_ms at " + i);
      assertEquals(x.level(), y.level(), "level at " + i);
      assertEquals(x.service(), y.service(), "service at " + i);
      assertEquals(x.traceId(), y.traceId(), "trace_id at " + i);
      assertEquals(x.httpMethod(), y.httpMethod(), "http_method at " + i);
      assertEquals(x.httpPath(), y.httpPath(), "http_path at " + i);
      assertEquals(x.httpStatus(), y.httpStatus(), "http_status at " + i);
      assertEquals(x.message(), y.message(), "message at " + i);
    }
  }

  @Test
  void everyEventValidatesAgainstSchema() throws Exception {
    List<LogEvent> events = engine(42).generateEvents(500);
    for (LogEvent event : events) {
      JsonNode node = MAPPER.valueToTree(event);
      Set<ValidationMessage> errors = schema.validate(node);
      assertTrue(errors.isEmpty(), () -> event.eventId() + " -> " + errors);
    }
  }

  @Test
  void levelMixWithinTwoPointsOfTarget() {
    List<LogEvent> events = engine(42).generateEvents(100_000);
    Map<String, Long> counts = new HashMap<>();
    for (LogEvent e : events) {
      counts.merge(e.level(), 1L, Long::sum);
    }
    double n = events.size();
    double info = 100.0 * counts.getOrDefault("INFO", 0L) / n;
    double warn = 100.0 * counts.getOrDefault("WARN", 0L) / n;
    double error = 100.0 * counts.getOrDefault("ERROR", 0L) / n;
    double debug = 100.0 * counts.getOrDefault("DEBUG", 0L) / n;

    assertEquals(88.0, info, 2.0, "INFO%=" + info + " counts=" + counts);
    assertEquals(8.0, warn, 2.0, "WARN%=" + warn + " counts=" + counts);
    assertEquals(3.0, error, 2.0, "ERROR%=" + error + " counts=" + counts);
    assertEquals(1.0, debug, 2.0, "DEBUG%=" + debug + " counts=" + counts);
  }

  @Test
  void paymentOutageRaisesPaymentsErrorShareAbove50Percent() {
    SimClock clock = new SimClock();
    clock.startBackfill(Instant.parse("2026-11-08T00:00:00Z"));
    ScenarioManager scenarios = new ScenarioManager(new SimpleMeterRegistry());
    scenarios.start("payment-outage", 60, clock.instant());
    TrafficEngine engine = new TrafficEngine(topology, clock, scenarios, "demo", 99);
    engine.setDeterministicIds(true);

    List<LogEvent> payments =
        engine.generateEvents(20_000).stream()
            .filter(e -> "payments".equals(e.service()))
            .collect(Collectors.toList());
    assertTrue(payments.size() > 100, "expected payments events, got " + payments.size());

    long errors =
        payments.stream().filter(e -> "ERROR".equals(e.level()) || (e.httpStatus() != null && e.httpStatus() >= 500)).count();
    double share = 100.0 * errors / payments.size();
    assertTrue(share > 50.0, "payments error share=" + share + "% size=" + payments.size());
  }
}
