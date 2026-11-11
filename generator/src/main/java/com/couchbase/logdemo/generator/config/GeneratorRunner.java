package com.couchbase.logdemo.generator.config;

import com.couchbase.logdemo.generator.emit.EventEmitter;
import com.couchbase.logdemo.generator.sim.clock.SimClock;
import com.couchbase.logdemo.generator.sim.engine.TrafficEngine;
import com.couchbase.logdemo.generator.sim.model.LogEvent;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class GeneratorRunner implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(GeneratorRunner.class);

  private final GeneratorProperties properties;
  private final TrafficEngine engine;
  private final EventEmitter emitter;
  private final SimClock clock;
  private final AtomicBoolean running = new AtomicBoolean(true);
  private final ExecutorService worker =
      Executors.newSingleThreadExecutor(
          r -> {
            Thread t = new Thread(r, "traffic-engine");
            t.setDaemon(true);
            return t;
          });

  public GeneratorRunner(
      GeneratorProperties properties,
      TrafficEngine engine,
      EventEmitter emitter,
      SimClock clock) {
    this.properties = properties;
    this.engine = engine;
    this.emitter = emitter;
    this.clock = clock;
  }

  @Override
  public void run(ApplicationArguments args) {
    worker.submit(this::loop);
  }

  @PreDestroy
  public void shutdown() {
    running.set(false);
    worker.shutdownNow();
  }

  public void setLiveEps(double eps) {
    properties.getLive().setEps(eps);
  }

  public double getLiveEps() {
    return properties.getLive().getEps();
  }

  private void loop() {
    String mode = properties.getMode();
    if ("disabled".equalsIgnoreCase(mode) || "none".equalsIgnoreCase(mode)) {
      log.info("Generator mode={}; traffic loop not started", mode);
      return;
    }
    try {
      emitter.setMaxSendEps(properties.getBackfill().getMaxSendEps());
      if ("backfill-then-live".equals(mode) || "backfill".equals(mode)) {
        runBackfill();
      }
      if ("backfill-then-live".equals(mode) || "live".equals(mode)) {
        runLive();
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      log.info("Generator loop interrupted");
    } catch (Exception e) {
      log.error("Generator loop failed", e);
    }
  }

  private void runBackfill() throws InterruptedException {
    int hours = properties.getBackfill().getHours();
    double avgEps = properties.getBackfill().getAvgEps();
    emitter.setMaxSendEps(properties.getBackfill().getMaxSendEps());
    engine.setDeterministicIds(true);

    Instant end = Instant.now();
    Instant start = end.minusSeconds(hours * 3600L);
    clock.startBackfill(start);
    log.info(
        "Starting backfill: {} hours from {} at avg {} eps (max send {})",
        hours,
        start,
        avgEps,
        properties.getBackfill().getMaxSendEps());

    double maxSendEps = properties.getBackfill().getMaxSendEps();
    long sent = 0;
    long windowStart = System.nanoTime();
    while (running.get() && clock.instant().isBefore(end)) {
      List<LogEvent> events = engine.nextRequest();
      for (LogEvent event : events) {
        // Pace wall-clock sends to max-send-eps so backfill is not rate-limit-dropped.
        sent++;
        long elapsedNs = System.nanoTime() - windowStart;
        long expectedNs = (long) (sent * 1_000_000_000.0 / maxSendEps);
        if (expectedNs > elapsedNs) {
          long sleepMs = (expectedNs - elapsedNs) / 1_000_000L;
          if (sleepMs > 0) {
            Thread.sleep(Math.min(sleepMs, 1000L));
          }
        }
        emitter.emit(event);
      }
      long gap = engine.nextInterArrivalMillis(avgEps, clock.instant());
      clock.advanceByMillis(gap);
    }
    log.info("Backfill complete; sequence={} sent≈{}", engine.sequence(), sent);
  }

  private void runLive() throws InterruptedException {
    emitter.setMaxSendEps(Math.max(properties.getLive().getEps() * 4, 100));
    engine.setDeterministicIds(false);
    clock.switchToLive();
    log.info("Entering live mode at {} eps", properties.getLive().getEps());

    while (running.get()) {
      double eps = properties.getLive().getEps();
      List<LogEvent> events = engine.nextRequest();
      for (LogEvent event : events) {
        // stamp live wall-clock time
        Instant now = Instant.now();
        LogEvent live =
            new LogEvent(
                event.eventId(),
                java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
                    .withZone(java.time.ZoneOffset.UTC)
                    .format(now),
                now.toEpochMilli(),
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
                event.scenario());
        emitter.emit(live);
      }
      long delayMs = engine.nextInterArrivalMillis(eps, Instant.now());
      Thread.sleep(Math.min(delayMs, 5_000L));
    }
  }
}
