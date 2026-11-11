package com.couchbase.logdemo.generator.sim.clock;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Virtual clock. Backfill advances simulated time independently of wall clock;
 * live mode tracks {@link Instant#now()}.
 */
public class SimClock {

  public enum Mode {
    BACKFILL,
    LIVE
  }

  private volatile Mode mode = Mode.BACKFILL;
  private final AtomicLong virtualEpochMs = new AtomicLong(0);

  public void startBackfill(Instant start) {
    mode = Mode.BACKFILL;
    virtualEpochMs.set(start.toEpochMilli());
  }

  public void advanceTo(Instant instant) {
    if (mode == Mode.BACKFILL) {
      virtualEpochMs.set(instant.toEpochMilli());
    }
  }

  public void advanceByMillis(long millis) {
    if (mode == Mode.BACKFILL) {
      virtualEpochMs.addAndGet(millis);
    }
  }

  public void switchToLive() {
    mode = Mode.LIVE;
    virtualEpochMs.set(System.currentTimeMillis());
  }

  public Mode mode() {
    return mode;
  }

  public Instant instant() {
    if (mode == Mode.LIVE) {
      return Instant.now();
    }
    return Instant.ofEpochMilli(virtualEpochMs.get());
  }

  public long epochMillis() {
    return instant().toEpochMilli();
  }
}
