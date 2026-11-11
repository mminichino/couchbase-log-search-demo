package com.couchbase.logdemo.generator.sim.scenario;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import java.util.random.RandomGenerator;

public interface Scenario {

  String name();

  /** Mutate or replace a generated event while this scenario is active. */
  LogEvent apply(LogEvent event, RandomGenerator random);
}
