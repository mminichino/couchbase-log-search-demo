package com.couchbase.logdemo.generator.sim.scenario;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;
import java.util.random.RandomGenerator;

/** Catalog p95 latency triples over ~10 minutes from scenario start. */
public class LatencyCreepScenario implements Scenario {

  private final AtomicReference<Instant> startedAt = new AtomicReference<>();

  @Override
  public String name() {
    return "latency-creep";
  }

  public void onStart(Instant now) {
    startedAt.set(now);
  }

  public void onStop() {
    startedAt.set(null);
  }

  @Override
  public LogEvent apply(LogEvent event, RandomGenerator random) {
    Instant start = startedAt.get();
    if (start == null || !"catalog".equals(event.service()) || event.durationMs() == null) {
      return tag(event);
    }
    double elapsedMin = Math.max(0, (event.tsMs() - start.toEpochMilli()) / 60_000.0);
    double factor = 1.0 + Math.min(2.0, (elapsedMin / 10.0) * 2.0); // 1x → 3x over 10 min
    int duration = (int) Math.round(event.durationMs() * factor);
    String level = duration > 800 ? "WARN" : event.level();
    String message =
        duration > 800
            ? "Slow catalog response duration_ms=" + duration
            : event.message();
    return new LogEvent(
        event.eventId(),
        event.ts(),
        event.tsMs(),
        level,
        event.service(),
        event.version(),
        event.env(),
        event.host(),
        event.region(),
        event.logger(),
        event.thread(),
        message,
        event.traceId(),
        event.spanId(),
        event.httpMethod(),
        event.httpPath(),
        event.httpStatus(),
        duration,
        event.userId(),
        event.clientIp(),
        event.exceptionClass(),
        event.stackTrace(),
        name());
  }

  private LogEvent tag(LogEvent e) {
    return new LogEvent(
        e.eventId(),
        e.ts(),
        e.tsMs(),
        e.level(),
        e.service(),
        e.version(),
        e.env(),
        e.host(),
        e.region(),
        e.logger(),
        e.thread(),
        e.message(),
        e.traceId(),
        e.spanId(),
        e.httpMethod(),
        e.httpPath(),
        e.httpStatus(),
        e.durationMs(),
        e.userId(),
        e.clientIp(),
        e.exceptionClass(),
        e.stackTrace(),
        name());
  }
}
