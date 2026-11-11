package com.couchbase.logdemo.generator.config;

import com.couchbase.logdemo.generator.sim.clock.SimClock;
import com.couchbase.logdemo.generator.sim.engine.TrafficEngine;
import com.couchbase.logdemo.generator.sim.model.Topology;
import com.couchbase.logdemo.generator.sim.model.TopologyLoader;
import com.couchbase.logdemo.generator.sim.scenario.ScenarioManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GeneratorConfig {

  @Bean
  public Topology topology(GeneratorProperties properties) {
    return TopologyLoader.load(properties.getTopology());
  }

  @Bean
  public SimClock simClock() {
    return new SimClock();
  }

  @Bean
  public TrafficEngine trafficEngine(
      Topology topology,
      SimClock simClock,
      ScenarioManager scenarioManager,
      GeneratorProperties properties) {
    return new TrafficEngine(
        topology, simClock, scenarioManager, properties.getEnv(), properties.getSeed());
  }
}
