package com.couchbase.logdemo.generator.emit;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.Appender;
import java.util.concurrent.atomic.AtomicLong;
import net.logstash.logback.appender.RingBufferFullException;
import net.logstash.logback.appender.listener.TcpAppenderListener;

/** Counts events dropped when the Logstash TCP ring buffer is full. */
public class DropCountingAppenderListener implements TcpAppenderListener<ILoggingEvent> {

  private static final AtomicLong DROPPED = new AtomicLong();

  @Override
  public void eventAppendFailed(Appender<ILoggingEvent> appender, ILoggingEvent event, Throwable reason) {
    if (reason instanceof RingBufferFullException) {
      DROPPED.incrementAndGet();
    }
  }

  public static long getDropped() {
    return DROPPED.get();
  }
}
