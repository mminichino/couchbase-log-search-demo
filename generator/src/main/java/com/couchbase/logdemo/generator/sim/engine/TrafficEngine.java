package com.couchbase.logdemo.generator.sim.engine;

import com.couchbase.logdemo.generator.sim.clock.SimClock;
import com.couchbase.logdemo.generator.sim.model.LogEvent;
import com.couchbase.logdemo.generator.sim.model.Topology;
import com.couchbase.logdemo.generator.sim.model.Topology.FlowDef;
import com.couchbase.logdemo.generator.sim.model.Topology.HopDef;
import com.couchbase.logdemo.generator.sim.model.Topology.ServiceDef;
import com.couchbase.logdemo.generator.sim.scenario.ScenarioManager;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import java.util.random.RandomGenerator;
import net.datafaker.Faker;

/**
 * Generates correlated multi-hop request traces with Poisson arrivals and a daily traffic curve.
 */
public class TrafficEngine {

  private static final DateTimeFormatter TS_FMT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  /** Target mix: ~88% INFO, 8% WARN, 3% ERROR, 1% DEBUG. */
  private static final double P_DEBUG = 0.01;

  private static final double P_ERROR = 0.03;
  private static final double P_WARN = 0.08;

  private final Topology topology;
  private final SimClock clock;
  private final ScenarioManager scenarios;
  private final String env;
  private final long seed;
  private final RandomGenerator random;
  private final Faker faker;
  private final AtomicLong sequence = new AtomicLong(0);
  private final int totalFlowWeight;
  private volatile boolean deterministicIds = true;

  public TrafficEngine(
      Topology topology, SimClock clock, ScenarioManager scenarios, String env, long seed) {
    this.topology = topology;
    this.clock = clock;
    this.scenarios = scenarios;
    this.env = env;
    this.seed = seed;
    // java.util.Random is available on JRE images (LXM algorithms may not be).
    this.random = new Random(seed);
    this.faker = new Faker(new Random(seed ^ 0x5DEECE66DL));
    this.totalFlowWeight = topology.getFlows().stream().mapToInt(FlowDef::getWeight).sum();
  }

  public void setDeterministicIds(boolean deterministicIds) {
    this.deterministicIds = deterministicIds;
  }

  public boolean isDeterministicIds() {
    return deterministicIds;
  }

  public long sequence() {
    return sequence.get();
  }

  public SimClock clock() {
    return clock;
  }

  public RandomGenerator random() {
    return random;
  }

  /**
   * Sample next inter-arrival delay in simulated milliseconds for a target average EPS, scaled by
   * the daily curve at {@code at}.
   */
  public long nextInterArrivalMillis(double avgEps, Instant at) {
    double lambda = Math.max(0.01, avgEps * dailyMultiplier(at));
    double u = Math.max(1e-12, random.nextDouble());
    double seconds = -Math.log(u) / lambda;
    return Math.max(1L, Math.round(seconds * 1000.0));
  }

  /** Daily curve: trough overnight, peak mid-afternoon UTC. Range ~0.35–1.65. */
  public static double dailyMultiplier(Instant at) {
    double hour = at.atZone(ZoneOffset.UTC).getHour() + at.atZone(ZoneOffset.UTC).getMinute() / 60.0;
    return 1.0 + 0.65 * Math.sin((hour - 8.0) / 24.0 * 2.0 * Math.PI);
  }

  /** Generate one user-request worth of hop events (same trace_id). */
  public List<LogEvent> nextRequest() {
    Instant base = clock.instant();
    FlowDef flow = pickFlow();
    String traceId = nextId("trace");
    String userId = "user-" + (Math.floorMod(random.nextInt(), 10_000));
    String clientIp = faker.internet().ipV4Address();
    String region = topology.getRegions().get(random.nextInt(topology.getRegions().size()));
    String itemId = String.valueOf(1000 + random.nextInt(9000));

    List<LogEvent> events = new ArrayList<>(flow.getHops().size());
    long offsetMs = 0;
    for (HopDef hop : flow.getHops()) {
      Instant ts = base.plusMillis(offsetMs);
      clock.advanceTo(ts);
      LogEvent event = buildHopEvent(flow, hop, ts, traceId, userId, clientIp, region, itemId);
      event = scenarios.applyActive(event, ts, random);
      events.add(event);
      offsetMs += 5 + random.nextInt(40);
    }
    return events;
  }

  /** Generate {@code count} events by walking requests until enough hop logs are collected. */
  public List<LogEvent> generateEvents(int count) {
    List<LogEvent> out = new ArrayList<>(count);
    while (out.size() < count) {
      List<LogEvent> batch = nextRequest();
      for (LogEvent e : batch) {
        out.add(e);
        if (out.size() >= count) {
          break;
        }
      }
      long gap = nextInterArrivalMillis(5.0, clock.instant());
      clock.advanceByMillis(gap);
    }
    return out;
  }

  private LogEvent buildHopEvent(
      FlowDef flow,
      HopDef hop,
      Instant ts,
      String traceId,
      String userId,
      String clientIp,
      String region,
      String itemId) {
    ServiceDef service = topology.service(hop.getService());
    String host = service.getHosts().get(random.nextInt(service.getHosts().size()));
    String version = topology.getVersions().getOrDefault(service.getName(), "1.0.0");
    String path = hop.getPath().replace("{id}", itemId);
    String level = pickLevel();
    int status = statusForLevel(level);
    int duration = 5 + random.nextInt(120);
    if ("WARN".equals(level)) {
      duration += 100 + random.nextInt(200);
    }
    if ("ERROR".equals(level)) {
      duration += 50 + random.nextInt(150);
    }

    String eventId = nextEventId();
    String spanId = nextId("span");
    String logger = "synthetic." + service.getName() + ".http";
    String thread = "http-" + (1 + random.nextInt(32));
    String message =
        hop.getMethod()
            + " "
            + path
            + " -> "
            + status
            + " ("
            + duration
            + "ms) flow="
            + flow.getName();

    String exceptionClass = null;
    String stackTrace = null;
    if ("ERROR".equals(level)) {
      exceptionClass = "RuntimeException";
      stackTrace =
          "java.lang.RuntimeException: transient failure\n\tat "
              + service.getName()
              + ".Handler.handle(Handler.java:88)";
      message = "Request failed: " + hop.getMethod() + " " + path;
    }

    return new LogEvent(
        eventId,
        TS_FMT.format(ts),
        ts.toEpochMilli(),
        level,
        service.getName(),
        version,
        env,
        host,
        region,
        logger,
        thread,
        message,
        traceId,
        spanId,
        hop.getMethod(),
        path,
        status,
        duration,
        userId,
        clientIp,
        exceptionClass,
        stackTrace,
        null);
  }

  private String pickLevel() {
    double u = random.nextDouble();
    if (u < P_DEBUG) {
      return "DEBUG";
    }
    if (u < P_DEBUG + P_ERROR) {
      return "ERROR";
    }
    if (u < P_DEBUG + P_ERROR + P_WARN) {
      return "WARN";
    }
    return "INFO";
  }

  private int statusForLevel(String level) {
    return switch (level) {
      case "ERROR" -> random.nextBoolean() ? 500 : 502;
      case "WARN" -> random.nextBoolean() ? 429 : 404;
      default -> 200;
    };
  }

  private FlowDef pickFlow() {
    int ticket = random.nextInt(totalFlowWeight);
    int acc = 0;
    for (FlowDef flow : topology.getFlows()) {
      acc += flow.getWeight();
      if (ticket < acc) {
        return flow;
      }
    }
    return topology.getFlows().getLast();
  }

  private String nextEventId() {
    long seq = sequence.getAndIncrement();
    if (deterministicIds) {
      return UUID.nameUUIDFromBytes((seed + ":" + seq).getBytes(StandardCharsets.UTF_8)).toString();
    }
    return UUID.randomUUID().toString();
  }

  private String nextId(String prefix) {
    long seq = sequence.get();
    if (deterministicIds) {
      return UUID.nameUUIDFromBytes((seed + ":" + prefix + ":" + seq + ":" + random.nextLong())
              .getBytes(StandardCharsets.UTF_8))
          .toString()
          .replace("-", "")
          .substring(0, 16);
    }
    return UUID.randomUUID().toString().replace("-", "").substring(0, 16);
  }
}
