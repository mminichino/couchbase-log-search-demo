package com.couchbase.logdemo.generator.emit;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

/**
 * Emits structured synthetic events via SLF4J loggers under {@code synthetic.*}. Rate-limits sends
 * and tracks drops (rate limit + TCP ring-buffer full via {@link DropCountingAppenderListener}).
 */
@Component
public class EventEmitter {

  private final Counter emitted;
  private final Counter dropped;
  private final AtomicLong windowStartMs = new AtomicLong(System.currentTimeMillis());
  private final AtomicLong windowCount = new AtomicLong();
  private volatile double maxSendEps = 2000;
  private long lastSeenTcpDrops;

  public EventEmitter(MeterRegistry registry) {
    this.emitted =
        Counter.builder("generator.events.emitted")
            .description("Synthetic log events successfully handed to Logback")
            .register(registry);
    this.dropped =
        Counter.builder("generator.events.dropped")
            .description("Synthetic log events dropped due to rate limit or full TCP buffer")
            .register(registry);
  }

  public void setMaxSendEps(double maxSendEps) {
    this.maxSendEps = Math.max(1.0, maxSendEps);
  }

  public double getMaxSendEps() {
    return maxSendEps;
  }

  public void emit(LogEvent event) {
    if (!tryAcquire()) {
      dropped.increment();
      return;
    }

    Logger logger = LoggerFactory.getLogger(event.logger());
    try {
      put(event);
      switch (event.level()) {
        case "DEBUG" -> logger.debug(event.message());
        case "WARN" -> logger.warn(event.message());
        case "ERROR" -> {
          if (event.exceptionClass() != null) {
            logger.error(event.message(), syntheticThrowable(event));
          } else {
            logger.error(event.message());
          }
        }
        default -> logger.info(event.message());
      }
      long tcpDrops = DropCountingAppenderListener.getDropped();
      long delta = tcpDrops - lastSeenTcpDrops;
      lastSeenTcpDrops = tcpDrops;
      if (delta > 0) {
        dropped.increment(delta);
      } else {
        emitted.increment();
      }
    } finally {
      MDC.clear();
    }
  }

  private boolean tryAcquire() {
    long now = System.currentTimeMillis();
    long start = windowStartMs.get();
    if (now - start >= 1000) {
      if (windowStartMs.compareAndSet(start, now)) {
        windowCount.set(0);
      }
    }
    long count = windowCount.incrementAndGet();
    return count <= maxSendEps;
  }

  private void put(LogEvent e) {
    MDC.put("event_id", e.eventId());
    MDC.put("ts", e.ts());
    MDC.put("ts_ms", Long.toString(e.tsMs()));
    MDC.put("service", e.service());
    MDC.put("version", e.version());
    MDC.put("env", e.env());
    MDC.put("host", e.host());
    MDC.put("region", e.region());
    MDC.put("trace_id", e.traceId());
    MDC.put("span_id", e.spanId());
    if (e.httpMethod() != null) {
      MDC.put("http_method", e.httpMethod());
    }
    if (e.httpPath() != null) {
      MDC.put("http_path", e.httpPath());
    }
    if (e.httpStatus() != null) {
      MDC.put("http_status", Integer.toString(e.httpStatus()));
    }
    if (e.durationMs() != null) {
      MDC.put("duration_ms", Integer.toString(e.durationMs()));
    }
    if (e.userId() != null) {
      MDC.put("user_id", e.userId());
    }
    if (e.clientIp() != null) {
      MDC.put("client_ip", e.clientIp());
    }
    if (e.exceptionClass() != null) {
      MDC.put("exception_class", e.exceptionClass());
    }
    if (e.scenario() != null) {
      MDC.put("scenario", e.scenario());
    }
  }

  private static Throwable syntheticThrowable(LogEvent event) {
    try {
      Class<?> clazz = Class.forName(mapException(event.exceptionClass()));
      return (Throwable) clazz.getDeclaredConstructor(String.class).newInstance(event.message());
    } catch (Exception ignored) {
      return new RuntimeException(event.message());
    }
  }

  private static String mapException(String name) {
    return switch (name) {
      case "NullPointerException" -> "java.lang.NullPointerException";
      default -> "java.lang.RuntimeException";
    };
  }
}
