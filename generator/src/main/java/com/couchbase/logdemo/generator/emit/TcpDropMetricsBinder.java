package com.couchbase.logdemo.generator.emit;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

@Component
public class TcpDropMetricsBinder {

  private final MeterRegistry registry;

  public TcpDropMetricsBinder(MeterRegistry registry) {
    this.registry = registry;
  }

  @PostConstruct
  public void bind() {
    Gauge.builder("generator.events.tcp_ring_dropped", () -> DropCountingAppenderListener.getDropped())
        .description("Events dropped by LogstashTcpSocketAppender due to full ring buffer")
        .register(registry);
  }
}
