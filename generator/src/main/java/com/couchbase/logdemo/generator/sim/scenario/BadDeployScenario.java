package com.couchbase.logdemo.generator.sim.scenario;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import java.util.random.RandomGenerator;

/** New orders version with NPE in ~15% of requests. */
public class BadDeployScenario implements Scenario {

  private static final String BAD_VERSION = "2.9.0-rc1";

  @Override
  public String name() {
    return "bad-deploy";
  }

  @Override
  public LogEvent apply(LogEvent event, RandomGenerator random) {
    if (!"orders".equals(event.service())) {
      return tag(event, event.version());
    }
    if (random.nextDouble() < 0.15) {
      return new LogEvent(
          event.eventId(),
          event.ts(),
          event.tsMs(),
          "ERROR",
          event.service(),
          BAD_VERSION,
          event.env(),
          event.host(),
          event.region(),
          event.logger(),
          event.thread(),
          "Unhandled exception processing order",
          event.traceId(),
          event.spanId(),
          event.httpMethod(),
          event.httpPath(),
          500,
          event.durationMs(),
          event.userId(),
          event.clientIp(),
          "NullPointerException",
          "java.lang.NullPointerException: Cannot invoke Order.getId()\n\tat orders.OrderService.process(OrderService.java:142)",
          name());
    }
    return tag(event, BAD_VERSION);
  }

  private LogEvent tag(LogEvent e, String version) {
    return new LogEvent(
        e.eventId(),
        e.ts(),
        e.tsMs(),
        e.level(),
        e.service(),
        version,
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
