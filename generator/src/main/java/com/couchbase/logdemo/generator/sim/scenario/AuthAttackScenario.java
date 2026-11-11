package com.couchbase.logdemo.generator.sim.scenario;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import java.util.List;
import java.util.random.RandomGenerator;

/** Burst of failed logins from a few IPs in one region. */
public class AuthAttackScenario implements Scenario {

  private static final String ATTACK_REGION = "us-east-1";
  private static final List<String> ATTACK_IPS =
      List.of("203.0.113.10", "203.0.113.11", "203.0.113.12");

  @Override
  public String name() {
    return "auth-attack";
  }

  @Override
  public LogEvent apply(LogEvent event, RandomGenerator random) {
    boolean authLogin =
        "auth".equals(event.service())
            && event.httpPath() != null
            && event.httpPath().contains("/login");
    boolean gatewayLogin =
        "api-gateway".equals(event.service())
            && event.httpPath() != null
            && event.httpPath().contains("/login");

    if ((authLogin || gatewayLogin) && random.nextDouble() < 0.85) {
      String ip = ATTACK_IPS.get(random.nextInt(ATTACK_IPS.size()));
      return new LogEvent(
          event.eventId(),
          event.ts(),
          event.tsMs(),
          "WARN",
          event.service(),
          event.version(),
          event.env(),
          event.host(),
          ATTACK_REGION,
          event.logger(),
          event.thread(),
          "Failed login attempt",
          event.traceId(),
          event.spanId(),
          event.httpMethod(),
          event.httpPath(),
          401,
          event.durationMs(),
          null,
          ip,
          null,
          null,
          name());
    }
    return new LogEvent(
        event.eventId(),
        event.ts(),
        event.tsMs(),
        event.level(),
        event.service(),
        event.version(),
        event.env(),
        event.host(),
        event.region(),
        event.logger(),
        event.thread(),
        event.message(),
        event.traceId(),
        event.spanId(),
        event.httpMethod(),
        event.httpPath(),
        event.httpStatus(),
        event.durationMs(),
        event.userId(),
        event.clientIp(),
        event.exceptionClass(),
        event.stackTrace(),
        name());
  }
}
