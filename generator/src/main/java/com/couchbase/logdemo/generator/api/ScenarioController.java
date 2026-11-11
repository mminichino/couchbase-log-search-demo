package com.couchbase.logdemo.generator.api;

import com.couchbase.logdemo.generator.sim.clock.SimClock;
import com.couchbase.logdemo.generator.sim.scenario.ScenarioManager;
import com.couchbase.logdemo.generator.sim.scenario.ScenarioManager.ScenarioStatus;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/scenarios")
public class ScenarioController {

  private final ScenarioManager scenarios;
  private final SimClock clock;

  public ScenarioController(ScenarioManager scenarios, SimClock clock) {
    this.scenarios = scenarios;
    this.clock = clock;
  }

  @GetMapping
  public List<ScenarioStatus> list() {
    return scenarios.list(now());
  }

  @PostMapping("/{name}/start")
  public Map<String, Object> start(
      @PathVariable String name,
      @RequestParam(defaultValue = "10") int durationMinutes) {
    try {
      Instant now = now();
      scenarios.start(name, durationMinutes, now);
      return Map.of(
          "name", name,
          "active", true,
          "durationMinutes", durationMinutes,
          "startedAt", now.toString());
    } catch (IllegalArgumentException e) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
    }
  }

  @PostMapping("/{name}/stop")
  public Map<String, Object> stop(@PathVariable String name) {
    scenarios.stop(name);
    return Map.of("name", name, "active", false);
  }

  private Instant now() {
    return clock.mode() == SimClock.Mode.LIVE ? Instant.now() : clock.instant();
  }
}
