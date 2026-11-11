package com.couchbase.logdemo.generator.sim.scenario;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import java.util.random.RandomGenerator;

/** Payments returns 503 for ~60% of calls; orders logs retries/failures. */
public class PaymentOutageScenario implements Scenario {

  @Override
  public String name() {
    return "payment-outage";
  }

  @Override
  public LogEvent apply(LogEvent event, RandomGenerator random) {
    if ("payments".equals(event.service()) && random.nextDouble() < 0.60) {
      return withError(
          event,
          503,
          "ERROR",
          "Payment service unavailable",
          "ServiceUnavailableException",
          "com.couchbase.payments.ServiceUnavailableException: upstream timeout\n\tat payments.ChargeHandler.handle");
    }
    if ("orders".equals(event.service())
        && event.httpPath() != null
        && (event.httpPath().contains("/orders") || event.httpPath().contains("retry"))
        && random.nextDouble() < 0.35) {
      boolean retry = random.nextBoolean();
      return withError(
          event,
          retry ? 502 : 500,
          retry ? "WARN" : "ERROR",
          retry ? "Retrying payment after upstream failure" : "Order failed after payment retries exhausted",
          retry ? null : "PaymentFailedException",
          retry ? null : "com.couchbase.orders.PaymentFailedException: charge declined\n\tat orders.CheckoutService.charge");
    }
    return withScenario(event);
  }

  private LogEvent withError(
      LogEvent e,
      int status,
      String level,
      String message,
      String exceptionClass,
      String stackTrace) {
    return new LogEvent(
        e.eventId(),
        e.ts(),
        e.tsMs(),
        level,
        e.service(),
        e.version(),
        e.env(),
        e.host(),
        e.region(),
        e.logger(),
        e.thread(),
        message,
        e.traceId(),
        e.spanId(),
        e.httpMethod(),
        e.httpPath(),
        status,
        e.durationMs(),
        e.userId(),
        e.clientIp(),
        exceptionClass,
        stackTrace,
        name());
  }

  private LogEvent withScenario(LogEvent e) {
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
