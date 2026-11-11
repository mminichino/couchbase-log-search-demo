package com.couchbase.logdemo.generator.sim.scenario;

import com.couchbase.logdemo.generator.sim.model.LogEvent;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.random.RandomGenerator;
import org.springframework.stereotype.Component;

@Component
public class ScenarioManager {

  private final Map<String, Scenario> scenarios = new LinkedHashMap<>();
  private final Map<String, ActiveWindow> active = new ConcurrentHashMap<>();
  private final LatencyCreepScenario latencyCreep = new LatencyCreepScenario();

  public ScenarioManager(MeterRegistry meterRegistry) {
    register(new PaymentOutageScenario());
    register(latencyCreep);
    register(new AuthAttackScenario());
    register(new BadDeployScenario());
    Gauge.builder("generator.scenarios.active", active, Map::size)
        .description("Number of currently active scenarios")
        .register(meterRegistry);
  }

  private void register(Scenario scenario) {
    scenarios.put(scenario.name(), scenario);
  }

  public void start(String name, int durationMinutes, Instant now) {
    Scenario scenario = scenarios.get(name);
    if (scenario == null) {
      throw new IllegalArgumentException("Unknown scenario: " + name);
    }
    Instant until = now.plusSeconds(durationMinutes * 60L);
    active.put(name, new ActiveWindow(now, until));
    if (scenario instanceof LatencyCreepScenario creep) {
      creep.onStart(now);
    }
  }

  public void stop(String name) {
    active.remove(name);
    Scenario scenario = scenarios.get(name);
    if (scenario instanceof LatencyCreepScenario creep) {
      creep.onStop();
    }
  }

  public List<ScenarioStatus> list(Instant now) {
    expire(now);
    List<ScenarioStatus> out = new ArrayList<>();
    for (Scenario scenario : scenarios.values()) {
      ActiveWindow window = active.get(scenario.name());
      out.add(
          new ScenarioStatus(
              scenario.name(),
              window != null,
              window == null ? null : window.startedAt().toString(),
              window == null ? null : window.until().toString()));
    }
    return out;
  }

  public LogEvent applyActive(LogEvent event, Instant now, RandomGenerator random) {
    expire(now);
    LogEvent current = event;
    for (Map.Entry<String, ActiveWindow> entry : active.entrySet()) {
      Scenario scenario = scenarios.get(entry.getKey());
      if (scenario != null) {
        current = scenario.apply(current, random);
      }
    }
    return current;
  }

  public boolean isActive(String name, Instant now) {
    expire(now);
    return active.containsKey(name);
  }

  private void expire(Instant now) {
    active.entrySet().removeIf(e -> !now.isBefore(e.getValue().until()));
  }

  public record ActiveWindow(Instant startedAt, Instant until) {}

  public record ScenarioStatus(String name, boolean active, String startedAt, String until) {}
}
